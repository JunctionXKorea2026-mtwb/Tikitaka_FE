import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentFlowNode } from '../derive'
import { AgentCard } from './cards'

/** 2D 노드 = 공용 카드 + React Flow 핸들. 생김새는 전부 cards.tsx가 갖는다. */
export function AgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
  return (
    <AgentCard data={data} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </AgentCard>
  )
}
