import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { CanvasEmpty } from './features/graph/CanvasEmpty'
import { FlowCanvas } from './features/graph/FlowCanvas'
import { SidePanel } from './features/panel/SidePanel'
import { PromptBar } from './features/prompt/PromptBar'
import { ResultOverlay } from './features/result/ResultOverlay'
import { Toolbar } from './features/session/Toolbar'
import { Timeline } from './features/timeline/Timeline'
import { useRunStore } from './stores/runStore'

export default function App() {
  // 자동 실행하지 않는다. 사용자가 요청을 입력해야 시작한다.
  const disconnect = useRunStore((s) => s.disconnect)
  const error = useRunStore((s) => s.error)

  useEffect(() => disconnect, [disconnect])

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />

        <main className="app__body">
          <div className="app__canvas">
            {error && <div className="banner banner--error">{error}</div>}
            <FlowCanvas />
            <CanvasEmpty />
            <ResultOverlay />
          </div>
          <SidePanel />
        </main>

        <Timeline />
        <PromptBar />
      </div>
    </ReactFlowProvider>
  )
}
