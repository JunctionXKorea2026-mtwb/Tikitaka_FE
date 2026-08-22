import type { AppEdge, AppNode } from '../graph/derive'

/**
 * 2D 레이아웃(ELK 결과)을 3D 공간에 배치한다.
 *
 * ELK의 x는 파이프라인 진행 방향, y는 형제 노드가 퍼지는 축이다.
 * 3D에서는 y를 깊이(z)로 보내서 에이전트들이 한 평면에 서고,
 * 도구 노드만 그 아래로 내려가게 한다. 계층이 한눈에 읽힌다.
 *
 * 좌표 단위는 CSS px 그대로다 — 2D 카드 크기와 같은 척도라 별도 환산이 없다.
 */

export interface Point3 {
  x: number
  y: number
  z: number
}

/** 도구 노드가 에이전트 평면 아래로 내려가는 높이 */
export const TOOL_DROP = 150
/** 바닥 격자와 그림자가 놓이는 높이 (모든 노드보다 아래) */
export const GROUND_Y = 260

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

export interface Scene {
  nodes: SceneNode[]
  edges: SceneEdge[]
  center: Point3
  /** 바운딩 박스 크기. 화면에 맞추는 배율을 정하는 데 쓴다. */
  size: { w: number; h: number; d: number }
}

export function buildScene(nodes: AppNode[], edges: AppEdge[]): Scene {
  const points = new Map<string, Point3>()
  const sceneNodes: SceneNode[] = []

  for (const node of nodes) {
    const point: Point3 = {
      x: node.position.x,
      y: node.type === 'tool' ? TOOL_DROP : 0,
      z: node.position.y,
    }
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

  return { nodes: sceneNodes, edges: sceneEdges, ...bounds([...points.values()]) }
}

function bounds(points: Point3[]): { center: Point3; size: { w: number; h: number; d: number } } {
  if (points.length === 0) {
    return { center: { x: 0, y: 0, z: 0 }, size: { w: 0, h: 0, d: 0 } }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }

  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    size: { w: maxX - minX, h: maxY - minY, d: maxZ - minZ },
  }
}

/**
 * 시작점에서 끝점으로 향하는 막대의 CSS 변환.
 *
 * 기본 상태의 요소는 왼쪽 끝을 원점으로 +X 방향으로 뻗어 있다.
 * rotateY로 수평 방향을, rotateZ로 기울기를 맞춘다.
 *   rotateY(θ) rotateZ(φ) 를 적용하면 +X가 (cosφ·cosθ, sinφ, −cosφ·sinθ)로 간다.
 */
export function segmentTransform(from: Point3, to: Point3): { length: number; transform: string } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const length = Math.hypot(dx, dy, dz)
  if (length < 0.001) {
    return { length: 0, transform: `translate3d(${from.x}px, ${from.y}px, ${from.z}px)` }
  }

  const yaw = Math.atan2(-dz, dx)
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)))

  return {
    length,
    transform:
      `translate3d(${from.x}px, ${from.y}px, ${from.z}px)` +
      ` rotateY(${yaw}rad) rotateZ(${pitch}rad)`,
  }
}
