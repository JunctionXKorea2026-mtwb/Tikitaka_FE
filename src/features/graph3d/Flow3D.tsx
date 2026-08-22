import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useViewStore } from '../../stores/viewStore'
import type { AgentNodeData, ToolNodeData } from '../graph/derive'
import { AgentCard, ToolCard } from '../graph/nodes/cards'
import { useFlowGraph } from '../graph/useFlowGraph'
import { buildScene, GROUND_Y, segmentTransform, type Point3, type SceneNode } from './scene'

/**
 * 3D 뷰.
 *
 * canvas에 다시 그리지 않고 **2D와 같은 카드 컴포넌트를 CSS 3D 공간에 세운다.**
 * 그래서 디자인이 두 뷰에서 갈라질 수가 없고, 글자도 브라우저가 렌더해 항상 선명하다.
 * 카드는 상자의 앞면이고, 나머지 다섯 면이 두께를 만든다.
 */

/** 카드 실제 크기 (graph.css의 .node--agent / .node--tool 과 일치해야 한다) */
const CARD = {
  agent: { w: 210, h: 88, d: 26 },
  tool: { w: 150, h: 40, d: 16 },
} as const

const PITCH_LIMIT = Math.PI / 2 - 0.15

export function Flow3D() {
  const { nodes, edges } = useFlowGraph()
  const scene = useMemo(() => buildScene(nodes, edges), [nodes, edges])

  const select = useViewStore((s) => s.select)
  const selectedId = useViewStore((s) => s.selectedId)

  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const cam = useRef({ yaw: -0.5, pitch: 0.38, zoom: 1 })
  const [fit, setFit] = useState(1)

  const centerRef = useRef<Point3>(scene.center)
  centerRef.current = scene.center
  const fitRef = useRef(fit)
  fitRef.current = fit

  /** 드래그 중 React를 거치지 않도록 변환을 직접 쓴다. */
  const apply = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const { yaw, pitch, zoom } = cam.current
    const c = centerRef.current
    const s = zoom * fitRef.current
    el.style.transform =
      `scale3d(${s}, ${s}, ${s})` +
      ` rotateX(${pitch}rad) rotateY(${yaw}rad)` +
      ` translate3d(${-c.x}px, ${-c.y}px, ${-c.z}px)`
  }, [])

  // 그래프가 뷰포트에 들어오도록 배율을 맞춘다
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const recompute = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || scene.nodes.length === 0) return
      const spanX = scene.size.w + CARD.agent.w + 160
      const spanY = scene.size.h + scene.size.d * 0.7 + CARD.agent.h + 200
      setFit(Math.max(0.28, Math.min(1, Math.min(width / spanX, height / spanY))))
    }

    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    recompute()
    return () => observer.disconnect()
  }, [scene.size.w, scene.size.h, scene.size.d, scene.nodes.length])

  useEffect(apply, [apply, fit, scene.center])

  // ---- 드래그 회전 / 휠 줌 ----

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true

    cam.current.yaw += dx * 0.006
    cam.current.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, cam.current.pitch + dy * 0.005),
    )
    d.x = e.clientX
    d.y = e.clientY
    apply()
  }

  const onPointerUp = () => {
    // 회전했다면 곧바로 오는 click을 선택으로 처리하지 않는다
    suppressClick.current = Boolean(drag.current?.moved)
    drag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    cam.current.zoom = Math.max(0.35, Math.min(3, cam.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
    apply()
  }

  const onNodeClick = (sn: SceneNode) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    select(sn.node.type === 'tool' ? null : sn.id)
  }

  const gridSpan = Math.max(scene.size.w, scene.size.d) + 900

  return (
    <div
      ref={viewportRef}
      className="flow3d"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onClick={() => {
        if (suppressClick.current) suppressClick.current = false
        else select(null)
      }}
    >
      <div ref={stageRef} className="flow3d__stage">
        <div
          className="grid3d"
          style={{
            width: `${gridSpan}px`,
            height: `${gridSpan}px`,
            marginLeft: `${-gridSpan / 2}px`,
            marginTop: `${-gridSpan / 2}px`,
            transform: `translate3d(${scene.center.x}px, ${GROUND_Y}px, ${scene.center.z}px) rotateX(90deg)`,
          }}
        />

        {scene.nodes.map((sn) => (
          <Drop key={`drop-${sn.id}`} point={sn.point} isTool={sn.node.type === 'tool'} />
        ))}

        {scene.edges.map((edge) => {
          const { length, transform } = segmentTransform(edge.from, edge.to)
          return (
            <div
              key={edge.id}
              className={`e3d e3d--${edge.kind}${edge.active ? ' is-active' : ''}`}
              style={{ width: `${length}px`, transform }}
            >
              {edge.kind === 'message' && edge.active && <i className="e3d__packet" />}
            </div>
          )
        })}

        {scene.nodes.map((sn) => (
          <Box key={sn.id} sn={sn} selected={selectedId === sn.id} onSelect={onNodeClick} />
        ))}
      </div>

      <div className="flow3d__hint">드래그: 회전 · 휠: 확대 · 클릭: 선택</div>
    </div>
  )
}

/** 상자 = 2D 카드(앞면) + 두께를 만드는 다섯 면. */
function Box({
  sn,
  selected,
  onSelect,
}: {
  sn: SceneNode
  selected: boolean
  onSelect: (sn: SceneNode) => void
}) {
  const isTool = sn.node.type === 'tool'
  const size = isTool ? CARD.tool : CARD.agent
  const data = sn.node.data as AgentNodeData | ToolNodeData

  const statusClass = isTool
    ? `tool-${(data as ToolNodeData).status}`
    : `status-${(data as AgentNodeData).status}`

  const style = {
    transform: `translate3d(${sn.point.x}px, ${sn.point.y}px, ${sn.point.z}px)`,
    '--w': `${size.w}px`,
    '--h': `${size.h}px`,
    '--d': `${size.d}px`,
  } as CSSProperties

  return (
    <div
      className={`n3d ${statusClass}${selected ? ' is-selected' : ''}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(sn)
      }}
    >
      <div className="n3d__face n3d__back" />
      <div className="n3d__face n3d__left" />
      <div className="n3d__face n3d__right" />
      <div className="n3d__face n3d__top" />
      <div className="n3d__face n3d__bottom" />
      <div className="n3d__face n3d__front">
        {isTool ? (
          <ToolCard data={data as ToolNodeData} />
        ) : (
          <AgentCard data={data as AgentNodeData} selected={selected} />
        )}
      </div>
    </div>
  )
}

/** 바닥 그림자 + 상자에서 내려오는 낙하선. 높이 차이를 읽게 해준다. */
function Drop({ point, isTool }: { point: Point3; isTool: boolean }) {
  const ground: Point3 = { x: point.x, y: GROUND_Y, z: point.z }
  const { length, transform } = segmentTransform(point, ground)
  const size = isTool ? CARD.tool : CARD.agent

  return (
    <>
      <div className="drop3d" style={{ width: `${length}px`, transform }} />
      <div
        className="shadow3d"
        style={{
          width: `${size.w}px`,
          height: `${size.d * 2.4}px`,
          marginLeft: `${-size.w / 2}px`,
          marginTop: `${-size.d * 1.2}px`,
          transform: `translate3d(${ground.x}px, ${ground.y}px, ${ground.z}px) rotateX(90deg)`,
        }}
      />
    </>
  )
}
