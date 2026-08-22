import type { AgentEvent } from '../entities/event'

export interface DriverHandlers {
  /** 실행 메타데이터가 확정됐을 때 (스트림 시작 직후 1회) */
  onOpen: (meta: { runId: string; title: string }) => void
  onEvent: (event: AgentEvent) => void
  onDone: () => void
  onError: (error: Error) => void
}

/**
 * 이벤트 공급자 추상화.
 *
 * mock JSON 리플레이와 실제 SSE/WebSocket API가 이 인터페이스 뒤에 숨는다.
 * 앱 코드는 어느 쪽인지 알 필요가 없다 — 교체 지점은 `createDriver()` 하나뿐.
 */
export interface RunDriver {
  start(handlers: DriverHandlers): void
  stop(): void
}
