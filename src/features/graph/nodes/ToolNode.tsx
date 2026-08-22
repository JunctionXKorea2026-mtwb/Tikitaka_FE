import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ToolFlowNode } from '../derive'
import { ToolCard } from './cards'

export function ToolNode({ data }: NodeProps<ToolFlowNode>) {
  return (
    <ToolCard data={data}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </ToolCard>
  )
}
