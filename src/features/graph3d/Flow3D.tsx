import { useCallback, useEffect, useRef } from 'react'
import { useViewStore } from '../../stores/viewStore'
import type { AgentNodeData, ToolNodeData } from '../graph/derive'
import { useFlowGraph } from '../graph/useFlowGraph'
import {
  centroid,
  clampPitch,
  fitDistance,
  project,
  type Camera,
  type Projected,
} from './projection'
import { buildScene, STATUS_COLOR, TOOL_COLOR, type SceneEdge, type SceneNode } from './scene'

const BG = '#0a0a0e'
const PANEL = '#14141b'
const LINE = '#3a3a46'
const MUTED = '#8b8b9c'
const TEXT = '#e7e7ee'

/** 궤도 회전 · 휠 줌 · 클릭 선택이 되는 3D 뷰. 2D와 같은 레이아웃 좌표를 공유한다. */
export function Flow3D() {
  const { nodes, edges } = useFlowGraph()
  const select = useViewStore((s) => s.select)
  const selectedId = useViewStore((s) => s.selectedId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<Camera>({
    yaw: -0.62,
    pitch: 0.5,
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
  const hitsRef = useRef<{ id: string; sx: number; sy: number; r: number }[]>([])

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

      // 가장 가까운 노드를 고른다 (앞쪽 노드가 배열 뒤에 있으므로 역순 탐색)
      for (let i = hitsRef.current.length - 1; i >= 0; i--) {
        const hit = hitsRef.current[i]
        if (Math.hypot(hit.sx - px, hit.sy - py) <= hit.r) {
          select(hit.id.startsWith('tool:') ? null : hit.id)
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
type Hits = React.RefObject<{ id: string; sx: number; sy: number; r: number }[]>

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cam: Camera,
  scene: Scene,
  selectedId: string | null,
  time: number,
  hitsRef: Hits,
) {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, height)

  if (scene.nodes.length === 0) {
    hitsRef.current = []
    return
  }

  drawGrid(ctx, cam, width, height, scene)

  // 페인터 알고리즘: 먼 것부터 그린다. 엣지와 노드를 한 목록에 섞어 깊이로 정렬한다.
  type Item = { depth: number; render: () => void; hit?: { id: string; sx: number; sy: number; r: number } }
  const items: Item[] = []

  for (const edge of scene.edges) {
    const a = project(edge.from, cam, width, height)
    const b = project(edge.to, cam, width, height)
    if (!a || !b) continue
    const depth = (a.depth + b.depth) / 2
    items.push({ depth, render: () => drawEdge(ctx, a, b, edge, time) })
  }

  for (const sn of scene.nodes) {
    const p = project(sn.point, cam, width, height)
    if (!p) continue
    const isTool = sn.node.type === 'tool'
    const w = (isTool ? 116 : 156) * p.scale
    const h = (isTool ? 34 : 48) * p.scale
    items.push({
      depth: p.depth,
      render: () => drawNode(ctx, p, sn, selectedId === sn.id),
      hit: { id: sn.id, sx: p.sx, sy: p.sy, r: Math.max(w, h) / 2 },
    })
  }

  items.sort((a, b) => b.depth - a.depth)

  const hits: { id: string; sx: number; sy: number; r: number }[] = []
  for (const item of items) {
    item.render()
    if (item.hit) hits.push(item.hit)
  }
  hitsRef.current = hits
}

/** 에이전트 평면을 나타내는 바닥 격자. 공간감의 기준점. */
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
  const pad = 160
  minX -= pad
  maxX += pad
  minZ -= pad
  maxZ += pad

  const step = 120
  ctx.strokeStyle = 'rgba(120,120,150,0.10)'
  ctx.lineWidth = 1

  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const a = project({ x: x1, y: 0, z: z1 }, cam, width, height)
    const b = project({ x: x2, y: 0, z: z2 }, cam, width, height)
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
    ctx.strokeStyle = 'rgba(140,140,170,0.35)'
    ctx.lineWidth = Math.max(0.6, 1.1 * scale)
  } else if (edge.kind === 'spawn') {
    ctx.strokeStyle = 'rgba(160,160,190,0.5)'
    ctx.lineWidth = Math.max(0.8, 1.6 * scale)
  } else {
    ctx.strokeStyle = edge.active ? '#3b82f6' : 'rgba(110,120,150,0.45)'
    ctx.lineWidth = Math.max(0.8, (edge.active ? 2.2 : 1.4) * scale)
  }

  ctx.beginPath()
  ctx.moveTo(a.sx, a.sy)
  ctx.lineTo(b.sx, b.sy)
  ctx.stroke()
  ctx.restore()

  // 흐르는 메시지는 선 위를 도는 점으로 보여준다 (2D의 패킷 애니메이션과 같은 규칙)
  if (edge.kind === 'message' && edge.active) {
    const t = ((time % 1200) / 1200)
    const px = a.sx + (b.sx - a.sx) * t
    const py = a.sy + (b.sy - a.sy) * t
    ctx.beginPath()
    ctx.arc(px, py, Math.max(2, 3.6 * scale), 0, Math.PI * 2)
    ctx.fillStyle = '#3b82f6'
    ctx.shadowColor = '#3b82f6'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.shadowBlur = 0
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  p: Projected,
  sn: SceneNode,
  selected: boolean,
) {
  const isTool = sn.node.type === 'tool'
  const w = (isTool ? 116 : 156) * p.scale
  const h = (isTool ? 34 : 48) * p.scale
  const r = (isTool ? 7 : 9) * p.scale
  const x = p.sx - w / 2
  const y = p.sy - h / 2

  const data = sn.node.data as AgentNodeData | ToolNodeData
  const accent = isTool
    ? (TOOL_COLOR[(data as ToolNodeData).status] ?? MUTED)
    : (STATUS_COLOR[(data as AgentNodeData).status] ?? MUTED)

  // 바닥으로 내리는 기둥 — 높이 차이를 읽히게 한다
  if (isTool) {
    ctx.save()
    ctx.strokeStyle = 'rgba(140,140,170,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.sx, p.sy)
    ctx.lineTo(p.sx, p.sy - 26 * p.scale)
    ctx.stroke()
    ctx.restore()
  }

  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = PANEL
  ctx.fill()
  ctx.strokeStyle = selected ? accent : LINE
  ctx.lineWidth = selected ? 2.4 * p.scale : 1.1 * p.scale
  if (selected) {
    ctx.shadowColor = accent
    ctx.shadowBlur = 14
  }
  ctx.stroke()
  ctx.shadowBlur = 0

  // 좌측 상태 띠
  roundRect(ctx, x, y, Math.max(2, 3.5 * p.scale), h, r)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.restore()

  const fontSize = Math.max(8, (isTool ? 10 : 12) * p.scale)
  ctx.font = `${isTool ? 400 : 600} ${fontSize}px ui-sans-serif, -apple-system, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = isTool ? MUTED : TEXT

  const label = isTool ? (data as ToolNodeData).name : (data as AgentNodeData).label
  const padX = 10 * p.scale
  ctx.fillText(
    ellipsis(ctx, label, w - padX * 2),
    x + padX,
    isTool ? p.sy : p.sy - 7 * p.scale,
  )

  if (!isTool) {
    const agent = data as AgentNodeData
    ctx.font = `400 ${Math.max(7, 9.5 * p.scale)}px ui-monospace, monospace`
    ctx.fillStyle = accent
    const sub = agent.runningTool ? `⚙ ${agent.runningTool}` : agent.status
    ctx.fillText(ellipsis(ctx, sub, w - padX * 2), x + padX, p.sy + 9 * p.scale)
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
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
