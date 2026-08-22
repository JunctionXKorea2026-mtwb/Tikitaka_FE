import type { AgentEvent, AgentRole } from './event'

/**
 * 이벤트를 접어서(fold) 만든 "현재 시점의 실행 상태".
 * React Flow를 전혀 모르는 순수 도메인 모델이다.
 */

export type AgentStatus = 'running' | 'thinking' | 'calling' | 'done' | 'error'

export interface ToolCall {
  callId: string
  toolName: string
  input: unknown
  output?: unknown
  error?: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'ok' | 'error'
}

export interface LogEntry {
  ts: number
  kind: AgentEvent['type']
  text: string
}

export interface AgentState {
  id: string
  label: string
  role: AgentRole
  parentId?: string
  status: AgentStatus
  startedAt: number
  finishedAt?: number
  thought?: string
  result?: string
  tokens?: number
  calls: ToolCall[]
  log: LogEntry[]
}

/** 같은 (from, to) 쌍의 메시지는 한 엣지로 접어서 카운트만 올린다. 엣지 폭발 방지. */
export interface MessageLink {
  id: string
  from: string
  to: string
  count: number
  lastTs: number
  lastContent: string
}

export interface RunState {
  runId: string
  /** 등장 순서 (레이아웃 안정성을 위해 유지) */
  agentOrder: string[]
  agents: Record<string, AgentState>
  links: Record<string, MessageLink>
  /** 적용된 마지막 이벤트의 ts. 엣지 "최근 활성" 판정에 쓴다. */
  clock: number
}

export const emptyRun = (runId = ''): RunState => ({
  runId,
  agentOrder: [],
  agents: {},
  links: {},
  clock: 0,
})

/**
 * 부모가 없는 최상위 에이전트. 이 에이전트의 result가 곧 실행의 최종 답변이다.
 * (여러 개면 먼저 등장한 쪽 — 현실적으로 루트는 하나다)
 */
export function rootAgent(run: RunState): AgentState | undefined {
  for (const id of run.agentOrder) {
    const agent = run.agents[id]
    if (agent && !agent.parentId) return agent
  }
  return undefined
}

export interface RunTotals {
  agents: number
  toolCalls: number
  failedCalls: number
  tokens: number
  elapsed: number
}

export function runTotals(run: RunState): RunTotals {
  let toolCalls = 0
  let failedCalls = 0
  let tokens = 0

  for (const id of run.agentOrder) {
    const agent = run.agents[id]
    if (!agent) continue
    toolCalls += agent.calls.length
    failedCalls += agent.calls.filter((c) => c.status === 'error').length
    tokens += agent.tokens ?? 0
  }

  return {
    agents: run.agentOrder.length,
    toolCalls,
    failedCalls,
    tokens,
    elapsed: run.clock,
  }
}
