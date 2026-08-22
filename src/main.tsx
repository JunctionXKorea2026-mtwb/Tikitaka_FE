import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

import '@xyflow/react/dist/style.css'
import './styles/global.css'
import './features/graph/graph.css'
import './features/graph3d/flow3d.css'
import './features/inspector/inspector.css'
import './features/panel/panel.css'
import './features/prompt/prompt.css'
import './features/result/result.css'
import './features/timeline/timeline.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
