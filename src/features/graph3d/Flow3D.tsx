import { useCallback, useEffect, useRef } from 'react'
import { useViewStore } from '../../stores/viewStore'
import type { AgentNodeData, ToolNodeData } from '../graph/derive'
import { useFlowGraph } from '../graph/useFlowGraph'
import { css, hexToRgb, mix, shade, type RGB } from './paint'
import {
  centroid,
  clampPitch,
  fitDistance,
  project,
  type Camera,
  type Point3,
  type Projected,
} from './projection'
import {
  BOX_SIZE,
  boxFaces,
  buildScene,
  FACE_LIGHT,
  GROUND_Y,
  STATUS_COLOR,
  TOOL_COLOR,
  type SceneEdge,
  type SceneNode,
} from './scene'

const BG = '#0a0a0e'
const PANEL: RGB = [22, 22, 30]
const MUTED = '#8b8b9c'
const TEXT = '#f2f2f7'

/** 궤도 회전 · 휠 줌 · 클릭 선택이 되는 3D 뷰. 2D와 같은 레이아웃 좌표를 공유한다. */
export function Flow3D() {
  const { nodes, edges } = useFlowGraph()
  const select = useViewStore((s) => s.select)
  const selectedId = useViewStore((s) => s.selectedId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<Camera>({
    yaw: -0.62,
    pitch: 0.48,
    distance: 900,
    zoom: 1,
    target: { x: 0, y: 0, z: 0 },
  })

  // 렌더 루프가 최신 데이터를 refs로 읽는다. state가 바뀔 때마다 루프를 다시 걸지 않기 위해서.
  const sceneRef = useRef(buildScene(nodes, edges))
  sceneRef.current = buildScene(nodes, edges)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId

  /** 마지막 프레임의 노드 화면 좌표. 클릭 히트 테스트에 쓴다. */
  const hitsRef = useRef<Hit[]>([])

  // 그래프 규모가 바뀌면 카메라를 다시 맞춘다
  const fitKey = nodes.map((n) => n.id).join(',')
  useEffect(() => {
    const { points } = sceneRef.current
    if (points.length === 0) return
    camRef.current.target = centroid(points)
    camRef.current.distance = fitDistance(points)
  }, [fitKey])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const frame = (time: number) => {
      draw(ctx, width, height, camRef.current, sceneRef.current, selectedRef.current, time, hitsRef)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  // ---- 포인터: 드래그로 궤도 회전, 움직임이 없으면 클릭 선택 ----

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true

    camRef.current.yaw += dx * 0.006
    camRef.current.pitch = clampPitch(camRef.current.pitch + dy * 0.005)
    d.x = e.clientX
    d.y = e.clientY
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current
      drag.current = null
      if (!d || d.moved) return

      const rect = e.currentTarget.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      // 앞쪽 상자가 배열 뒤에 있으므로 역순으로 훑는다
      for (let i = hitsRef.current.length - 1; i >= 0; i--) {
        const h = hitsRef.current[i]
        if (px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1) {
          select(h.id.startsWith('tool:') ? null : h.id)
          return
        }
      }
      select(null)
    },
    [select],
  )

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const next = camRef.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08)
    camRef.current.zoom = Math.max(0.3, Math.min(3, next))
  }, [])

  return (
    <div className="flow3d">
      <canvas
        ref={canvasRef}
        className="flow3d__canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onWheel={onWheel}
      />
      <div className="flow3d__hint">드래그: 회전 · 휠: 확대 · 클릭: 선택</div>
    </div>
  )
}

// ------------------------------------------------------------------ 렌더링

type Scene = ReturnType<typeof buildScene>
interface Hit {
  id: string
  x0: number
  y0: number
  x1: number
  y1: number
}
type HitsRef = React.RefObject<Hit[]>

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cam: Camera,
  scene: Scene,
  selectedId: string | null,
  time: number,
  hitsRef: HitsRef,
) {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, height)

  if (scene.nodes.length === 0) {
    hitsRef.current = []
    return
  }

  drawGrid(ctx, cam, width, height, scene)
  for (const sn of scene.nodes) drawShadow(ctx, cam, width, height, sn)

  // 페인터 알고리즘: 엣지와 상자를 한 목록에 섞어 먼 것부터 그린다.
  interface Item {
    depth: number
    render: () => void
    hit?: Hit
  }
  const items: Item[] = []

  for (const edge of scene.edges) {
    const a = project(edge.from, cam, width, height)
    const b = project(edge.to, cam, width, height)
    if (!a || !b) continue
    items.push({ depth: (a.depth + b.depth) / 2, render: () => drawEdge(ctx, a, b, edge, time) })
  }

  for (const sn of scene.nodes) {
    const box = projectBox(sn, cam, width, height)
    if (!box) continue
    items.push({
      depth: box.center.depth,
      render: () => drawBox(ctx, box, sn, selectedId === sn.id),
      hit: { id: sn.id, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 },
    })
  }

  items.sort((a, b) => b.depth - a.depth)

  const hits: Hit[] = []
  for (const item of items) {
    item.render()
    if (item.hit) hits.push(item.hit)
  }
  hitsRef.current = hits
}

// ---- 상자 ----

interface ProjectedBox {
  /** 면마다 화면 좌표 4점 + 평균 깊이 + 광원 밝기 */
  faces: { pts: Projected[]; depth: number; light: number }[]
  center: Projected
  /** 화면상 외접 사각형 — 히트 테스트용 */
  x0: number
  y0: number
  x1: number
  y1: number
}

function projectBox(
  sn: SceneNode,
  cam: Camera,
  width: number,
  height: number,
): ProjectedBox | null {
  const size = sn.node.type === 'tool' ? BOX_SIZE.tool : BOX_SIZE.agent
  const center = project(sn.point, cam, width, height)
  if (!center) return null

  const faces: ProjectedBox['faces'] = []
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity

  const quads = boxFaces(sn.point, size.w, size.h, size.d)
  for (let i = 0; i < quads.length; i++) {
    const pts: Projected[] = []
    let sum = 0
    for (const corner of quads[i]) {
      const p = project(corner, cam, width, height)
      if (!p) return null
      pts.push(p)
      sum += p.depth
      if (p.sx < x0) x0 = p.sx
      if (p.sx > x1) x1 = p.sx
      if (p.sy < y0) y0 = p.sy
      if (p.sy > y1) y1 = p.sy
    }
    faces.push({ pts, depth: sum / pts.length, light: FACE_LIGHT[i] })
  }

  // 상자 안에서도 먼 면부터 칠해서 가까운 면이 덮게 한다
  faces.sort((a, b) => b.depth - a.depth)

  return { faces, center, x0, y0, x1, y1 }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  box: ProjectedBox,
  sn: SceneNode,
  selected: boolean,
) {
  const isTool = sn.node.type === 'tool'
  const data = sn.node.data as AgentNodeData | ToolNodeData
  const accentHex = isTool
    ? (TOOL_COLOR[(data as ToolNodeData).status] ?? MUTED)
    : (STATUS_COLOR[(data as AgentNodeData).status] ?? MUTED)
  const accent = hexToRgb(accentHex)

  // 몸통은 패널색에 상태색을 살짝 섞는다. 선택되면 더 진하게.
  const base = mix(PANEL, accent, selected ? 0.34 : isTool ? 0.14 : 0.2)

  if (selected) {
    ctx.save()
    ctx.shadowColor = accentHex
    ctx.shadowBlur = 22
  }

  for (const face of box.faces) {
    ctx.beginPath()
    ctx.moveTo(face.pts[0].sx, face.pts[0].sy)
    for (let i = 1; i < face.pts.length; i++) ctx.lineTo(face.pts[i].sx, face.pts[i].sy)
    ctx.closePath()

    ctx.fillStyle = css(shade(base, face.light))
    ctx.fill()

    // 모서리를 상태색으로 얇게 그어 입체감을 살린다
    ctx.strokeStyle = css(accent, selected ? 0.85 : 0.4)
    ctx.lineWidth = Math.max(0.5, (selected ? 1.4 : 0.9) * box.center.scale)
    ctx.stroke()
  }

  if (selected) ctx.restore()

  drawLabel(ctx, box, sn, accentHex, isTool)
}

/**
 * 라벨은 화면 정렬(빌보드)로 그린다.
 * 원근 사각형에 텍스트를 얹으려면 호모그래피가 필요한데, 캔버스 2D는 아핀까지만 지원해서
 * 각도가 커지면 글자가 뭉개진다. 상자는 입체로, 글자는 항상 읽히게 두는 쪽을 택했다.
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  box: ProjectedBox,
  sn: SceneNode,
  accentHex: string,
  isTool: boolean,
) {
  const { scale } = box.center
  const maxWidth = (box.x1 - box.x0) * 0.86
  if (maxWidth < 16) return

  const data = sn.node.data as AgentNodeData | ToolNodeData
  const label = isTool ? (data as ToolNodeData).name : (data as AgentNodeData).label

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = 5 * scale

  const size = Math.max(8, (isTool ? 10 : 12.5) * scale)
  ctx.font = `${isTool ? 500 : 650} ${size}px ui-sans-serif, -apple-system, system-ui, sans-serif`
  ctx.fillStyle = isTool ? MUTED : TEXT
  ctx.fillText(
    ellipsis(ctx, label, maxWidth),
    box.center.sx,
    box.center.sy - (isTool ? 0 : 7 * scale),
  )

  if (!isTool) {
    const agent = data as AgentNodeData
    ctx.font = `500 ${Math.max(7, 9.5 * scale)}px ui-monospace, monospace`
    ctx.fillStyle = accentHex
    const sub = agent.runningTool ? `⚙ ${agent.runningTool}` : agent.status
    ctx.fillText(ellipsis(ctx, sub, maxWidth), box.center.sx, box.center.sy + 9 * scale)
  }

  ctx.restore()
}

/** 바닥에 떨어지는 타원 그림자. 높이 차이를 읽게 해주는 가장 값싼 단서다. */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  width: number,
  height: number,
  sn: SceneNode,
) {
  const ground: Point3 = { x: sn.point.x, y: GROUND_Y, z: sn.point.z }
  const g = project(ground, cam, width, height)
  const top = project(sn.point, cam, width, height)
  if (!g || !top) return

  const size = sn.node.type === 'tool' ? BOX_SIZE.tool : BOX_SIZE.agent
  const rx = (size.w / 2) * g.scale
  const ry = (size.d / 2) * g.scale * Math.max(0.18, Math.abs(Math.sin(cam.pitch)))

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(g.sx, g.sy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.42)'
  ctx.filter = 'blur(1px)'
  ctx.fill()
  ctx.restore()

  // 상자에서 그림자로 내리는 실선 — 떠 있는 높이를 알려준다
  ctx.save()
  ctx.strokeStyle = 'rgba(150,150,190,0.16)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(top.sx, top.sy)
  ctx.lineTo(g.sx, g.sy)
  ctx.stroke()
  ctx.restore()
}

/** 바닥 격자. 공간의 기준면. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  width: number,
  height: number,
  scene: Scene,
) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of scene.points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const pad = 170
  minX -= pad
  maxX += pad
  minZ -= pad
  maxZ += pad

  const step = 120
  ctx.strokeStyle = 'rgba(120,120,150,0.11)'
  ctx.lineWidth = 1

  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const a = project({ x: x1, y: GROUND_Y, z: z1 }, cam, width, height)
    const b = project({ x: x2, y: GROUND_Y, z: z2 }, cam, width, height)
    if (!a || !b) return
    ctx.beginPath()
    ctx.moveTo(a.sx, a.sy)
    ctx.lineTo(b.sx, b.sy)
    ctx.stroke()
  }

  for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) line(x, minZ, x, maxZ)
  for (let z = Math.floor(minZ / step) * step; z <= maxZ; z += step) line(minX, z, maxX, z)
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  a: Projected,
  b: Projected,
  edge: SceneEdge,
  time: number,
) {
  const scale = (a.scale + b.scale) / 2

  ctx.save()
  if (edge.kind === 'tool') {
    ctx.setLineDash([4 * scale, 4 * scale])
    ctx.strokeStyle = 'rgba(140,140,170,0.4)'
    ctx.lineWidth = Math.max(0.6, 1.1 * scale)
  } else if (edge.kind === 'spawn') {
    ctx.strokeStyle = 'rgba(170,170,200,0.55)'
    ctx.lineWidth = Math.max(0.8, 1.6 * scale)
  } else {
    ctx.strokeStyle = edge.active ? '#3b82f6' : 'rgba(110,120,150,0.5)'
    ctx.lineWidth = Math.max(0.8, (edge.active ? 2.2 : 1.4) * scale)
  }

  ctx.beginPath()
  ctx.moveTo(a.sx, a.sy)
  ctx.lineTo(b.sx, b.sy)
  ctx.stroke()
  ctx.restore()

  // 흐르는 메시지는 선 위를 도는 점으로 (2D의 패킷 애니메이션과 같은 규칙)
  if (edge.kind === 'message' && edge.active) {
    const t = (time % 1200) / 1200
    ctx.beginPath()
    ctx.arc(
      a.sx + (b.sx - a.sx) * t,
      a.sy + (b.sy - a.sy) * t,
      Math.max(2, 3.6 * scale),
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = '#3b82f6'
    ctx.shadowColor = '#3b82f6'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.shadowBlur = 0
  }
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}
