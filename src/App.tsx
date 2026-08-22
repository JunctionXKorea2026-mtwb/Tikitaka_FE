import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { FlowCanvas } from './features/graph/FlowCanvas'
import { SidePanel } from './features/panel/SidePanel'
import { PromptBar } from './features/prompt/PromptBar'
import { ResultOverlay } from './features/result/ResultOverlay'
import { Toolbar } from './features/session/Toolbar'
import { Timeline } from './features/timeline/Timeline'
import { useRunStore } from './stores/runStore'

export default function App() {
  const connect = useRunStore((s) => s.connect)
  const disconnect = useRunStore((s) => s.disconnect)
  const error = useRunStore((s) => s.error)

  useEffect(() => {
    connect('run-001')
    return disconnect
  }, [connect, disconnect])

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />

        <main className="app__body">
          <div className="app__canvas">
            {error && <div className="banner banner--error">{error}</div>}
            <FlowCanvas />
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
