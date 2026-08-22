import { useState } from 'react'
import { rootAgent, runTotals, type RunState } from '../../entities/run'
import { arrangeTurns, runStateOf, useRunStore, type Turn } from '../../stores/runStore'
import { isLiveBackend } from '../../transport'
import { useViewStore } from '../../stores/viewStore'

/**
 * 대화 뷰 — 턴이 쌓인다.
 *
 * 후속 질문은 이전 턴을 지우지 않는다. 각 턴은 요청↔답변 한 쌍이고,
 * 클릭하면 캔버스(2D·3D 모두)가 그 턴으로 옮겨간다.
 *
 * 활성 턴만 펼쳐 보여주고 나머지는 접는다 — 안 그러면 패널이 답변으로 가득 찬다.
 */
export function ResultView({ expanded = false }: { expanded?: boolean }) {
  const turns = useRunStore((s) => s.turns)
  const activeId = useRunStore((s) => s.activeId)
  const selectTurn = useRunStore((s) => s.selectTurn)
  const submitting = useRunStore((s) => s.submitting)
  const setResultExpanded = useViewStore((s) => s.setResultExpanded)

  // 펼침은 여기서 관리한다. 카드를 누르면 접히고 펼쳐질 뿐,
  // 캔버스가 다른 대화로 튀지 않는다 — 화면이 흔들리는 게 제일 거슬리는 동작이라
  // "보러 가기"는 별도 버튼으로 뗐다.
  const [openIds, setOpenIds] = useState<string[]>(() => (activeId ? [activeId] : []))
  // 만들어진 순서가 아니라 트리 순서 — 후속 질문은 부모 바로 아래 온다
  const arranged = arrangeTurns(turns)
  const toggle = (id: string) =>
    setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  if (turns.length === 0) {
    return (
      <div className="result">
        <p className="result__idle">
          {submitting ? '실행을 시작하는 중…' : '아래 입력창에 요청을 입력하세요.'}
        </p>
      </div>
    )
  }

  // 확대 보기에서는 활성 턴 하나만 크게
  const list = expanded ? arranged.filter((a) => a.turn.id === activeId) : arranged

  return (
    <div className={`result${expanded ? ' result--expanded' : ''}`}>
      {list.map(({ turn, number, depth }) => (
        <TurnCard
          key={turn.id}
          turn={turn}
          number={number}
          depth={expanded ? 0 : depth}
          active={turn.id === activeId}
          expanded={expanded}
          open={expanded || openIds.includes(turn.id)}
          onToggle={() => toggle(turn.id)}
          onSelect={() => selectTurn(turn.id)}
          onExpand={() => setResultExpanded(true)}
        />
      ))}
    </div>
  )
}

function TurnCard({
  turn,
  number,
  depth,
  active,
  expanded,
  open,
  onToggle,
  onSelect,
  onExpand,
}: {
  turn: Turn
  /** 1, 2, 2-1 … 번호가 대화 구조를 말한다 */
  number: string
  /** 들여쓰기 단계 */
  depth: number
  active: boolean
  expanded: boolean
  open: boolean
  onToggle: () => void
  onSelect: () => void
  onExpand: () => void
}) {
  const run = runStateOf(turn)
  const root = rootAgent(run)
  const done = root?.status === 'done' || root?.status === 'error'
  const failed = root?.status === 'error'

  return (
    <section
      className={`turn${active ? ' is-active' : ''}${depth > 0 ? ' turn--child' : ''}`}
      style={{ marginLeft: depth * 12 }}
    >
      <div className="turn__row">
        <button className="turn__ask" onClick={onToggle} aria-expanded={open}>
          <span className="turn__caret">{open ? '▾' : '▸'}</span>
          <span className="turn__index">{number}</span>
          <span className="turn__prompt">{turn.prompt}</span>
        </button>

        {!expanded && !active && (
          <button className="turn__goto" onClick={onSelect} title="이 대화를 캔버스에서 보기">
            보기
          </button>
        )}
        {!expanded && active && <span className="turn__here">보는 중</span>}
      </div>

      {open && <TurnId id={turn.id} />}

      {/* 접힌 턴은 한 줄 요약만. 펼치면 패널이 답변으로 가득 찬다. */}
      {!open ? (
        <p className="turn__folded" onClick={onToggle}>
          {done ? summarize(root?.result) : '진행 중…'}
        </p>
      ) : (
        <>
          {done && root ? (
            <div className={`answer${failed ? ' answer--error' : ''}`}>
              <header className="answer__head">
                <span className="answer__badge">{failed ? '부분 실패' : '완료'}</span>
                <h3>답변</h3>
                <button
                  className="answer__copy"
                  onClick={() => void navigator.clipboard.writeText(root.result ?? '')}
                >
                  복사
                </button>
              </header>
              <p className={`answer__text${expanded ? ' answer__text--lg' : ''}`}>
                {root.result ?? '결과 없음'}
              </p>
            </div>
          ) : (
            <Progress run={run} conn={turn.conn} />
          )}

          <Stats run={run} />

          {!expanded && done && (
            <button className="result__expand" onClick={onExpand}>
              크게 보기 ⤢
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * 실행 id. 실제 백엔드에서는 이게 discussionId라서, 서버 로그를 대조하거나
 * API를 직접 찔러볼 때 필요하다. 클릭하면 복사된다.
 */
function TurnId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      className={`turn__id${copied ? ' is-copied' : ''}`}
      title={`${id}\n(클릭하면 복사)`}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }}
    >
      <span className="turn__id-key">{isLiveBackend ? 'discussionId' : 'runId'}</span>
      <code>{id}</code>
      <span className="turn__id-copy">{copied ? '복사됨' : '⧉'}</span>
    </button>
  )
}

function Stats({ run }: { run: RunState }) {
  const totals = runTotals(run)
  if (totals.agents === 0) return null

  return (
    <dl className="result__stats">
      <Stat label="경과" value={`${totals.elapsed.toFixed(1)}s`} />
      <Stat label="에이전트" value={String(totals.agents)} />
      <Stat
        label="도구"
        value={
          totals.failedCalls > 0
            ? `${totals.toolCalls} (실패 ${totals.failedCalls})`
            : String(totals.toolCalls)
        }
        warn={totals.failedCalls > 0}
      />
      <Stat label="토큰" value={totals.tokens > 0 ? totals.tokens.toLocaleString() : '—'} />
    </dl>
  )
}

function Progress({ run, conn }: { run: RunState; conn: string }) {
  if (conn === 'connecting') return <p className="result__idle">실행을 시작하는 중…</p>
  if (run.agentOrder.length === 0) {
    return <p className="result__idle">아직 실행된 에이전트가 없습니다.</p>
  }

  const active = run.agentOrder
    .map((id) => run.agents[id])
    .filter((a) => a && a.status !== 'done' && a.status !== 'error')

  return (
    <section className="progress">
      <h3>진행 중</h3>
      {active.length === 0 ? (
        <p className="result__idle">하위 작업은 끝났고 최종 정리를 기다리는 중입니다.</p>
      ) : (
        <ul>
          {active.map((agent) => (
            <li key={agent.id} className={`progress__row status-${agent.status}`}>
              <i className="pulse" aria-hidden />
              <strong>{agent.label}</strong>
              <span>
                {agent.calls.find((c) => c.status === 'running')?.toolName ??
                  agent.thought ??
                  '작업 중'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={warn ? 'is-warn' : undefined}>{value}</dd>
    </div>
  )
}

/** 접힌 턴에 보여줄 한 줄. 목업 머리말은 떼고 본문 첫 줄만. */
function summarize(result?: string): string {
  if (!result) return '결과 없음'
  const line = result
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('[목업 응답]') && !l.startsWith('요청:'))
  const text = line ?? result.split('\n')[0]
  return text.length > 70 ? `${text.slice(0, 70)}…` : text
}
