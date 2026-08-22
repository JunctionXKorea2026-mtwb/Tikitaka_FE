import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { MessageEdgeData } from '../derive'

/**
 * 에이전트 간 메시지 엣지.
 *
 * React Flow 기본 `animated: true`(점선 흐름)보다, path 위를 도는 점 하나가
 * "지금 이 방향으로 무언가 전달되는 중"을 훨씬 직관적으로 보여준다.
 */
export function MessageEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const { count = 0, active = false, lastContent = '' } = (data ?? {}) as Partial<MessageEdgeData>

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`edge edge--message${active ? ' is-active' : ''}`}
      />

      {active && (
        // path가 바뀌면 animateMotion을 다시 마운트시켜야 새 경로를 탄다
        <circle key={edgePath} className="edge__packet" r={4}>
          <animateMotion dur="1.2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      <EdgeLabelRenderer>
        <div
          className={`edge__label${active ? ' is-active' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={lastContent}
        >
          {count > 1 ? `${count} msgs` : 'msg'}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
