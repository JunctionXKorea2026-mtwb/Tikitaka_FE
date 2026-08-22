import { isLiveBackend } from '../../transport'
import { useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

const RUNS = [
  { id: 'run-001', name: '리서치 파이프라인' },
  { id: 'run-002', name: '실패 케이스' },
]

export function Toolbar() {
  const runId = useRunStore((s) => s.runId)
  const title = useRunStore((s) => s.title)
  const speed = useRunStore((s) => s.speed)
  const connect = useRunStore((s) => s.connect)
  const setSpeed = useRunStore((s) => s.setSpeed)

  const showTools = useViewStore((s) => s.showTools)
  const toggleTools = useViewStore((s) => s.toggleTools)
  const resetPositions = useViewStore((s) => s.resetPositions)

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo">◇</span>
        <div>
          <h1>Agent Flow</h1>
          <p>{title || runId || '실행을 선택하세요'}</p>
        </div>
      </div>

      <div className="toolbar__actions">
        <span className={`source${isLiveBackend ? ' is-live' : ''}`}>
          {isLiveBackend ? 'API' : 'MOCK'}
        </span>

        <select value={runId} onChange={(e) => connect(e.target.value)}>
          {RUNS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <label className="speed">
          속도
          <select
            value={speed}
            onChange={(e) => {
              // 재생 속도는 드라이버 생성 시점에 고정되므로 바꾸면 다시 연결한다
              setSpeed(Number(e.target.value))
              connect(runId || RUNS[0].id)
            }}
          >
            {[1, 2, 4, 8].map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>

        <button onClick={() => connect(runId || RUNS[0].id)}>다시 재생</button>
        <button onClick={toggleTools} aria-pressed={showTools}>
          도구 {showTools ? '숨기기' : '보기'}
        </button>
        <button onClick={resetPositions}>배치 초기화</button>
      </div>
    </header>
  )
}
