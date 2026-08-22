import type { AgentEvent } from './event'
import { emptyRun, type AgentState, type RunState } from './run'

/**
 * 순수 리듀서: 이벤트 배열 → 실행 상태.
 *
 * 순수하기 때문에 (1) 타임라인 스크럽이 `events.slice(0, cursor)` 한 줄로 끝나고
 * (2) 테스트가 쉽고 (3) 라이브/리플레이가 같은 코드 경로를 쓴다.
 */
export function reduceEvents(runId: string, events: AgentEvent[]): RunState {
  const state = emptyRun(runId)

  for (const ev of events) {
    state.clock = Math.max(state.clock, ev.ts)

    switch (ev.type) {
      case 'agent.started': {
        if (state.agents[ev.agentId]) break
        const agent: AgentState = {
          id: ev.agentId,
          label: ev.label,
          role: ev.role,
          parentId: ev.parentId,
          status: 'running',
          startedAt: ev.ts,
          calls: [],
          log: [{ ts: ev.ts, kind: ev.type, text: `${ev.label} 시작` }],
          speeches: [],
        }
        state.agents[ev.agentId] = agent
        state.agentOrder.push(ev.agentId)
        break
      }

      case 'agent.thinking': {
        const agent = state.agents[ev.agentId]
        if (!agent) break
        agent.status = 'thinking'
        agent.thought = ev.summary
        agent.log.push({ ts: ev.ts, kind: ev.type, text: ev.summary ?? '사고 중' })
        // 전문이 오면 따로 쌓는다 — 로그는 한 줄짜리라 긴 발언을 담기에 맞지 않는다
        if (ev.detail) {
          agent.speeches.push({ ts: ev.ts, summary: ev.summary ?? '', text: ev.detail })
        }
        break
      }

      case 'tool.called': {
        const agent = state.agents[ev.agentId]
        if (!agent) break
        agent.status = 'calling'
        agent.calls.push({
          callId: ev.callId,
          toolName: ev.toolName,
          input: ev.input,
          startedAt: ev.ts,
          status: 'running',
        })
        agent.log.push({ ts: ev.ts, kind: ev.type, text: `${ev.toolName} 호출` })
        break
      }

      case 'tool.result': {
        const agent = state.agents[ev.agentId]
        const call = agent?.calls.find((c) => c.callId === ev.callId)
        if (!agent || !call) break
        call.output = ev.output
        call.error = ev.error
        call.finishedAt = ev.ts
        call.status = ev.error ? 'error' : 'ok'
        // 아직 끝나지 않은 다른 호출이 없으면 다시 running으로
        if (agent.status === 'calling' && agent.calls.every((c) => c.status !== 'running')) {
          agent.status = 'running'
        }
        agent.log.push({
          ts: ev.ts,
          kind: ev.type,
          text: ev.error ? `${call.toolName} 실패: ${ev.error}` : `${call.toolName} 완료`,
        })
        break
      }

      case 'message.sent': {
        const id = `${ev.from}->${ev.to}`
        const link = state.links[id]
        if (link) {
          link.count += 1
          link.lastTs = ev.ts
          link.lastContent = ev.content
        } else {
          state.links[id] = {
            id,
            from: ev.from,
            to: ev.to,
            count: 1,
            lastTs: ev.ts,
            lastContent: ev.content,
          }
        }
        state.agents[ev.from]?.log.push({
          ts: ev.ts,
          kind: ev.type,
          text: `→ ${ev.to}: ${ev.content}`,
        })
        state.agents[ev.to]?.log.push({
          ts: ev.ts,
          kind: ev.type,
          text: `← ${ev.from}: ${ev.content}`,
        })
        break
      }

      case 'agent.finished': {
        const agent = state.agents[ev.agentId]
        if (!agent) break
        agent.status = ev.status === 'error' ? 'error' : 'done'
        agent.finishedAt = ev.ts
        agent.result = ev.result
        agent.tokens = ev.tokens
        agent.thought = undefined
        agent.log.push({
          ts: ev.ts,
          kind: ev.type,
          text: ev.status === 'error' ? `실패: ${ev.result ?? ''}` : '완료',
        })
        break
      }
    }
  }

  return state
}
