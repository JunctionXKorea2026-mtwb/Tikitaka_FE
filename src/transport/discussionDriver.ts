import {
  discussionToEvents,
  isSettled,
  type DiscussionPayload,
} from './discussion'
import type { DriverHandlers, RunDriver } from './types'

/**
 * Aigo Squad Discussion API 드라이버.
 *
 * 이 백엔드는 스트림이 아니라 **폴링**이다 (`GET /api/discussion/{id}`).
 * 그래서 매번 전체를 가져와 이벤트로 변환한 뒤, **새로 늘어난 꼬리만** 흘려보낸다.
 * `discussionToEvents`가 접두 안정적이라 이게 성립한다 — 앞부분은 몇 번을 변환해도
 * 같은 이벤트를 낸다.
 *
 * 앱 입장에서는 SSE 드라이버와 구분되지 않는다.
 */

/** 진행 중일 때 다시 물어보는 간격 */
const POLL_MS = 1500
/** 연달아 실패해도 이만큼은 버틴다 (ngrok이 잠깐 끊기는 일이 흔하다) */
const MAX_FAILURES = 5

export function createDiscussionDriver(apiUrl: string, discussionId: string): RunDriver {
  let timer: number | null = null
  let stopped = false
  let emitted = 0
  let failures = 0
  let opened = false

  const clear = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }

  return {
    start(h: DriverHandlers) {
      const poll = async () => {
        if (stopped) return

        try {
          const res = await fetch(`${apiUrl}/api/discussion/${discussionId}`, {
            headers: { 'ngrok-skip-browser-warning': '1' },
          })
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)

          const payload = (await res.json()) as DiscussionPayload
          if (stopped) return
          failures = 0

          const info = payload.discussionInfo
          if (!opened) {
            opened = true
            const createdAt = Date.parse(info.createdAt)
            h.onOpen({
              runId: info.id,
              title: info.topic,
              createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
            })
          }

          const events = discussionToEvents(payload)
          for (const event of events.slice(emitted)) h.onEvent(event)
          emitted = events.length

          if (isSettled(info.status)) {
            h.onDone()
            return
          }
        } catch (err) {
          failures += 1
          if (failures >= MAX_FAILURES) {
            h.onError(
              new Error(
                `토론 조회 실패 (${failures}회): ${err instanceof Error ? err.message : String(err)}`,
              ),
            )
            return
          }
        }

        timer = window.setTimeout(() => void poll(), POLL_MS)
      }

      void poll()
    },

    stop() {
      stopped = true
      clear()
    },
  }
}
