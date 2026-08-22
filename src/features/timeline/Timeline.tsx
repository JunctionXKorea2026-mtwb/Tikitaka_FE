import { useRunStore, visibleCount } from '../../stores/runStore'

/**
 * 이벤트 인덱스를 스크럽하는 타임라인.
 * 리듀서가 순수하므로 "과거로 되감기"가 slice 한 번으로 끝난다.
 */
export function Timeline() {
  const events = useRunStore((s) => s.events)
  const cursor = useRunStore((s) => s.cursor)
  const conn = useRunStore((s) => s.conn)
  const setCursor = useRunStore((s) => s.setCursor)

  const total = events.length
  const current = visibleCount({ events, cursor })
  const live = cursor === null
  const at = events[current - 1]

  return (
    <footer className="timeline">
      <button
        className={`timeline__live${live ? ' is-live' : ''}`}
        onClick={() => setCursor(null)}
        disabled={live}
      >
        <i className="dot" aria-hidden />
        LIVE
      </button>

      <input
        className="timeline__range"
        type="range"
        min={0}
        max={total}
        value={current}
        disabled={total === 0}
        onChange={(e) => {
          const next = Number(e.target.value)
          setCursor(next >= total ? null : next)
        }}
      />

      <div className="timeline__readout">
        <strong>{current}</strong>
        <span>/ {total} events</span>
        {at && <span className="timeline__ts">t={at.ts.toFixed(1)}s</span>}
        <span className={`timeline__conn conn-${conn}`}>{conn}</span>
      </div>
    </footer>
  )
}
