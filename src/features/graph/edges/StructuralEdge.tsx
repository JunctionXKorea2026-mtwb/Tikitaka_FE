import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

/** 구조 엣지 팩토리: spawn(부모→자식), tool(에이전트→도구). 모양만 다르다. */
function structural(kind: 'spawn' | 'tool') {
  return function StructuralEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
  }: EdgeProps) {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    })
    return (
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className={`edge edge--${kind}`} />
    )
  }
}

export const SpawnEdge = structural('spawn')
export const ToolEdge = structural('tool')
