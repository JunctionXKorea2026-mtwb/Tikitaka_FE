import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ToolFlowNode } from '../derive'

type ToolNodeProps = NodeProps<ToolFlowNode>

const MARK = { running: '···', ok: '✓', error: '✕' } as const

export function ToolNode({ data }: ToolNodeProps) {
  return (
    <div className={`node node--tool tool-${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <span className="tool__mark">{MARK[data.status]}</span>
      <span className="tool__name">{data.name}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
