import type { RunFixture } from '../entities/event'
import { createMockDriver } from './mockDriver'
import { buildScenario } from './scenario'
import { createSseDriver } from './sseDriver'
import type { RunDriver } from './types'

export type { RunDriver, DriverHandlers } from './types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined

export const isLiveBackend = Boolean(API_URL)

/** mock 모드에서 생성한 시나리오. 다시 재생·속도 변경 때 같은 실행을 재사용한다. */
const scenarios = new Map<string, RunFixture>()

/**
 * 사용자 요청으로 새 실행을 만들고 runId를 받는다.
 *
 * 실제 백엔드: POST {API_URL}/runs  { prompt } → { runId }
 * mock: 프롬프트에서 시나리오를 생성해 메모리에 보관한다.
 */
export async function createRun(prompt: string): Promise<string> {
  if (API_URL) {
    const res = await fetch(`${API_URL}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error(`실행 생성 실패: ${res.status} ${res.statusText}`)
    const { runId } = (await res.json()) as { runId: string }
    return runId
  }

  const runId = `mock-${Date.now().toString(36)}`
  scenarios.set(runId, buildScenario(runId, prompt))
  return runId
}

/**
 * 앱 전체에서 유일한 교체 지점.
 *
 * VITE_API_URL 이 없으면 생성된 시나리오 리플레이,
 * 있으면 실제 SSE 스트림. 나머지 코드는 아무것도 바뀌지 않는다.
 */
export function createDriver(runId: string, speed = 1): RunDriver {
  if (API_URL) return createSseDriver(API_URL, runId)

  const fixture = scenarios.get(runId)
  if (!fixture) {
    return {
      start: (h) => h.onError(new Error('시나리오를 찾을 수 없습니다. 요청을 다시 입력해 주세요.')),
      stop: () => {},
    }
  }
  return createMockDriver(fixture, speed)
}
