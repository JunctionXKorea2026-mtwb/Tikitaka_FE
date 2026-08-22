/**
 * 백엔드가 흘려보내는 이벤트 스키마.
 *
 * 이 파일이 프론트와 백엔드의 유일한 계약이다.
 * mock JSON도, 나중에 붙을 실제 API도 이 타입만 만족하면 된다.
 */

export type AgentRole = 'orchestrator' | 'worker' | 'critic' | 'router'

export type AgentEvent =
  | {
      type: 'agent.started'
      ts: number
      agentId: string
      label: string
      role: AgentRole
      /** 이 에이전트를 띄운 상위 에이전트 (루트면 없음) */
      parentId?: string
    }
  | {
      type: 'agent.thinking'
      ts: number
      agentId: string
      /** 사고 과정 요약 한 줄 (인스펙터에 노출) */
      summary?: string
    }
  | {
      type: 'tool.called'
      ts: number
      agentId: string
      callId: string
      toolName: string
      input: unknown
    }
  | {
      type: 'tool.result'
      ts: number
      agentId: string
      callId: string
      output: unknown
      error?: string
    }
  | {
      type: 'message.sent'
      ts: number
      from: string
      to: string
      content: string
    }
  | {
      type: 'agent.finished'
      ts: number
      agentId: string
      status: 'ok' | 'error'
      /** 최종 산출물 또는 에러 메시지 */
      result?: string
      tokens?: number
    }

export type AgentEventType = AgentEvent['type']

/** mock/*.json 파일 하나의 형태. API의 `GET /runs/:id` 응답과 동일하게 맞춰둔다. */
export interface RunFixture {
  runId: string
  title: string
  events: AgentEvent[]
}
