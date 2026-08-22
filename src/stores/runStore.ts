import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentEvent } from '../entities/event'
import { reduceEvents } from '../entities/reduce'
import { emptyRun, type RunState } from '../entities/run'
import { createDriver, createRun, isLiveBackend, type RunDriver } from '../transport'

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
  /** 새로고침 뒤, 아직 안 끝난 실행이나 비어 있는 턴을 다시 불러온다 */
  resume: () => void
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

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
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
          driver.start(handlersFor(set, runId))
        } catch (err) {
          set({ submitting: false })
          throw err instanceof Error ? err : new Error(String(err))
        } finally {
          set({ submitting: false })
        }
      },

      selectTurn(activeId) {
    set({ activeId, cursor: null })
    // 옮겨 간 턴이 비어 있으면(옛 저장본) 다시 불러온다
    const turn = activeTurn(get())
    if (turn && turn.events.length === 0) get().resume()
  },

      /**
       * 새로고침 뒤 이어받기.
       *
       * discussionId를 저장해 두므로 서버에서 계속 돌고 있던 토론에 다시 붙을 수 있다.
       * mock 모드는 시나리오가 메모리에만 있어서 이어받을 수 없다 — 끝난 것으로 표시한다.
       */
      resume() {
        const turn = activeTurn(get())
        if (!turn || isSettledConn(turn.conn)) return

        if (!isLiveBackend) {
          patch(set, turn.id, { conn: 'done' })
          return
        }

        driver?.stop()
        // 이미 받아둔 이벤트는 버린다. 폴링은 매번 전체를 다시 만들어 보내므로
        // 남겨두면 중복된다.
        set((s) => ({
          turns: s.turns.map((t) => (t.id === turn.id ? { ...t, events: [], conn: 'connecting' } : t)),
        }))
        driver = createDriver(turn.id, get().speed)
        driver.start(handlersFor(set, turn.id))
      },

      replay() {
        const turn = activeTurn(get())
        if (!turn) return

        driver?.stop()
        set((s) => ({
          turns: s.turns.map((t) => (t.id === turn.id ? { ...t, events: [], conn: 'connecting' } : t)),
          cursor: null,
        }))

        driver = createDriver(turn.id, get().speed)
        driver.start(handlersFor(set, turn.id))
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
    }),
    {
      name: 'agent-flow-thread',
      /**
       * 이벤트 스키마가 바뀌면 올린다.
       *
       * 저장된 건 도메인 상태가 아니라 **원본 이벤트**라서, 어댑터가 필드를 하나
       * 늘리면 옛 저장본에는 그 필드가 없다. 화면에는 조용히 빈 값으로 나온다
       * (발언 전문이 안 보이던 게 이 경우였다).
       * 그래서 이벤트만 비우고 대화는 남긴다 — discussionId가 있으니 다시 불러오면 된다.
       */
      version: 1,
      migrate: (state, from) => {
        const s = state as { turns?: Turn[] }
        if (from >= 1 || !s.turns) return state
        return {
          ...s,
          turns: s.turns.map((t) => ({ ...t, events: [], conn: 'idle' as ConnState })),
        }
      },
      // 함수와 일시적인 상태는 빼고, 대화만 저장한다.
      // 커서는 저장하지 않는다 — 새로고침하면 항상 최신을 보는 게 자연스럽다.
      partialize: (s) => ({
        threadId: s.threadId,
        // 너무 길어지면 localStorage 한도(약 5MB)에 걸린다
        turns: s.turns.slice(-MAX_STORED_TURNS),
        activeId: s.activeId,
        speed: s.speed,
      }),
    },
  ),
)

/** localStorage에 남겨둘 최대 턴 수 */
const MAX_STORED_TURNS = 30

const isSettledConn = (conn: ConnState) => conn === 'done' || conn === 'error'

/** 드라이버 콜백. submit·replay·resume이 같은 걸 쓴다. */
function handlersFor(set: SetFn, runId: string) {
  return {
    onOpen: (meta: { runId: string; title: string }) =>
      patch(set, runId, { title: meta.title, conn: 'streaming' as ConnState }),
    onEvent: (event: AgentEvent) =>
      set((s) => ({
        turns: s.turns.map((t) => (t.id === runId ? { ...t, events: [...t.events, event] } : t)),
      })),
    onDone: () => patch(set, runId, { conn: 'done' as ConnState }),
    onError: (err: Error) =>
      patch(set, runId, { conn: 'error' as ConnState, error: err.message }),
  }
}

type SetFn = (fn: (s: RunStore) => Partial<RunStore>) => void

/** 특정 턴의 필드만 갱신한다 (스트림 콜백이 늦게 도착해도 다른 턴을 건드리지 않는다) */
function patch(set: SetFn, runId: string, fields: Partial<Turn>) {
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

/**
 * 대화 목록에 붙일 번호.
 *
 * 뿌리(새 주제)는 1, 2, 3…
 * 이어서 물은 턴은 부모 번호에 이어 붙인다 — 2의 첫 후속 질문은 2-1, 그다음은 2-2.
 * 더 깊이 들어가면 2-1-1 처럼 계속 이어진다.
 *
 * 구분선 대신 번호가 구조를 말하게 한다. 목록은 만들어진 순서 그대로 둔다.
 */
export function turnNumbers(turns: Turn[]): Map<string, string> {
  const known = new Set(turns.map((t) => t.id))
  const childCount = new Map<string, number>()
  const numbers = new Map<string, string>()
  let rootCount = 0

  for (const turn of turns) {
    // 부모가 목록에 없으면 (지워졌다면) 뿌리로 취급한다
    const parentId = turn.parentId && known.has(turn.parentId) ? turn.parentId : null

    if (!parentId) {
      rootCount += 1
      numbers.set(turn.id, String(rootCount))
      continue
    }

    const n = (childCount.get(parentId) ?? 0) + 1
    childCount.set(parentId, n)
    numbers.set(turn.id, `${numbers.get(parentId) ?? '?'}-${n}`)
  }

  return numbers
}
