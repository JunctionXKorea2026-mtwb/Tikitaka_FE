import { isLiveBackend } from '../../transport'
import { activeTurn, useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

export function Toolbar() {
  const turn = useRunStore(activeTurn)
  const turnCount = useRunStore((s) => s.turns.length)
  const reset = useRunStore((s) => s.reset)
  const speed = useRunStore((s) => s.speed)
  const replay = useRunStore((s) => s.replay)
  const setSpeed = useRunStore((s) => s.setSpeed)

  const showTools = useViewStore((s) => s.showTools)
  const toggleTools = useViewStore((s) => s.toggleTools)
  const resetPositions = useViewStore((s) => s.resetPositions)
  const dimension = useViewStore((s) => s.dimension)
  const toggleDimension = useViewStore((s) => s.toggleDimension)

  const hasRun = Boolean(turn)

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo">◇</span>
        <div>
          <h1>Agent Flow</h1>
          <p>
            {turn ? (
              <>
                {turnCount}개 턴 · {turn.title || turn.prompt}
                <code className="toolbar__id" title={turn.id}>
                  {turn.id.slice(0, 8)}
                </code>
              </>
            ) : (
              '요청을 입력하면 실행이 시작됩니다'
            )}
          </p>
        </div>
      </div>

      <div className="toolbar__actions">
        <span className={`source${isLiveBackend ? ' is-live' : ''}`}>
          {isLiveBackend ? 'API' : 'MOCK'}
        </span>

        <div className="dim" role="group" aria-label="보기 차원">
          <button data-active={dimension === '2d' || undefined} onClick={toggleDimension}>
            2D
          </button>
          <button data-active={dimension === '3d' || undefined} onClick={toggleDimension}>
            3D
          </button>
        </div>

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
        <button onClick={reset} disabled={!hasRun}>
          새 대화
        </button>
      </div>
    </header>
  )
}
