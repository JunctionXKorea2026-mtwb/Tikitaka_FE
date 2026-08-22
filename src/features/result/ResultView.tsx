import { rootAgent, runTotals, type AgentState, type RunState } from '../../entities/run'
import { useRunState, useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

/**
 * 요청 ↔ 최종 답변을 짝지어 보여주는 뷰.
 *
 * 파이프라인의 답변은 루트 에이전트(부모 없는 에이전트)의 result다.
 * 파생 상태라 타임라인을 되감으면 자동으로 "진행 중"으로 돌아간다 — 별도 처리가 없다.
 *
 * 우측 패널(좁게)과 확대 오버레이(넓게)가 이 컴포넌트를 공유한다.
 */
export function ResultView({ expanded = false }: { expanded?: boolean }) {
  const run = useRunState()
  const prompt = useRunStore((s) => s.prompt)
  const title = useRunStore((s) => s.title)
  const conn = useRunStore((s) => s.conn)
  const submitting = useRunStore((s) => s.submitting)
  const select = useViewStore((s) => s.select)
  const setResultExpanded = useViewStore((s) => s.setResultExpanded)

  const root = rootAgent(run)
  const done = root?.status === 'done' || root?.status === 'error'
  const totals = runTotals(run)

  return (
    <div className={`result${expanded ? ' result--expanded' : ''}`}>
      <section className="result__request">
        <h3>요청</h3>
        <p>{prompt || title || '아래 입력창에 요청을 입력하세요.'}</p>
      </section>

      {done && root ? (
        <Answer agent={root} expanded={expanded} onInspect={() => select(root.id)} />
      ) : (
        <Progress run={run} conn={conn} submitting={submitting} />
      )}

      {totals.agents > 0 && (
        <dl className="result__stats">
          <Stat label="경과" value={`${totals.elapsed.toFixed(1)}s`} />
          <Stat label="에이전트" value={String(totals.agents)} />
          <Stat
            label="도구 호출"
            value={
              totals.failedCalls > 0
                ? `${totals.toolCalls} (실패 ${totals.failedCalls})`
                : String(totals.toolCalls)
            }
            warn={totals.failedCalls > 0}
          />
          <Stat label="토큰" value={totals.tokens > 0 ? totals.tokens.toLocaleString() : '—'} />
        </dl>
      )}

      {!expanded && done && (
        <button className="result__expand" onClick={() => setResultExpanded(true)}>
          크게 보기 ⤢
        </button>
      )}
    </div>
  )
}

function Answer({
  agent,
  expanded,
  onInspect,
}: {
  agent: AgentState
  expanded: boolean
  onInspect: () => void
}) {
  const failed = agent.status === 'error'

  return (
    <section className={`answer${failed ? ' answer--error' : ''}`}>
      <header className="answer__head">
        <span className="answer__badge">{failed ? '부분 실패' : '완료'}</span>
        <h3>답변</h3>
        <button
          className="answer__copy"
          onClick={() => void navigator.clipboard.writeText(agent.result ?? '')}
        >
          복사
        </button>
      </header>

      <p className={`answer__text${expanded ? ' answer__text--lg' : ''}`}>
        {agent.result ?? '결과 없음'}
      </p>

      <button className="answer__inspect" onClick={onInspect}>
        {agent.label} 실행 상세 →
      </button>
    </section>
  )
}

function Progress({
  run,
  conn,
  submitting,
}: {
  run: RunState
  conn: string
  submitting: boolean
}) {
  if (submitting || conn === 'connecting') {
    return <p className="result__idle">실행을 시작하는 중…</p>
  }
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
