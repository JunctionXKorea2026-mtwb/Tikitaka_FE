import type { AppEdge, AppNode } from '../graph/derive'
import type { Point3 } from './projection'

/**
 * 2D 레이아웃(ELK 결과)을 3D 공간에 배치한다.
 *
 * ELK의 x는 파이프라인 진행 방향, y는 형제 노드가 퍼지는 축이다.
 * 3D에서는 y를 깊이(z)로 보내서 에이전트들이 한 평면에 눕고,
 * 도구 노드만 그 아래로 내려가게 한다. 계층이 한눈에 읽힌다.
 */

export const TOOL_DROP = 150

export function toPoint3(node: AppNode): Point3 {
  return {
    x: node.position.x,
    y: node.type === 'tool' ? TOOL_DROP : 0,
    z: node.position.y,
  }
}

export interface SceneNode {
  id: string
  point: Point3
  node: AppNode
}

export interface SceneEdge {
  id: string
  from: Point3
  to: Point3
  kind: 'spawn' | 'tool' | 'message'
  active: boolean
}

export function buildScene(
  nodes: AppNode[],
  edges: AppEdge[],
): { nodes: SceneNode[]; edges: SceneEdge[]; points: Point3[] } {
  const points = new Map<string, Point3>()
  const sceneNodes: SceneNode[] = []

  for (const node of nodes) {
    const point = toPoint3(node)
    points.set(node.id, point)
    sceneNodes.push({ id: node.id, point, node })
  }

  const sceneEdges: SceneEdge[] = []
  for (const edge of edges) {
    const from = points.get(edge.source)
    const to = points.get(edge.target)
    if (!from || !to) continue

    const kind = edge.type === 'spawn' || edge.type === 'tool' ? edge.type : 'message'
    sceneEdges.push({
      id: edge.id,
      from,
      to,
      kind,
      active: kind === 'message' && Boolean((edge.data as { active?: boolean })?.active),
    })
  }

  return { nodes: sceneNodes, edges: sceneEdges, points: [...points.values()] }
}

export const STATUS_COLOR: Record<string, string> = {
  running: '#3b82f6',
  thinking: '#f59e0b',
  calling: '#a855f7',
  done: '#22c55e',
  error: '#ef4444',
}

export const TOOL_COLOR: Record<string, string> = {
  running: '#a855f7',
  ok: '#22c55e',
  error: '#ef4444',
}
