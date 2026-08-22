import type { AgentEvent } from '../entities/event'

/**
 * Aigo Squad Discussion API 어댑터.
 *
 * 백엔드는 "스쿼드가 토픽을 두고 토론한다" 모형이고, 우리 도메인은
 * "에이전트들이 실행된다" 모형이다. 둘을 여기서 맞춘다.
 *
 *   discussion            실행 하나 (3D에서 원자 하나)
 *   topic                 핵 = 질문
 *   participants[]        에이전트 (안쪽 오비탈)
 *   messages[]            발언 → 에이전트 간 에너지선 + 사고 요약
 *   conclusion.summary    최종 답변
 *
 * 이 API에는 **도구 호출이 없다.** 그래서 바깥 오비탈(도구 자리)은 비어 있다.
 * 억지로 채우지 않는다 — 없는 걸 있는 것처럼 그리면 화면이 거짓말을 한다.
 *
 * 스키마가 OpenAPI에 비어 있어(`{}`) 실제 응답을 호출해 확인한 뒤 작성했다.
 */

export interface DiscussionMessage {
  id: string
  seq: number
  author: { agentId: string | null; type: string }
  content: string
  timestamp: string
  tokenUsage?: { promptTokens?: number; completionTokens?: number }
}

export interface DiscussionInfo {
  id: string
  topic: string
  squadId: string
  /** running | awaitingUser | completed | failed … */
  status: string
  mode: string
  participants: string[]
  messages: DiscussionMessage[]
  turnBudget: number
  turnsTaken: number
  createdAt: string
  updatedAt: string
}

export interface DiscussionConclusion {
  summary?: string
  keyPoints?: string[]
  decisions?: string[]
  actionItems?: { assigneeAgentId?: string; description?: string }[]
  /** 아직 진행 중일 때는 안내 문구만 온다 */
  message?: string
}

export interface DiscussionPayload {
  discussionInfo: DiscussionInfo
  conclusion?: DiscussionConclusion
  transcript?: string
}

/** 토론이 더 진행되지 않는 상태 (awaitingUser = 이번 라운드 끝, 사용자 차례) */
export const isSettled = (status: string) =>
  status !== 'running' && status !== 'pending' && status !== 'queued'

const FAILED = new Set(['failed', 'error', 'cancelled', 'canceled'])

/**
 * 발언 첫 줄에서 역할 이름을 뽑는다.
 *   "**Planner – Opening Remarks**"        → Planner
 *   "**Code Specialist – 구현 제안**"       → Code Specialist
 *   "FINAL ANSWER: ..."                    → (없음)
 *
 * 백엔드가 agentId만 주고 이름을 안 주기 때문에 필요하다.
 * agent-1787388204963-rc70obw 를 화면에 띄울 수는 없다.
 */
export function extractRole(content: string): string | null {
  const first = content.trim().split('\n')[0]
  const bold = first.match(/^\*\*(.+?)\*\*/)
  if (!bold) return null
  const name = bold[1].split(/[–—:-]/)[0].trim()
  return name.length > 0 && name.length <= 28 ? name : null
}


const ROOT = 'discussion'

/**
 * 토론 페이로드를 이벤트 스트림으로 변환한다.
 *
 * **접두 안정성(prefix-stable)이 중요하다.** 폴링 드라이버는 매번 전체를 변환한 뒤
 * 새로 늘어난 꼬리만 흘려보낸다. 그러려면 같은 입력의 앞부분이 항상 같은 이벤트를
 * 내야 한다 — 그래서 참가자 순서도, 발언 순서도 seq에만 의존시킨다.
 */
export function discussionToEvents(payload: DiscussionPayload): AgentEvent[] {
  const info = payload.discussionInfo
  const events: AgentEvent[] = []

  const t0 = Date.parse(info.createdAt)
  const at = (iso: string) => {
    const ms = Date.parse(iso) - t0
    return Number.isFinite(ms) ? Number((Math.max(0, ms) / 1000).toFixed(1)) : 0
  }

  // 핵 = 토론 자체. 참가자들이 여기에 매달린다.
  events.push({
    type: 'agent.started',
    ts: 0,
    agentId: ROOT,
    label: 'Squad',
    role: 'orchestrator',
  })

  const messages = [...info.messages].sort((a, b) => a.seq - b.seq)
  const seen = new Set<string>()
  const spokeCount = new Map<string, number>()
  const tokens = new Map<string, number>()

  messages.forEach((m, i) => {
    const agentId = m.author.agentId
    if (!agentId) return
    const ts = at(m.timestamp)

    // 에이전트는 **처음 발언할 때** 등장시킨다.
    //
    // participants[]로 미리 다 만들면 안 된다. 이름을 발언 내용에서 뽑기 때문에,
    // 아직 말하지 않은 참가자는 "Agent 3w1b" 같은 id 조각으로 만들어지고
    // 나중에 발언해도 라벨이 그대로 굳는다 (폴링은 이미 보낸 이벤트를 고치지 못한다).
    // 발언 시점에 만들면 이름이 확정된 뒤라 안전하고, 토론에 참여하는 순서대로
    // 원자가 차오르는 그림도 자연스럽다.
    if (!seen.has(agentId)) {
      seen.add(agentId)
      const role = extractRole(m.content)
      events.push({
        type: 'agent.started',
        ts,
        agentId,
        label: role ?? `Agent ${(agentId.split('-').pop() ?? agentId).slice(0, 4)}`,
        role: role === 'Planner' ? 'router' : 'worker',
        parentId: ROOT,
      })
    }

    events.push({
      type: 'agent.thinking',
      ts,
      agentId,
      summary: firstLine(m.content),
      detail: m.content,
    })

    // 발언의 흐름은 **직전 발언자 → 지금 발언자**로 그린다.
    // "지금 발언자 → 다음 발언자"로 하면 다음 발언이 도착할 때 값이 바뀌어
    // 접두 안정성이 깨진다. 뒤를 보지 않고 앞만 본다.
    const prev = messages[i - 1]?.author.agentId
    if (prev && prev !== agentId) {
      events.push({
        type: 'message.sent',
        ts,
        from: prev,
        to: agentId,
        content: extractRole(m.content) ?? firstLine(m.content),
      })
    }

    spokeCount.set(agentId, (spokeCount.get(agentId) ?? 0) + 1)
    tokens.set(agentId, (tokens.get(agentId) ?? 0) + (m.tokenUsage?.completionTokens ?? 0))
  })

  if (!isSettled(info.status)) return events

  // 종료 이벤트는 전부 마지막 시각에 몰아넣는다.
  // 각자 마지막 발언 시각에 두면 타임스탬프가 역행해서 타임라인이 뒤로 간다.
  const end = Math.max(at(info.updatedAt), lastTs(events))
  const failed = FAILED.has(info.status)

  for (const agentId of seen) {
    events.push({
      type: 'agent.finished',
      ts: end,
      agentId,
      status: 'ok',
      result: `발언 ${spokeCount.get(agentId) ?? 0}회`,
      tokens: tokens.get(agentId) ?? 0,
    })
  }

  events.push({
    type: 'agent.finished',
    ts: end,
    agentId: ROOT,
    status: failed ? 'error' : 'ok',
    result: conclusionText(payload),
    tokens: [...tokens.values()].reduce((a, b) => a + b, 0),
  })

  return events
}

const lastTs = (events: AgentEvent[]) => events.reduce((max, e) => Math.max(max, e.ts), 0)

function firstLine(content: string): string {
  const line = content
    .trim()
    .split('\n')
    .map((l) => l.replace(/\*\*/g, '').trim())
    .find((l) => l.length > 0)
  if (!line) return '발언'
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}


/** 결론을 화면에 띄울 한 덩어리 텍스트로. 아직 없으면 안내 문구를 그대로 쓴다. */
export function conclusionText(payload: DiscussionPayload): string {
  const c = payload.conclusion
  const info = payload.discussionInfo
  if (!c) return '결론이 아직 없습니다.'
  if (!c.summary && c.message) return c.message

  const parts: string[] = []
  if (c.summary) parts.push(c.summary)

  if (c.keyPoints?.length) {
    parts.push('', '핵심', ...c.keyPoints.map((k) => `· ${k}`))
  }
  if (c.decisions?.length) {
    parts.push('', '결정', ...c.decisions.map((k) => `· ${k}`))
  }
  if (c.actionItems?.length) {
    parts.push('', '할 일', ...c.actionItems.map((a) => `· ${a.description ?? ''}`))
  }
  if (info.status === 'awaitingUser') {
    parts.push('', `(턴 ${info.turnsTaken}/${info.turnBudget} 소진 — 사용자 입력 대기)`)
  }

  return parts.join('\n').trim() || '결론이 비어 있습니다.'
}
