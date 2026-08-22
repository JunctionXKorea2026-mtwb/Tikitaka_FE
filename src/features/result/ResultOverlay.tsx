import { useEffect } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { ResultView } from './ResultView'

/** 결과를 캔버스 위 넓은 카드로 펼쳐 보는 오버레이. Esc 또는 배경 클릭으로 닫는다. */
export function ResultOverlay() {
  const expanded = useViewStore((s) => s.resultExpanded)
  const setResultExpanded = useViewStore((s) => s.setResultExpanded)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResultExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, setResultExpanded])

  if (!expanded) return null

  return (
    <div className="overlay" onClick={() => setResultExpanded(false)}>
      <div className="overlay__card" onClick={(e) => e.stopPropagation()}>
        <button className="overlay__close" onClick={() => setResultExpanded(false)}>
          닫기 (Esc)
        </button>
        <ResultView expanded />
      </div>
    </div>
  )
}
