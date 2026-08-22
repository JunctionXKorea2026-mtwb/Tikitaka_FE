import { create } from 'zustand'
import type { AgentEvent } from '../entities/event'
import { reduceEvents } from '../entities/reduce'
import { emptyRun, type RunState } from '../entities/run'
import { createDriver, createRun, type RunDriver } from '../transport'

type ConnState = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

interface RunStore {
  runId: string
  title: string
  conn: ConnState
  error?: string
  /** 이 실행을 만든 사용자 요청. 결과 패널에서 요청↔답변을 짝지어 보여준다. */
  prompt: string
  submitting: boolean

  /** 도착한 원본 이벤트 전체. 절대 변형하지 않는다. */
  events: AgentEvent[]
  /**
   * 타임라인 커서. null이면 "라이브 추종"(= 항상 최신).
   * 숫자면 그 개수만큼만 적용한 과거 시점을 본다.
   */
  cursor: number | null
  speed: number

  submit: (prompt: string) => Promise<void>
  connect: (runId: string, prompt?: string) => void
  disconnect: () => void
  setCursor: (cursor: number | null) => void
  setSpeed: (speed: number) => void
}

let driver: RunDriver | null = null

export const useRunStore = create<RunStore>((set, get) => ({
  runId: '',
  title: '',
  conn: 'idle',
  prompt: '',
  submitting: false,
  events: [],
  cursor: null,
  speed: 1,

  async submit(prompt) {
    const trimmed = prompt.trim()
    if (!trimmed) return

    set({ submitting: true, error: undefined })
    try {
      const runId = await createRun(trimmed)
      get().connect(runId, trimmed)
    } catch (err) {
      set({ conn: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ submitting: false })
    }
  },

  connect(runId, prompt = '') {
    driver?.stop()
    set({
      runId,
      title: '',
      prompt,
      conn: 'connecting',
      events: [],
      cursor: null,
      error: undefined,
    })

    driver = createDriver(runId, get().speed)
    driver.start({
      onOpen: (meta) => set({ runId: meta.runId, title: meta.title, conn: 'streaming' }),
      onEvent: (event) => set((s) => ({ events: [...s.events, event] })),
      onDone: () => set({ conn: 'done' }),
      onError: (err) => set({ conn: 'error', error: err.message }),
    })
  },

  disconnect() {
    driver?.stop()
    driver = null
    set({ conn: 'idle' })
  },

  setCursor: (cursor) => set({ cursor }),
  setSpeed: (speed) => set({ speed }),
}))

/** 현재 커서 기준으로 적용할 이벤트 개수. */
export function visibleCount(s: Pick<RunStore, 'events' | 'cursor'>): number {
  return s.cursor ?? s.events.length
}

/**
 * 파생 상태 셀렉터. 이벤트 배열/커서가 실제로 바뀔 때만 다시 접는다.
 * (zustand는 셀렉터 결과를 캐시하지 않으므로 여기서 직접 메모한다.)
 */
let memoKey = ''
let memoValue: RunState = emptyRun()

export function useRunState(): RunState {
  return useRunStore((s) => {
    const count = visibleCount(s)
    const key = `${s.runId}:${s.events.length}:${count}`
    if (key !== memoKey) {
      memoKey = key
      memoValue = reduceEvents(s.runId, s.events.slice(0, count))
    }
    return memoValue
  })
}
