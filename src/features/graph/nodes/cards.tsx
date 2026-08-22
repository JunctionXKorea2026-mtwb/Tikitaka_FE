import type { ReactNode } from 'react'
import type { AgentStatus } from '../../../entities/run'
import type { AgentNodeData, ToolNodeData } from '../derive'

/**
 * 노드의 "생김새"만 담당하는 순수 컴포넌트.
 *
 * React Flow(Handle)에서 떼어낸 이유는 3D 뷰가 같은 카드를 그대로 쓰기 위해서다.
 * 두 뷰가 이 파일 하나를 공유하므로 디자인이 갈라질 수 없다.
 */

export const STATUS_LABEL: Record<AgentStatus, string> = {
  running: '실행 중',
  thinking: '사고 중',
  calling: '도구 호출',
  done: '완료',
  error: '오류',
}

export const ROLE_LABEL = {
  orchestrator: 'ORCH',
  worker: 'WORK',
  critic: 'CRIT',
  router: 'ROUTE',
} as const

interface AgentCardProps {
  data: AgentNodeData
  selected?: boolean
  /** React Flow의 Handle 등, 카드 안에 얹을 것 */
  children?: ReactNode
}

export function AgentCard({ data, selected, children }: AgentCardProps) {
  const busy = data.status !== 'done' && data.status !== 'error'

  return (
    <div
      className={`node node--agent status-${data.status} role-${data.role}`}
      data-selected={selected || undefined}
    >
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

      {children}
    </div>
  )
}

const TOOL_MARK = { running: '···', ok: '✓', error: '✕' } as const

export function ToolCard({ data, children }: { data: ToolNodeData; children?: ReactNode }) {
  return (
    <div className={`node node--tool tool-${data.status}`}>
      <span className="tool__mark">{TOOL_MARK[data.status]}</span>
      <span className="tool__name">{data.name}</span>
      {children}
    </div>
  )
}
