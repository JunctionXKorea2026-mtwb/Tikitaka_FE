import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useCallback } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { edgeTypes } from './edges'
import { nodeTypes } from './nodes'
import { useFlowGraph } from './useFlowGraph'

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
    </ReactFlow>
  )
}
