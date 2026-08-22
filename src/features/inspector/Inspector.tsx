import { useRunState } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

const preview = (value: unknown, max = 160) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function Inspector() {
  const run = useRunState()
  const selectedId = useViewStore((s) => s.selectedId)
  const agent = selectedId ? run.agents[selectedId] : undefined

  if (!agent) {
    return (
      <div className="inspector inspector--empty">
        <p>캔버스에서 노드를 클릭하면 해당 에이전트의 입출력과 로그를 볼 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="inspector">
      <header className="inspector__head">
        <h2>{agent.label}</h2>
        <span className={`chip status-${agent.status}`}>{agent.status}</span>
      </header>

      <dl className="inspector__facts">
        <div>
          <dt>역할</dt>
          <dd>{agent.role}</dd>
        </div>
        <div>
          <dt>소요</dt>
          <dd>{((agent.finishedAt ?? run.clock) - agent.startedAt).toFixed(1)}s</dd>
        </div>
        <div>
          <dt>도구 호출</dt>
          <dd>{agent.calls.length}회</dd>
        </div>
        <div>
          <dt>토큰</dt>
          <dd>{agent.tokens?.toLocaleString() ?? '—'}</dd>
        </div>
      </dl>

      {agent.result && (
        <section className="inspector__section">
          <h3>결과</h3>
          <p className="inspector__result">{agent.result}</p>
        </section>
      )}

      {agent.calls.length > 0 && (
        <section className="inspector__section">
          <h3>도구 호출</h3>
          <ul className="calls">
            {agent.calls.map((call) => (
              <li key={call.callId} className={`call tool-${call.status}`}>
                <div className="call__head">
                  <code>{call.toolName}</code>
                  <span>{call.finishedAt ? `${(call.finishedAt - call.startedAt).toFixed(1)}s` : '진행 중'}</span>
                </div>
                <p className="call__io">→ {preview(call.input)}</p>
                {call.status !== 'running' && (
                  <p className="call__io">← {preview(call.error ?? call.output)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="inspector__section">
        <h3>로그</h3>
        <ul className="log">
          {agent.log.map((entry, i) => (
            <li key={`${entry.ts}-${i}`}>
              <span className="log__ts">{entry.ts.toFixed(1)}s</span>
              <span className="log__text">{entry.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
