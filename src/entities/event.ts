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
      /** 한 줄 요약 (노드 카드에 노출) */
      summary?: string
      /** 발언·사고의 전문. 인스펙터에서 펼쳐 읽는다. */
      detail?: string
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

/**
 * 실행 하나의 이벤트 묶음.
 *
 * mock 모드에서 `transport/scenario.ts`가 메모리에 만들어 쓴다.
 * 파일로 저장하지 않는다 — 프롬프트마다 시나리오가 새로 생기기 때문이다.
 */
export interface RunFixture {
  runId: string
  title: string
  events: AgentEvent[]
}
