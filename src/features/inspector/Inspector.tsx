import { useState } from 'react'
import type { Speech } from '../../entities/run'
import { useRunState } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

/**
 * 발언 하나. 접힌 상태에서는 요약 한 줄, 펼치면 전문.
 * 토론 백엔드의 발언은 수천 자라 기본으로 펼쳐두면 패널을 못 읽는다.
 */
function SpeechItem({ speech, defaultOpen }: { speech: Speech; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <li className={`speech${open ? ' is-open' : ''}`}>
      <button className="speech__head" onClick={() => setOpen((v) => !v)}>
        <span className="speech__caret">{open ? '▾' : '▸'}</span>
        <span className="speech__summary">{speech.summary || '발언'}</span>
        <span className="speech__ts">{speech.ts.toFixed(1)}s</span>
      </button>
      {open && <p className="speech__text">{speech.text}</p>}
    </li>
  )
}

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

      {agent.speeches.length > 0 && (
        <section className="inspector__section">
          <h3>발언 {agent.speeches.length}건</h3>
          <ul className="speeches">
            {agent.speeches.map((speech, i) => (
              <SpeechItem key={`${speech.ts}-${i}`} speech={speech} defaultOpen={i === 0} />
            ))}
          </ul>
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
