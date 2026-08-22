import type { AgentEvent } from '../entities/event'
import type { DriverHandlers, RunDriver } from './types'

/**
 * 실제 백엔드용 드라이버 (SSE).
 *
 * 백엔드가 준비되면 .env 에 VITE_API_URL 만 넣으면 이쪽이 자동으로 선택된다.
 * 기대하는 엔드포인트: GET {apiUrl}/runs/{runId}/stream
 *
 *   event: meta      data: {"runId":"...","title":"..."}
 *   event: agent     data: {"type":"agent.started", ...}   ← AgentEvent 그대로
 *   event: done      data: {}
 *
 * 백엔드가 named event 없이 그냥 data만 흘려보내면 onmessage 쪽에서 받는다.
 */
export function createSseDriver(apiUrl: string, runId: string): RunDriver {
  let source: EventSource | null = null

  return {
    start(h: DriverHandlers) {
      source = new EventSource(`${apiUrl}/runs/${runId}/stream`)

      const push = (raw: string) => {
        try {
          h.onEvent(JSON.parse(raw) as AgentEvent)
        } catch {
          h.onError(new Error(`이벤트 파싱 실패: ${raw.slice(0, 120)}`))
        }
      }

      source.addEventListener('meta', (e) => {
        h.onOpen(JSON.parse((e as MessageEvent<string>).data))
      })
      source.addEventListener('agent', (e) => push((e as MessageEvent<string>).data))
      source.onmessage = (e) => push(e.data)

      source.addEventListener('done', () => {
        h.onDone()
        source?.close()
      })

      source.onerror = () => {
        // EventSource는 스스로 재연결하므로, 닫힌 경우에만 에러로 올린다.
        if (source?.readyState === EventSource.CLOSED) {
          h.onError(new Error('스트림 연결이 끊어졌습니다'))
        }
      }
    },

    stop() {
      source?.close()
      source = null
    },
  }
}
