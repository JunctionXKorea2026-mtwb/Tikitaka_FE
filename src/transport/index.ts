import { createMockDriver } from './mockDriver'
import { createSseDriver } from './sseDriver'
import type { RunDriver } from './types'

export type { RunDriver, DriverHandlers } from './types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined

/**
 * 앱 전체에서 유일한 교체 지점.
 *
 * VITE_API_URL 이 없으면 mock JSON 리플레이,
 * 있으면 실제 SSE 스트림. 나머지 코드는 아무것도 바뀌지 않는다.
 */
export function createDriver(runId: string, speed = 1): RunDriver {
  if (API_URL) return createSseDriver(API_URL, runId)
  return createMockDriver(`${import.meta.env.BASE_URL}mock/${runId}.json`, speed)
}

export const isLiveBackend = Boolean(API_URL)

/**
 * 사용자 요청으로 새 실행을 만들고 runId를 받는다.
 *
 * 실제 백엔드: POST {API_URL}/runs  { prompt } → { runId }
 * mock: 준비된 시나리오 중 하나를 고른다 (프롬프트에 실패/에러 키워드가 있으면 실패 시나리오).
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

  await new Promise((resolve) => setTimeout(resolve, 250))
  return /실패|에러|장애|error|fail/i.test(prompt) ? 'run-002' : 'run-001'
}
