import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentStatus } from '../../../entities/run'
import type { AgentFlowNode } from '../derive'

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: '실행 중',
  thinking: '사고 중',
  calling: '도구 호출',
  done: '완료',
  error: '오류',
}

const ROLE_LABEL = {
  orchestrator: 'ORCH',
  worker: 'WORK',
  critic: 'CRIT',
  router: 'ROUTE',
} as const

type AgentNodeProps = NodeProps<AgentFlowNode>

export function AgentNode({ data, selected }: AgentNodeProps) {
  const busy = data.status !== 'done' && data.status !== 'error'

  return (
    <div
      className={`node node--agent status-${data.status} role-${data.role}`}
      data-selected={selected || undefined}
    >
      <Handle type="target" position={Position.Left} />

      <header className="node__head">
        <span className="node__role">{ROLE_LABEL[data.role]}</span>
        <span className="node__title">{data.label}</span>
      </header>

      <div className="node__meta">
        <span className="node__status">
          {busy && <i className="pulse" aria-hidden />}
          {STATUS_LABEL[data.status]}
        </span>
        {data.duration !== undefined && (
          <span className="node__time">{data.duration.toFixed(1)}s</span>
        )}
      </div>

      <p className="node__detail">
        {data.runningTool
          ? `⚙ ${data.runningTool}`
          : (data.thought ?? (data.toolCount > 0 ? `도구 ${data.toolCount}회 호출` : '—'))}
      </p>

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
