import { useCallback, useEffect, useRef } from 'react'
import { rootAgent } from '../../entities/run'
import { useRunState } from '../../stores/runStore'
import { MAX_PANEL, MIN_PANEL, useViewStore } from '../../stores/viewStore'
import { Inspector } from '../inspector/Inspector'
import { ResultView } from '../result/ResultView'

/**
 * 우측 상세 패널.
 *
 * 항상 떠 있지 않는다 — 원자를 클릭했을 때만 열린다. 3D를 보는 동안에는
 * 화면을 온전히 쓰고, 파고들 때만 옆에서 나온다.
 *
 * 너비는 왼쪽 모서리를 끌어 조절하고 저장된다.
 */
export function SidePanel() {
  const run = useRunState()
  const tab = useViewStore((s) => s.panelTab)
  const setTab = useViewStore((s) => s.setTab)
  const closePanel = useViewStore((s) => s.closePanel)
  const setPanelWidth = useViewStore((s) => s.setPanelWidth)

  const root = rootAgent(run)
  const done = root?.status === 'done' || root?.status === 'error'

  // Esc로 닫기 — 열려 있는 오버레이의 기본 기대다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePanel])

  // 오른쪽 끝에서 포인터까지의 거리가 곧 너비다
  const dragging = useRef(false)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      setPanelWidth(window.innerWidth - e.clientX)
    },
    [setPanelWidth],
  )

  const stop = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <aside className="panel">
      <div
        className="panel__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 너비 조절"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onDoubleClick={() => setPanelWidth((MIN_PANEL + MAX_PANEL) / 2)}
      />

      <nav className="panel__tabs">
        <button data-active={tab === 'result' || undefined} onClick={() => setTab('result')}>
          결과
          {done && <i className={`tab-dot ${root?.status === 'error' ? 'is-error' : 'is-done'}`} />}
        </button>
        <button data-active={tab === 'agent' || undefined} onClick={() => setTab('agent')}>
          에이전트
        </button>
        <button className="panel__close" onClick={closePanel} title="닫기 (Esc)">
          ✕
        </button>
      </nav>

      <div className="panel__body">{tab === 'result' ? <ResultView /> : <Inspector />}</div>
    </aside>
  )
}
