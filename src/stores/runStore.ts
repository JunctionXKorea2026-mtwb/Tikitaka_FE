import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentEvent } from '../entities/event'
import { reduceEvents } from '../entities/reduce'
import { emptyRun, type RunState } from '../entities/run'
import {
  createDriver,
  createRun,
  isLiveBackend,
  summarizeResultFor,
  summarizeTitleFor,
  type RunDriver,
} from '../transport'

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
  /** LLM이 줄인 한 줄 제목. 원자 라벨과 목록에 쓴다. */
  titleSummary?: string
  /** LLM이 줄인 결론 요약. 원문 위에 먼저 보여준다. */
  resultSummary?: string
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
  /** 질문을 보내지 못했을 때의 사유. 화면에 띄운다. */
  submitError?: string

  submit: (prompt: string, options?: { newTopic?: boolean }) => Promise<void>
  /** 새로고침 뒤, 아직 안 끝난 실행이나 비어 있는 턴을 다시 불러온다 */
  resume: () => void
  /** 질문 제목과 결론을 LLM으로 줄인다 (백엔드가 있을 때만) */
  summarize: (id: string) => void
  /** 캔버스를 다른 턴으로 옮긴다 */
  selectTurn: (id: string) => void
  /** 활성 턴을 처음부터 다시 재생 */
  replay: () => void
  /** 대화를 비우고 새로 시작 */
  reset: () => void
  disconnect: () => void
  setCursor: (cursor: number | null) => void
  setSpeed: (speed: number) => void
  clearSubmitError: () => void
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
          driver.start(handlersFor(set, runId, (id) => get().summarize(id)))
        } catch (err) {
          set({ submitting: false })
          throw err instanceof Error ? err : new Error(String(err))
        } finally {
          set({ submitting: false })
        }
      },

      /**
   * 제목·결론 요약.
   *
   * 이미 있으면 다시 부르지 않는다 — 요약도 LLM 호출이라 공짜가 아니고,
   * 폴링이 끝날 때마다 부르면 같은 결론을 몇 번씩 요약하게 된다.
   * 실패해도 조용히 넘어간다. 요약은 덤이지 본문이 아니다.
   */
  summarize(id) {
    const turn = get().turns.find((t) => t.id === id)
    if (!turn) return

    if (!turn.titleSummary && turn.prompt) {
      void summarizeTitleFor(turn.prompt)
        .then((title) => title && patch(set, id, { titleSummary: title }))
        .catch(() => {})
    }

    if (!turn.resultSummary) {
      const result = rootResultOf(turn)
      if (result && result.length > 160) {
        void summarizeResultFor(result)
          .then((summary) => summary && patch(set, id, { resultSummary: summary }))
          .catch(() => {})
      }
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
        driver.start(handlersFor(set, turn.id, (id) => get().summarize(id)))
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
        driver.start(handlersFor(set, turn.id, (id) => get().summarize(id)))
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
      clearSubmitError: () => set({ submitError: undefined }),
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
function handlersFor(set: SetFn, runId: string, onSettled?: (id: string) => void) {
  return {
    onOpen: (meta: { runId: string; title: string }) =>
      patch(set, runId, { title: meta.title, conn: 'streaming' as ConnState }),
    onEvent: (event: AgentEvent) =>
      set((s) => ({
        turns: s.turns.map((t) => (t.id === runId ? { ...t, events: [...t.events, event] } : t)),
      })),
    onDone: () => {
      patch(set, runId, { conn: 'done' as ConnState })
      onSettled?.(runId)
    },
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

/** 대화 목록 한 줄. 번호와 깊이가 구조를 말한다. */
export interface ArrangedTurn {
  turn: Turn
  /** 1, 2, 2-1 … */
  number: string
  /** 들여쓰기 단계 */
  depth: number
}

/**
 * 대화를 트리 순서로 늘어놓는다.
 *
 * 만들어진 순서 그대로 두면 후속 질문이 부모와 떨어진다 —
 * 1 → 1-1 → 2 → 1-2 로 물으면 1-2가 목록 맨 끝에 가버린다.
 * 그래서 깊이 우선으로 훑어 **후속 질문이 항상 부모 바로 아래** 오게 한다.
 *
 * 뿌리끼리, 형제끼리는 만들어진 순서를 지킨다.
 * 부모가 목록에 없으면 (지워졌다면) 뿌리로 취급한다.
 */
export function arrangeTurns(turns: Turn[]): ArrangedTurn[] {
  const known = new Set(turns.map((t) => t.id))
  const children = new Map<string, Turn[]>()
  const roots: Turn[] = []

  for (const turn of turns) {
    const parentId = turn.parentId && known.has(turn.parentId) ? turn.parentId : null
    if (parentId) {
      const list = children.get(parentId) ?? []
      list.push(turn)
      children.set(parentId, list)
    } else {
      roots.push(turn)
    }
  }

  const out: ArrangedTurn[] = []
  // 부모를 자기 조상으로 두는 고리가 생겨도 멈추도록
  const seen = new Set<string>()

  const walk = (turn: Turn, number: string, depth: number) => {
    if (seen.has(turn.id)) return
    seen.add(turn.id)
    out.push({ turn, number, depth })
    ;(children.get(turn.id) ?? []).forEach((child, i) => {
      walk(child, `${number}-${i + 1}`, depth + 1)
    })
  }

  roots.forEach((root, i) => walk(root, String(i + 1), 0))

  // 고리 때문에 빠진 턴이 있으면 뒤에 붙여 잃지 않는다
  for (const turn of turns) {
    if (!seen.has(turn.id)) out.push({ turn, number: '?', depth: 0 })
  }

  return out
}

/** 루트 에이전트의 결과 = 그 턴의 최종 답변 */
function rootResultOf(turn: Turn): string | undefined {
  const run = reduceEvents(turn.id, turn.events)
  for (const id of run.agentOrder) {
    const agent = run.agents[id]
    if (agent && !agent.parentId) return agent.result
  }
  return undefined
}
