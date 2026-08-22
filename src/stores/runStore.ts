import { create } from 'zustand'
import type { AgentEvent } from '../entities/event'
import { reduceEvents } from '../entities/reduce'
import { emptyRun, type RunState } from '../entities/run'
import { createDriver, createRun, type RunDriver } from '../transport'

export type ConnState = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

/**
 * 대화의 한 턴 = 실행 하나.
 *
 * 후속 질문은 이전 턴을 지우지 않고 뒤에 쌓인다. 캔버스는 그중 하나(activeId)를
 * 보여주고, 나머지는 결과 패널의 대화 목록에 남는다.
 * 3D에서는 턴 하나가 원자 하나이므로 대화가 곧 분자가 된다.
 */
export interface Turn {
  id: string
  /**
   * 이어서 물은 턴이면 그 대상, 새 주제면 null.
   * 자동 판별하지 않는다 — 틀리면 대화가 조용히 갈라져서 더 나쁘다.
   * 사용자가 입력창에서 고른다.
   */
  parentId: string | null
  prompt: string
  title: string
  events: AgentEvent[]
  conn: ConnState
  error?: string
}

interface RunStore {
  /** 대화 전체를 묶는 id. 백엔드가 맥락을 이어가는 데 쓴다. */
  threadId: string
  turns: Turn[]
  /** 캔버스에 보이는 턴 */
  activeId: string | null
  submitting: boolean

  /**
   * 타임라인 커서. null이면 "라이브 추종"(= 항상 최신).
   * 숫자면 그 개수만큼만 적용한 과거 시점을 본다. 활성 턴에만 적용된다.
   */
  cursor: number | null
  speed: number

  submit: (prompt: string, options?: { newTopic?: boolean }) => Promise<void>
  /** 캔버스를 다른 턴으로 옮긴다 */
  selectTurn: (id: string) => void
  /** 활성 턴을 처음부터 다시 재생 */
  replay: () => void
  /** 대화를 비우고 새로 시작 */
  reset: () => void
  disconnect: () => void
  setCursor: (cursor: number | null) => void
  setSpeed: (speed: number) => void
}

let driver: RunDriver | null = null

const newThreadId = () => `thread-${Date.now().toString(36)}`

export const useRunStore = create<RunStore>((set, get) => ({
  threadId: newThreadId(),
  turns: [],
  activeId: null,
  submitting: false,
  cursor: null,
  speed: 1,

  async submit(prompt, options) {
    const trimmed = prompt.trim()
    if (!trimmed) return

    set({ submitting: true })
    try {
      const { threadId, turns, speed, activeId } = get()
      // 이어서 물으면 "지금 보고 있는 턴"에 붙는다 — 과거 턴을 골라두면 거기서 갈라진다
      const parentId = options?.newTopic ? null : activeId
      const runId = await createRun(trimmed, threadId, turns.length, parentId)

      // 이전 스트림은 멈춘다. 받은 이벤트는 그 턴에 그대로 남는다.
      driver?.stop()

      const turn: Turn = {
        id: runId,
        parentId,
        prompt: trimmed,
        title: '',
        events: [],
        conn: 'connecting',
      }
      set((s) => ({ turns: [...s.turns, turn], activeId: runId, cursor: null }))

      driver = createDriver(runId, speed)
      driver.start({
        onOpen: (meta) => patch(set, runId, { title: meta.title, conn: 'streaming' }),
        onEvent: (event) =>
          set((s) => ({
            turns: s.turns.map((t) =>
              t.id === runId ? { ...t, events: [...t.events, event] } : t,
            ),
          })),
        onDone: () => patch(set, runId, { conn: 'done' }),
        onError: (err) => patch(set, runId, { conn: 'error', error: err.message }),
      })
    } catch (err) {
      set({ submitting: false })
      throw err instanceof Error ? err : new Error(String(err))
    } finally {
      set({ submitting: false })
    }
  },

  selectTurn: (activeId) => set({ activeId, cursor: null }),

  replay() {
    const turn = activeTurn(get())
    if (!turn) return

    driver?.stop()
    set((s) => ({
      turns: s.turns.map((t) => (t.id === turn.id ? { ...t, events: [], conn: 'connecting' } : t)),
      cursor: null,
    }))

    driver = createDriver(turn.id, get().speed)
    driver.start({
      onOpen: (meta) => patch(set, turn.id, { title: meta.title, conn: 'streaming' }),
      onEvent: (event) =>
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === turn.id ? { ...t, events: [...t.events, event] } : t,
          ),
        })),
      onDone: () => patch(set, turn.id, { conn: 'done' }),
      onError: (err) => patch(set, turn.id, { conn: 'error', error: err.message }),
    })
  },

  reset() {
    driver?.stop()
    driver = null
    set({ threadId: newThreadId(), turns: [], activeId: null, cursor: null })
  },

  disconnect() {
    driver?.stop()
    driver = null
  },

  setCursor: (cursor) => set({ cursor }),
  setSpeed: (speed) => set({ speed }),
}))

/** 특정 턴의 필드만 갱신한다 (스트림 콜백이 늦게 도착해도 다른 턴을 건드리지 않는다) */
function patch(
  set: (fn: (s: RunStore) => Partial<RunStore>) => void,
  runId: string,
  fields: Partial<Turn>,
) {
  set((s) => ({ turns: s.turns.map((t) => (t.id === runId ? { ...t, ...fields } : t)) }))
}

export function activeTurn(s: Pick<RunStore, 'turns' | 'activeId'>): Turn | undefined {
  return s.turns.find((t) => t.id === s.activeId)
}

/** 활성 턴에서 현재 커서 기준으로 적용할 이벤트 개수 */
export function visibleCount(s: Pick<RunStore, 'turns' | 'activeId' | 'cursor'>): number {
  const turn = activeTurn(s)
  if (!turn) return 0
  return s.cursor ?? turn.events.length
}

/**
 * 파생 상태 셀렉터. 활성 턴과 커서가 실제로 바뀔 때만 다시 접는다.
 * (zustand는 셀렉터 결과를 캐시하지 않으므로 여기서 직접 메모한다.)
 */
let memoKey = ''
let memoValue: RunState = emptyRun()

export function useRunState(): RunState {
  return useRunStore((s) => {
    const turn = activeTurn(s)
    if (!turn) {
      if (memoKey !== '') {
        memoKey = ''
        memoValue = emptyRun()
      }
      return memoValue
    }

    const count = visibleCount(s)
    const key = `${turn.id}:${turn.events.length}:${count}`
    if (key !== memoKey) {
      memoKey = key
      memoValue = reduceEvents(turn.id, turn.events.slice(0, count))
    }
    return memoValue
  })
}

/** 특정 턴의 최종 상태 (대화 목록에서 각 턴의 답변을 보여줄 때) */
export function runStateOf(turn: Turn): RunState {
  return reduceEvents(turn.id, turn.events)
}
