import type { XYPosition } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRunState } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import { deriveGraph, isStructural, topologySignature, type AppEdge, type AppNode } from './derive'
import { layoutGraph } from './layout/elk'

/**
 * 이벤트 → 상태 → 그래프 → 좌표 파이프라인을 하나로 묶는 훅.
 *
 * 핵심: 레이아웃은 "위상 서명"이 바뀔 때만 다시 돈다.
 * 에이전트 status가 초당 여러 번 바뀌어도 노드가 춤추지 않는다.
 */
export function useFlowGraph(): { nodes: AppNode[]; edges: AppEdge[] } {
  const run = useRunState()
  const showTools = useViewStore((s) => s.showTools)
  const overrides = useViewStore((s) => s.positions)
  const selectedId = useViewStore((s) => s.selectedId)

  const { nodes: rawNodes, edges } = useMemo(
    () => deriveGraph(run, { showTools }),
    [run, showTools],
  )

  const signature = topologySignature(rawNodes, edges)
  const [layout, setLayout] = useState<Record<string, XYPosition>>({})
  const lastSignature = useRef('')
  const latest = useRef({ rawNodes, edges })
  latest.current = { rawNodes, edges }

  useEffect(() => {
    if (signature === lastSignature.current) return
    lastSignature.current = signature

    let alive = true
    const { rawNodes: n, edges: e } = latest.current
    layoutGraph(n, e).then(
      (positions) => {
        if (alive) setLayout(positions)
      },
      () => {
        /* 레이아웃 실패 시 이전 좌표 유지 */
      },
    )
    return () => {
      alive = false
    }
  }, [signature])

  const nodes = useMemo(() => {
    // 아직 좌표가 없는 새 노드는 자기를 가리키는 엣지의 source 옆에 임시 배치한다.
    // (0,0에 겹쳤다가 튀어나가는 깜빡임 방지)
    const incoming = new Map(edges.filter(isStructural).map((e) => [e.target, e.source]))
    const resolve = (id: string, depth = 0): XYPosition => {
      const known = overrides[id] ?? layout[id]
      if (known) return known
      const parent = incoming.get(id)
      if (parent && depth < 4) {
        const base = resolve(parent, depth + 1)
        return { x: base.x + 260, y: base.y }
      }
      return { x: 0, y: 0 }
    }

    return rawNodes.map((node) => ({
      ...node,
      position: resolve(node.id),
      selected: node.id === selectedId,
    })) as AppNode[]
  }, [rawNodes, edges, layout, overrides, selectedId])

  return { nodes, edges }
}
