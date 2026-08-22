# Tikitaka FE

JunctionX Korea 2026 — 프론트엔드 저장소.

## 브랜치

| 브랜치 | 내용 |
|---|---|
| `main` | 실제 프론트엔드 (작업 예정) |
| `mockup` | React Flow 기반 에이전트 실행 시각화 목업 |

## 목업 실행

`mockup` 브랜치는 백엔드 없이 단독으로 돌아간다. mock JSON 이벤트를 실시간 스트림처럼
리플레이해서, 에이전트들이 서로 메시지를 주고받고 도구를 호출하는 과정을 그래프로 보여준다.

```bash
git checkout mockup
npm install
npm run dev
```

백엔드가 준비되면 `.env`에 `VITE_API_URL` 한 줄만 넣으면 실제 SSE 스트림으로 전환된다.
기대하는 API 계약은 `mockup` 브랜치의 README에 정리돼 있다.
