import type { XYPosition } from '@xyflow/react'
import type { ELK as ElkInstance, ElkNode } from 'elkjs/lib/elk-api'
import { isStructural, NODE_SIZE, type AppEdge, type AppNode } from '../derive'

/** elkjs는 ~1.4MB라 초기 번들에서 분리한다. 첫 레이아웃 때 한 번만 로드. */
let elkPromise: Promise<ElkInstance> | null = null

function getElk(): Promise<ElkInstance> {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default())
  return elkPromise
}

const OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90',
  'elk.spacing.nodeNode': '40',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // 노드가 추가돼도 기존 노드 순서를 최대한 유지 → 화면이 덜 튄다
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
}

/** 자동 배치 결과를 nodeId → 좌표 맵으로 돌려준다. */
export async function layoutGraph(
  nodes: AppNode[],
  edges: AppEdge[],
): Promise<Record<string, XYPosition>> {
  if (nodes.length === 0) return {}

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      ...NODE_SIZE[n.type ?? 'agent'],
    })),
    edges: edges.filter(isStructural).map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const elk = await getElk()
  const laid = await elk.layout(graph)
  const positions: Record<string, XYPosition> = {}
  for (const child of laid.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  }
  return positions
}
