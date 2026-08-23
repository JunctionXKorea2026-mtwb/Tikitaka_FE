import type { AgentEvent, RunFixture } from '../entities/event'

/**
 * 사용자 요청에서 실행 시나리오를 만든다.
 *
 * 백엔드가 없는 동안 "입력 → 그 질문에 대한 실행"을 성립시키기 위한 장치다.
 * 실제 추론을 흉내내지는 않는다 — 없는 사실을 지어내지 않기 위해,
 * 최종 답변은 목업임을 명시하고 파이프라인이 무엇을 했는지만 보여준다.
 *
 * VITE_API_URL이 설정되면 이 파일은 쓰이지 않는다.
 */

const STOP = new Set([
  '해줘', '알려줘', '정리해줘', '조사해줘', '만들어줘', '보여줘', '찾아줘',
  '주세요', '부탁', '그리고', '대해', '대한', '관련', '해서', '좀', '가능',
  '어떻게', '무엇', '뭐가', '뭔지', 'please', 'about', 'the', 'and', 'for',
])

/** 조사를 떼고 내용어만 남긴다. 형태소 분석 수준은 아니고, 검색 쿼리를 만들 정도면 충분하다. */
function topicWords(prompt: string): string[] {
  return prompt
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    // 어미 먼저 (비교해줘 → 비교), 그다음 조사 (요금제를 → 요금제)
    .map((w) => w.replace(/(해줘|해주세요|해주라|주세요|해봐|해라|하고|해서|줘)$/u, ''))
    .map((w) => w.replace(/(을|를|이|가|은|는|에서|에게|으로|로|의|와|과|도|만|에)$/u, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
}

type Shape = 'simple' | 'research' | 'failure'

/**
 * 후속 질문은 대개 앞의 결과를 다듬는 일이라 파이프라인이 짧다.
 * 이미 모은 자료가 있으니 Researcher를 다시 돌릴 이유가 없다.
 */
function pickShape(prompt: string, followUp: boolean): Shape {
  if (/실패|에러|장애|오류|error|fail|timeout/i.test(prompt)) return 'failure'
  if (followUp || prompt.trim().length < 16) return 'simple'
  return 'research'
}

/** 최종 답변. 목업임을 분명히 밝히고, 실제로 무엇이 실행됐는지만 요약한다. */
function answerText(prompt: string, steps: string[]): string {
  return [
    '[목업 응답] 백엔드가 연결되면 이 자리에 에이전트의 실제 답변이 들어갑니다.',
    '',
    `요청: "${prompt}"`,
    '',
    '이번 실행에서 시뮬레이션된 파이프라인:',
    ...steps.map((s) => `· ${s}`),
    '',
    '.env에 VITE_API_URL을 설정하면 같은 화면이 실제 스트림으로 동작합니다.',
  ].join('\n')
}

export function buildScenario(runId: string, prompt: string, followUp = false): RunFixture {
  const words = topicWords(prompt)
  const topic = words.slice(0, 3).join(' ') || '요청'
  const query = words.slice(0, 4).join(' ') || prompt.slice(0, 20)

  const events: AgentEvent[] = []
  let t = 0
  /** dt초 뒤의 타임스탬프를 돌려주면서 시계를 진행시킨다. */
  const at = (dt: number) => (t = Number((t + dt).toFixed(1)))

  const shape = pickShape(prompt, followUp)
  const title = prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt

  events.push({
    type: 'agent.started',
    ts: at(0),
    agentId: 'orchestrator',
    label: 'Orchestrator',
    role: 'orchestrator',
  })

  if (shape === 'failure') {
    buildFailure(events, at, topic, prompt)
  } else if (shape === 'simple') {
    buildSimple(events, at, topic, query, prompt, followUp)
  } else {
    buildResearch(events, at, topic, query, prompt, words)
  }

  /*
   * 루트 에이전트 id를 runId로 바꾼다.
   *
   * 'orchestrator' 로 두면 모든 턴의 루트가 같은 id가 되어,
   * 원자 하나를 고를 때 전부 선택 표시된다 (실제 백엔드도 같은 이유로 discussionId를 쓴다).
   * 시나리오는 'orchestrator' 로 짜는 편이 읽기 쉬우므로 마지막에 한 번 갈아끼운다.
   */
  return { runId, title, events: events.map((e) => rename(e, 'orchestrator', runId)) }
}

/** 이벤트 안의 에이전트 id 하나를 갈아끼운다 (agentId / parentId / from / to) */
function rename(event: AgentEvent, from: string, to: string): AgentEvent {
  const swap = (id?: string) => (id === from ? to : id)
  switch (event.type) {
    case 'agent.started':
      return { ...event, agentId: swap(event.agentId)!, parentId: swap(event.parentId) }
    case 'message.sent':
      return { ...event, from: swap(event.from)!, to: swap(event.to)! }
    default:
      return { ...event, agentId: swap(event.agentId)! }
  }
}

type Clock = (dt: number) => number

// ---------------------------------------------------------------- research

function buildResearch(
  ev: AgentEvent[],
  at: Clock,
  topic: string,
  query: string,
  prompt: string,
  words: string[],
) {
  const withCritic = prompt.length > 40

  ev.push({
    type: 'agent.thinking',
    ts: at(0.6),
    agentId: 'orchestrator',
    summary: `"${topic}" 요청을 수집·분석·작성으로 분해`,
  })

  ev.push({
    type: 'agent.started',
    ts: at(0.8),
    agentId: 'researcher',
    label: 'Researcher',
    role: 'worker',
    parentId: 'orchestrator',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.2),
    from: 'orchestrator',
    to: 'researcher',
    content: `${topic} 관련 자료를 수집해줘`,
  })

  ev.push({
    type: 'agent.started',
    ts: at(0.6),
    agentId: 'analyst',
    label: 'Analyst',
    role: 'worker',
    parentId: 'orchestrator',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.2),
    from: 'orchestrator',
    to: 'analyst',
    content: '수집이 끝나면 핵심만 정리해줘',
  })

  ev.push({
    type: 'agent.thinking',
    ts: at(0.5),
    agentId: 'researcher',
    summary: `검색 쿼리 생성: "${query}"`,
    detail: `"${query}" 로 검색합니다.\n\n관련도가 높은 문서를 골라 원문을 받아온 뒤 Analyst에게 넘기겠습니다.`,
  })
  ev.push({
    type: 'tool.called',
    ts: at(0.7),
    agentId: 'researcher',
    callId: 'r1',
    toolName: 'web_search',
    input: { query },
  })
  ev.push({
    type: 'tool.result',
    ts: at(1.9),
    agentId: 'researcher',
    callId: 'r1',
    output: { hits: 12 },
  })

  ev.push({
    type: 'agent.thinking',
    ts: at(0.4),
    agentId: 'analyst',
    summary: 'Researcher 결과 대기 중',
  })
  ev.push({
    type: 'tool.called',
    ts: at(0.4),
    agentId: 'researcher',
    callId: 'r2',
    toolName: 'fetch_page',
    input: { url: `https://example.com/search?q=${encodeURIComponent(query)}` },
  })
  ev.push({
    type: 'tool.result',
    ts: at(2.0),
    agentId: 'researcher',
    callId: 'r2',
    output: { bytes: 38912, sections: 6 },
  })

  ev.push({
    type: 'message.sent',
    ts: at(0.4),
    from: 'researcher',
    to: 'analyst',
    content: '원문 3건 전달',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.3),
    from: 'researcher',
    to: 'orchestrator',
    content: '수집 완료',
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.4),
    agentId: 'researcher',
    status: 'ok',
    result: `"${query}" 검색 및 원문 3건 수집`,
    tokens: 6200 + words.length * 180,
  })

  ev.push({
    type: 'tool.called',
    ts: at(0.5),
    agentId: 'analyst',
    callId: 'a1',
    toolName: 'summarize',
    input: { documents: 3, focus: topic },
  })
  ev.push({
    type: 'tool.result',
    ts: at(2.2),
    agentId: 'analyst',
    callId: 'a1',
    output: { points: 5 },
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.4),
    from: 'analyst',
    to: 'orchestrator',
    content: '핵심 5개 항목으로 정리 완료',
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.4),
    agentId: 'analyst',
    status: 'ok',
    result: '수집 자료를 5개 항목으로 정리',
    tokens: 9400,
  })

  if (withCritic) {
    ev.push({
      type: 'agent.started',
      ts: at(0.5),
      agentId: 'critic',
      label: 'Critic',
      role: 'critic',
      parentId: 'orchestrator',
    })
    ev.push({
      type: 'message.sent',
      ts: at(0.2),
      from: 'orchestrator',
      to: 'critic',
      content: '정리 결과를 검증해줘',
    })
    ev.push({
      type: 'tool.called',
      ts: at(0.6),
      agentId: 'critic',
      callId: 'c1',
      toolName: 'verify_source',
      input: { documents: 3 },
    })
    ev.push({
      type: 'tool.result',
      ts: at(1.7),
      agentId: 'critic',
      callId: 'c1',
      output: { checked: 3, flagged: 0 },
    })
    ev.push({
      type: 'message.sent',
      ts: at(0.3),
      from: 'critic',
      to: 'orchestrator',
      content: '검증 통과',
    })
    ev.push({
      type: 'agent.finished',
      ts: at(0.4),
      agentId: 'critic',
      status: 'ok',
      result: '출처 3건 검증 통과',
      tokens: 4100,
    })
  }

  ev.push({
    type: 'agent.started',
    ts: at(0.5),
    agentId: 'writer',
    label: 'Writer',
    role: 'worker',
    parentId: 'orchestrator',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.2),
    from: 'orchestrator',
    to: 'writer',
    content: '정리된 내용으로 최종 답변을 작성해줘',
  })
  ev.push({
    type: 'agent.thinking',
    ts: at(0.5),
    agentId: 'writer',
    summary: '개요 → 본문 → 요약 순으로 구성',
  })
  ev.push({
    type: 'tool.called',
    ts: at(0.6),
    agentId: 'writer',
    callId: 'w1',
    toolName: 'compose',
    input: { sections: 3, topic },
  })
  ev.push({
    type: 'tool.result',
    ts: at(2.3),
    agentId: 'writer',
    callId: 'w1',
    output: { words: 480 },
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.4),
    from: 'writer',
    to: 'orchestrator',
    content: '초안 전달',
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.4),
    agentId: 'writer',
    status: 'ok',
    result: '최종 답변 초안 작성',
    tokens: 12800,
  })

  const steps = [
    `Researcher — "${query}" 검색, 원문 3건 수집`,
    'Analyst — 수집 자료를 5개 항목으로 정리',
    ...(withCritic ? ['Critic — 출처 3건 검증'] : []),
    'Writer — 최종 답변 작성',
  ]

  ev.push({
    type: 'agent.finished',
    ts: at(0.7),
    agentId: 'orchestrator',
    status: 'ok',
    result: answerText(prompt, steps),
    tokens: 2600,
  })
}

// ------------------------------------------------------------------ simple

function buildSimple(
  ev: AgentEvent[],
  at: Clock,
  topic: string,
  query: string,
  prompt: string,
  followUp = false,
) {
  ev.push({
    type: 'agent.thinking',
    ts: at(0.5),
    agentId: 'orchestrator',
    summary: followUp
      ? `후속 질문 — 앞 턴의 맥락을 이어 "${topic}" 처리`
      : `"${topic}" — 단일 작업으로 처리 가능`,
  })
  ev.push({
    type: 'agent.started',
    ts: at(0.7),
    agentId: 'worker',
    label: followUp ? 'Refiner' : 'Worker',
    role: 'worker',
    parentId: 'orchestrator',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.2),
    from: 'orchestrator',
    to: 'worker',
    content: prompt,
  })
  ev.push({
    type: 'tool.called',
    ts: at(0.6),
    agentId: 'worker',
    callId: 's1',
    toolName: 'web_search',
    input: { query },
  })
  ev.push({
    type: 'tool.result',
    ts: at(1.8),
    agentId: 'worker',
    callId: 's1',
    output: { hits: 7 },
  })
  ev.push({
    type: 'agent.thinking',
    ts: at(0.4),
    agentId: 'worker',
    summary: '결과 정리 중',
  })
  ev.push({
    type: 'message.sent',
    ts: at(1.1),
    from: 'worker',
    to: 'orchestrator',
    content: '처리 완료',
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.4),
    agentId: 'worker',
    status: 'ok',
    result: `"${query}" 검색 후 정리`,
    tokens: 4300,
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.6),
    agentId: 'orchestrator',
    status: 'ok',
    result: answerText(prompt, [`Worker — "${query}" 검색 후 결과 정리`]),
    tokens: 1500,
  })
}

// ----------------------------------------------------------------- failure

function buildFailure(ev: AgentEvent[], at: Clock, topic: string, prompt: string) {
  ev.push({
    type: 'agent.thinking',
    ts: at(0.5),
    agentId: 'orchestrator',
    summary: `"${topic}" 처리 시작`,
  })
  ev.push({
    type: 'agent.started',
    ts: at(0.6),
    agentId: 'fetcher',
    label: 'Fetcher',
    role: 'worker',
    parentId: 'orchestrator',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.2),
    from: 'orchestrator',
    to: 'fetcher',
    content: prompt,
  })

  ev.push({
    type: 'tool.called',
    ts: at(0.7),
    agentId: 'fetcher',
    callId: 'f1',
    toolName: 'http_get',
    input: { url: 'https://upstream.internal/api' },
  })
  ev.push({
    type: 'tool.result',
    ts: at(2.4),
    agentId: 'fetcher',
    callId: 'f1',
    output: null,
    error: '503 Service Unavailable',
  })
  ev.push({
    type: 'agent.thinking',
    ts: at(0.5),
    agentId: 'fetcher',
    summary: '재시도 1/2 (백오프 2s)',
  })
  ev.push({
    type: 'tool.called',
    ts: at(0.5),
    agentId: 'fetcher',
    callId: 'f2',
    toolName: 'http_get',
    input: { url: 'https://upstream.internal/api', retry: 1 },
  })
  ev.push({
    type: 'tool.result',
    ts: at(2.3),
    agentId: 'fetcher',
    callId: 'f2',
    output: null,
    error: '503 Service Unavailable',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.4),
    from: 'fetcher',
    to: 'orchestrator',
    content: '업스트림 응답 없음 — 재시도 소진',
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.4),
    agentId: 'fetcher',
    status: 'error',
    result: '업스트림 503, 재시도 2회 실패',
    tokens: 1800,
  })

  ev.push({
    type: 'agent.thinking',
    ts: at(0.6),
    agentId: 'orchestrator',
    summary: '폴백 경로(캐시)로 전환',
  })
  ev.push({
    type: 'agent.started',
    ts: at(0.6),
    agentId: 'fallback',
    label: 'Cache Fallback',
    role: 'router',
    parentId: 'orchestrator',
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.2),
    from: 'orchestrator',
    to: 'fallback',
    content: '캐시로 대체 가능한지 확인',
  })
  ev.push({
    type: 'tool.called',
    ts: at(0.6),
    agentId: 'fallback',
    callId: 'f3',
    toolName: 'cache_lookup',
    input: { key: topic },
  })
  ev.push({
    type: 'tool.result',
    ts: at(1.4),
    agentId: 'fallback',
    callId: 'f3',
    output: { hit: true, ageHours: 6.2, stale: true },
  })
  ev.push({
    type: 'message.sent',
    ts: at(0.4),
    from: 'fallback',
    to: 'orchestrator',
    content: 'stale 캐시 사용 가능',
  })
  ev.push({
    type: 'agent.finished',
    ts: at(0.4),
    agentId: 'fallback',
    status: 'ok',
    result: 'stale 캐시로 대체',
    tokens: 900,
  })

  ev.push({
    type: 'agent.finished',
    ts: at(0.6),
    agentId: 'orchestrator',
    status: 'error',
    result: answerText(prompt, [
      'Fetcher — 업스트림 503, 재시도 2회 모두 실패',
      'Cache Fallback — 6.2시간 지난 캐시로 대체',
    ]),
    tokens: 1300,
  })
}
