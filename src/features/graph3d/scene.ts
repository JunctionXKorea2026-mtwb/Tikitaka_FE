import type { AppEdge, AppNode } from '../graph/derive'
import type { Point3 } from './projection'

/**
 * 2D 레이아웃(ELK 결과)을 3D 공간에 배치한다.
 *
 * ELK의 x는 파이프라인 진행 방향, y는 형제 노드가 퍼지는 축이다.
 * 3D에서는 y를 깊이(z)로 보내서 에이전트들이 한 평면에 눕고,
 * 도구 노드만 그 아래로 내려가게 한다. 계층이 한눈에 읽힌다.
 */

/** 도구 노드가 에이전트 평면 아래로 내려가는 높이 */
export const TOOL_DROP = 130
/** 바닥 격자와 그림자가 놓이는 높이 (모든 상자보다 아래) */
export const GROUND_Y = 250

/** 상자 크기 (월드 단위). 원근에 따라 자연스럽게 줄어든다. */
export const BOX_SIZE = {
  agent: { w: 150, h: 40, d: 84 },
  tool: { w: 104, h: 26, d: 58 },
} as const

export function toPoint3(node: AppNode): Point3 {
  return {
    x: node.position.x,
    y: node.type === 'tool' ? TOOL_DROP : 0,
    z: node.position.y,
  }
}

/**
 * 직육면체의 6면을 월드 좌표 사각형으로 돌려준다.
 *
 * 면을 골라내지(back-face culling) 않고 6면을 전부 그린 뒤 깊이순으로 덮어쓴다.
 * 볼록한 불투명 상자에서는 이게 결과가 같으면서 와인딩 실수가 생길 여지가 없다.
 */
export function boxFaces(c: Point3, w: number, h: number, d: number): Point3[][] {
  const x0 = c.x - w / 2
  const x1 = c.x + w / 2
  const y0 = c.y - h / 2 // 위 (화면에서 y는 아래로 증가)
  const y1 = c.y + h / 2 // 아래
  const z0 = c.z - d / 2
  const z1 = c.z + d / 2

  const p = (x: number, y: number, z: number): Point3 => ({ x, y, z })

  return [
    [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], // 윗면
    [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], // 아랫면
    [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], // 앞면 (+z)
    [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], // 뒷면 (−z)
    [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)], // 좌면
    [p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)], // 우면
  ]
}

/** 위에서 비추는 고정 광원 기준 면별 밝기. 윗면이 가장 밝다. */
export const FACE_LIGHT = [1.42, 0.55, 1.0, 0.72, 0.82, 0.92]

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
