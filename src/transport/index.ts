import type { RunFixture } from '../entities/event'
import { createDiscussionDriver } from './discussionDriver'
import { createMockDriver } from './mockDriver'
import { buildScenario } from './scenario'
import type { RunDriver } from './types'

export type { RunDriver, DriverHandlers } from './types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined
/** 토론에 투입할 스쿼드. 백엔드 기본값을 그대로 쓴다. */
const SQUAD_ID =
  (import.meta.env.VITE_SQUAD_ID as string | undefined) ?? '77c7ba94-fa87-4b2b-b7cc-f7b01540cd8a'

export const isLiveBackend = Boolean(API_URL)

/** mock 모드에서 생성한 시나리오. 다시 재생·속도 변경 때 같은 실행을 재사용한다. */
const scenarios = new Map<string, RunFixture>()

/**
 * 사용자 요청으로 새 실행을 만들고 runId를 받는다.
 *
 * 실제 백엔드: POST {API_URL}/runs  { prompt, threadId, turn, parentRunId } → { runId }
 *   threadId로 대화를 묶는다.
 *   parentRunId가 있으면 그 실행에 이어지는 후속 질문 — 백엔드는 그 맥락을 잇는다.
 *   null이면 같은 스레드 안의 새 주제다.
 *
 * mock: 프롬프트에서 시나리오를 생성해 메모리에 보관한다.
 */
export async function createRun(
  prompt: string,
  threadId: string,
  turn = 0,
  parentRunId: string | null = null,
): Promise<string> {
  if (API_URL) {
    // Aigo Squad Discussion API — POST /api/ask { topic, squad_id } → { discussionId }
    //
    // 이 API에는 스레드·부모 개념이 없다. 후속 질문도 새 토론이 되므로
    // 백엔드 쪽 맥락은 이어지지 않는다 (프론트의 대화 구조만 유지된다).
    // 백엔드에 이어가기 엔드포인트가 생기면 여기서 parentRunId를 넘기면 된다.
    const res = await fetch(`${API_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ topic: prompt, squad_id: SQUAD_ID }),
    })
    if (!res.ok) throw new Error(`토론 생성 실패: ${res.status} ${res.statusText}`)

    const data = (await res.json()) as { discussionId?: string }
    if (!data.discussionId) throw new Error('응답에 discussionId가 없습니다')
    return data.discussionId
  }

  void threadId
  const runId = `mock-${Date.now().toString(36)}-${turn}`
  scenarios.set(runId, buildScenario(runId, prompt, parentRunId !== null))
  return runId
}

/**
 * 앱 전체에서 유일한 교체 지점.
 *
 * VITE_API_URL 이 없으면 생성된 시나리오 리플레이,
 * 있으면 실제 SSE 스트림. 나머지 코드는 아무것도 바뀌지 않는다.
 */
export function createDriver(runId: string, speed = 1): RunDriver {
  if (API_URL) return createDiscussionDriver(API_URL, runId)

  const fixture = scenarios.get(runId)
  if (!fixture) {
    return {
      start: (h) => h.onError(new Error('시나리오를 찾을 수 없습니다. 요청을 다시 입력해 주세요.')),
      stop: () => {},
    }
  }
  return createMockDriver(fixture, speed)
}
