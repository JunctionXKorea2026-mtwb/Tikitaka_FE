import type { RunFixture } from '../entities/event'
import type { DriverHandlers, RunDriver } from './types'

/**
 * 시나리오를 이벤트의 ts 간격대로 다시 흘려보낸다.
 * 백엔드 없이도 "실시간으로 들어오는 스트림"과 동일한 동작을 만든다.
 */
export function createMockDriver(fixture: RunFixture, speed = 1): RunDriver {
  let timers: number[] = []
  let cancelled = false

  return {
    start(h: DriverHandlers) {
      // 실제 네트워크처럼 한 틱 뒤에 열리게 해서, 연결 상태 UI가 그대로 동작하게 한다
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          h.onOpen({ runId: fixture.runId, title: fixture.title })

          const t0 = fixture.events[0]?.ts ?? 0
          for (const ev of fixture.events) {
            const delay = ((ev.ts - t0) / speed) * 1000
            timers.push(window.setTimeout(() => h.onEvent(ev), delay))
          }

          const last = fixture.events[fixture.events.length - 1]
          const endDelay = last ? ((last.ts - t0) / speed) * 1000 + 50 : 0
          timers.push(window.setTimeout(h.onDone, endDelay))
        }, 120),
      )
    },

    stop() {
      cancelled = true
      timers.forEach(clearTimeout)
      timers = []
    },
  }
}
