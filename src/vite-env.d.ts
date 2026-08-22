/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 설정하면 mock JSON 대신 실제 SSE 백엔드를 사용한다. 예: http://localhost:8000 */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
