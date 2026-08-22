import { rootAgent, runTotals, type RunState } from '../../entities/run'
import { runStateOf, useRunStore, type Turn } from '../../stores/runStore'
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
  const list = expanded ? turns.filter((t) => t.id === activeId) : turns

  return (
    <div className={`result${expanded ? ' result--expanded' : ''}`}>
      {list.map((turn, i) => (
        <TurnCard
          key={turn.id}
          turn={turn}
          index={expanded ? turns.findIndex((t) => t.id === turn.id) : i}
          active={turn.id === activeId}
          expanded={expanded}
          onSelect={() => selectTurn(turn.id)}
          onExpand={() => setResultExpanded(true)}
        />
      ))}
    </div>
  )
}

function TurnCard({
  turn,
  index,
  active,
  expanded,
  onSelect,
  onExpand,
}: {
  turn: Turn
  index: number
  active: boolean
  expanded: boolean
  onSelect: () => void
  onExpand: () => void
}) {
  const run = runStateOf(turn)
  const root = rootAgent(run)
  const done = root?.status === 'done' || root?.status === 'error'
  const failed = root?.status === 'error'

  return (
    <section className={`turn${active ? ' is-active' : ''}`}>
      <button className="turn__ask" onClick={onSelect}>
        <span className="turn__index">{index + 1}</span>
        <span className="turn__prompt">{turn.prompt}</span>
      </button>

      {/* 접힌 턴은 한 줄 요약만. 펼치면 패널이 답변으로 가득 찬다. */}
      {!active && !expanded ? (
        <p className="turn__folded" onClick={onSelect}>
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
