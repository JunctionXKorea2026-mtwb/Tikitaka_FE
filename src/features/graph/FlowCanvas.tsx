import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useCallback } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { edgeTypes } from './edges'
import { nodeTypes } from './nodes'
import { useFlowGraph } from './useFlowGraph'

const MINIMAP_COLOR: Record<string, string> = {
  running: '#3b82f6',
  thinking: '#f59e0b',
  calling: '#a855f7',
  done: '#22c55e',
  error: '#ef4444',
}

export function FlowCanvas() {
  const { nodes, edges } = useFlowGraph()
  const select = useViewStore((s) => s.select)
  const setPosition = useViewStore((s) => s.setPosition)

  /**
   * 노드는 파생 상태이므로 React Flow에 변경 권한을 주지 않는다.
   * 사용자가 끈 좌표만 viewStore에 오버라이드로 기록한다.
   */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          setPosition(change.id, change.position)
        }
      }
    },
    [setPosition],
  )

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => select(node.type === 'agent' ? node.id : null),
    [select],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onPaneClick={() => select(null)}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      proOptions={{ hideAttribution: false }}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#26262e" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => MINIMAP_COLOR[String(n.data?.status ?? '')] ?? '#4b5563'}
        maskColor="rgba(10,10,14,0.7)"
      />
    </ReactFlow>
  )
}
