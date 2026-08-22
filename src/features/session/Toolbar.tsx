import { isLiveBackend } from '../../transport'
import { useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

export function Toolbar() {
  const runId = useRunStore((s) => s.runId)
  const title = useRunStore((s) => s.title)
  const speed = useRunStore((s) => s.speed)
  const replay = useRunStore((s) => s.replay)
  const setSpeed = useRunStore((s) => s.setSpeed)

  const showTools = useViewStore((s) => s.showTools)
  const toggleTools = useViewStore((s) => s.toggleTools)
  const resetPositions = useViewStore((s) => s.resetPositions)

  const hasRun = Boolean(runId)

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo">◇</span>
        <div>
          <h1>Agent Flow</h1>
          <p>{title || '요청을 입력하면 실행이 시작됩니다'}</p>
        </div>
      </div>

      <div className="toolbar__actions">
        <span className={`source${isLiveBackend ? ' is-live' : ''}`}>
          {isLiveBackend ? 'API' : 'MOCK'}
        </span>

        <label className="speed">
          속도
          <select
            value={speed}
            onChange={(e) => {
              // 재생 속도는 드라이버 생성 시점에 고정되므로 바꾸면 다시 재생한다
              setSpeed(Number(e.target.value))
              replay()
            }}
          >
            {[1, 2, 4, 8].map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>

        <button onClick={replay} disabled={!hasRun}>
          다시 재생
        </button>
        <button onClick={toggleTools} aria-pressed={showTools}>
          도구 {showTools ? '숨기기' : '보기'}
        </button>
        <button onClick={resetPositions} disabled={!hasRun}>
          배치 초기화
        </button>
      </div>
    </header>
  )
}
