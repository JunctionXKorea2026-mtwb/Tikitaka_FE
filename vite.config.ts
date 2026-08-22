import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * 백엔드는 CORS를 열어두지 않았다 (Access-Control-Allow-Origin 없음, OPTIONS 405).
 * 브라우저에서 직접 부르면 전부 차단되므로 **개발 서버가 대신 프록시**한다.
 *
 * 그래서 앱은 절대 주소가 아니라 `/backend` 같은 상대 경로를 호출한다
 * (VITE_API_URL). 배포에서는 vercel.json의 rewrites가 같은 일을 한다.
 *
 * 백엔드가 CORS를 열면 VITE_API_URL에 절대 주소를 넣는 것으로 되돌릴 수 있다 —
 * 앱 코드는 그대로다.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_BACKEND_ORIGIN

  return {
    plugins: [react()],
    server: target
      ? {
          proxy: {
            '/backend': {
              target,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/backend/, ''),
              headers: { 'ngrok-skip-browser-warning': '1' },
            },
          },
        }
      : undefined,
  }
})
