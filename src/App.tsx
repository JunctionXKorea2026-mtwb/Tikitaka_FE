import { useEffect, type CSSProperties } from 'react'
import { CanvasEmpty } from './features/graph/CanvasEmpty'
import { Flow3D } from './features/graph3d/Flow3D'
import { SidePanel } from './features/panel/SidePanel'
import { PromptBar } from './features/prompt/PromptBar'
import { ResultOverlay } from './features/result/ResultOverlay'
import { Toolbar } from './features/session/Toolbar'
import { activeTurn, useRunStore } from './stores/runStore'
import { useViewStore } from './stores/viewStore'

export default function App() {
  // 자동 실행하지 않는다. 사용자가 요청을 입력해야 시작한다.
  const resume = useRunStore((s) => s.resume)
  const disconnect = useRunStore((s) => s.disconnect)
  const error = useRunStore((s) => activeTurn(s)?.error)

  const panelOpen = useViewStore((s) => s.panelOpen)
  const panelWidth = useViewStore((s) => s.panelWidth)

  // 새로고침해도 대화가 남아 있다. 아직 안 끝난 실행이면 다시 붙는다.
  useEffect(() => {
    resume()
    return disconnect
  }, [resume, disconnect])

  return (
    <div className="app" style={{ '--panel-w': `${panelWidth}px` } as CSSProperties}>
      <Toolbar />

      <main className="app__body">
        <div className="app__canvas">
          {error && <div className="banner banner--error">{error}</div>}
          <Flow3D />
          <CanvasEmpty />
          <ResultOverlay />
        </div>
        {panelOpen && <SidePanel />}
      </main>

      <PromptBar />
    </div>
  )
}
