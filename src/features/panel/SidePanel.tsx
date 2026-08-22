import { useEffect, useRef } from 'react'
import { rootAgent } from '../../entities/run'
import { useRunState, useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import { Inspector } from '../inspector/Inspector'
import { ResultView } from '../result/ResultView'

export function SidePanel() {
  const run = useRunState()
  const runId = useRunStore((s) => s.runId)
  const tab = useViewStore((s) => s.panelTab)
  const setTab = useViewStore((s) => s.setTab)

  const root = rootAgent(run)
  const done = root?.status === 'done' || root?.status === 'error'

  // 실행이 끝나는 순간 결과 탭으로 한 번만 데려온다.
  // (같은 실행 안에서 사용자가 다시 에이전트 탭으로 가면 그 선택을 존중)
  const switchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (done && switchedFor.current !== runId) {
      switchedFor.current = runId
      setTab('result')
    }
  }, [done, runId, setTab])

  return (
    <aside className="panel">
      <nav className="panel__tabs">
        <button data-active={tab === 'result' || undefined} onClick={() => setTab('result')}>
          결과
          {done && <i className={`tab-dot ${root?.status === 'error' ? 'is-error' : 'is-done'}`} />}
        </button>
        <button data-active={tab === 'agent' || undefined} onClick={() => setTab('agent')}>
          에이전트
        </button>
      </nav>

      <div className="panel__body">{tab === 'result' ? <ResultView /> : <Inspector />}</div>
    </aside>
  )
}
