# Agent Flow — 목업

> `mockup` 브랜치. 실제 프론트엔드는 `main`에서 작업한다.

React Flow로 멀티 에이전트 실행을 실시간 시각화하는 대시보드.
백엔드 없이 **입력한 요청에서 실행 시나리오를 생성해** 실시간 스트림처럼 재생하고,
**환경변수 한 줄로 실제 API로 전환**된다.

```bash
npm install
npm run dev
```

## 데이터 흐름

```
이벤트 스트림 (생성 시나리오 | SSE API)
      │  transport/  ← 유일한 교체 지점
      ▼
runStore.events[]           원본 이벤트, 절대 변형하지 않음
      │  reduceEvents()     순수 리듀서
      ▼
RunState                    에이전트/링크의 현재 상태 (React Flow를 모름)
      │  deriveGraph()      순수 변환
      ▼
nodes[] / edges[]           좌표는 아직 없음
      │  layoutGraph()      ELK, 위상이 바뀔 때만 실행
      ▼
<ReactFlow />
```

이 방향을 절대 거꾸로 흐르지 않게 하는 것이 이 프로젝트의 유일한 규칙이다.
소켓 콜백에서 `setNodes()`를 부르는 순간 구조가 무너진다.

## 구조

```
src/
├─ entities/          도메인 — event(백엔드 계약) / run(상태) / reduce(순수 리듀서)
├─ transport/         드라이버 추상화 — scenario(프롬프트→시나리오), mockDriver, sseDriver
├─ stores/            runStore(도메인) / viewStore(선택·좌표 오버라이드·필터·차원)
└─ features/
   ├─ graph/          2D — FlowCanvas, derive, layout/elk, edges/, CanvasEmpty
   │                  nodes/cards.tsx = 두 뷰가 공유하는 카드 생김새
   ├─ graph3d/        3D — scene(좌표·엣지 변환), Flow3D (CSS 3D, 의존성 없음)
   ├─ prompt/         하단 요청 입력 바 (Enter 전송 / Shift+Enter 줄바꿈)
   ├─ panel/          우측 탭 패널 셸 (결과 ↔ 에이전트)
   ├─ result/         요청↔답변 뷰 + 크게 보기 오버레이
   ├─ inspector/      선택한 에이전트의 입출력·도구 호출·로그
   ├─ timeline/       이벤트 인덱스 스크러버 (LIVE ↔ 과거 시점)
   └─ session/        툴바 — 재생 속도, 다시 재생, 표시 옵션
```

## 설계 결정 3가지

**1. 좌표는 도메인 상태 밖에 둔다**
`viewStore.positions`가 사용자가 드래그한 좌표를 덮어쓴다. 새 이벤트가 들어와 그래프가
다시 파생돼도 손으로 옮긴 노드는 제자리에 남는다.

**2. 레이아웃은 위상이 바뀔 때만 돈다**
`topologySignature()`는 노드 id와 **구조 엣지**(spawn/tool) id만 담는다. status가 초당
여러 번 바뀌어도 재배치가 일어나지 않는다.

**3. 메시지 엣지는 레이아웃에서 제외한다**
`researcher → orchestrator` 같은 응답 메시지가 그래프에 사이클을 만들고, ELK가 사이클을
끊으면서 부모가 자식 오른쪽으로 밀린다. 계층은 구조 엣지로만 잡고 메시지는 그 위에 그린다.

## 2D / 3D 토글

툴바의 `2D | 3D`로 전환한다. **같은 ELK 레이아웃 좌표를 공유**하므로 두 뷰가 항상 같은
그래프를 보여준다. 3D에서 축을 다시 배정할 뿐이다.

```
ELK x  →  X   파이프라인 진행 방향 (좌 → 우)
ELK y  →  Z   형제 노드가 퍼지는 깊이 축
   —   →  Y   에이전트는 평면(0), 도구는 그 아래(150)
```

3D는 three.js 없이 **CSS 3D로 실제 2D 카드 컴포넌트를 세운다.** canvas에 다시 그리면
디자인이 반드시 두 벌로 갈라지므로, 카드의 생김새는 `graph/nodes/cards.tsx` 하나만 두고
2D(React Flow 노드)와 3D(상자 앞면)가 그걸 공유한다.

```
상자 = 앞면(2D 카드 그대로) + 두께를 만드는 다섯 면
```

옆면 음영은 면의 **월드 방향**에 고정해서(윗면이 가장 밝다) 궤도를 돌려도 광원이 위에 머문다.
바닥에는 격자·타원 그림자·낙하선을 깔아 높이 차이를 읽게 했다.

엣지는 얇은 `div`를 3D 회전시켜 잇는다. 시작점에서 끝점으로 향하는 변환은
`rotateY(atan2(-dz, dx)) rotateZ(asin(dy/L))` — CSS 회전 행렬로 검증했다
(`scene.ts`의 `segmentTransform`).

글자를 브라우저가 렌더하므로 어느 각도에서도 선명하고, 2D 카드의 상태 색·펄스·역할 배지가
그대로 살아 있다.

## 요청과 최종 답변

화면은 요청 → 진행 → 답변이 한 줄로 읽히게 배치돼 있다.

```
┌──────────────────────────── 툴바 ────────────────────────────┐
├──────────────────────────┬───────────────────────────────────┤
│                          │  [결과] [에이전트]   ← 탭          │
│      Flow 캔버스          │  요청: ...                        │
│      (에이전트 그래프)     │  답변: ...        [크게 보기 ⤢]   │
│                          │  경과·에이전트·도구·토큰            │
├──────────────────────────┴───────────────────────────────────┤
│ 타임라인 스크러버                                              │
├──────────────────────────────────────────────────────────────┤
│  예시 · 예시 · 예시                                            │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 에이전트에게 무엇을 요청할까요?                             │ │
│ │ Enter 전송 · Shift+Enter 줄바꿈              [ 실행 ↵ ]   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

앱은 **자동으로 실행을 시작하지 않는다.** 요청을 입력해야 시작하고, 그 전까지 캔버스에는
안내만 뜬다.

파이프라인의 답변은 **루트 에이전트**(= `parentId`가 없는 에이전트)의 `agent.finished.result`다.
백엔드는 여기에 사용자에게 보여줄 최종 텍스트를 넣어주기만 하면 된다 (줄바꿈 `\n` 그대로 렌더).

- 루트가 끝나면 우측 패널이 **결과 탭으로 한 번** 자동 전환된다 (그 뒤 사용자가 에이전트 탭으로
  옮기면 그 선택을 존중 — 실행마다 1회만 개입)
- 사이드바가 좁으면 **크게 보기 ⤢** 로 캔버스 위 860px 오버레이로 펼친다 (Esc / 배경 클릭으로 닫힘)
- 실행 중에는 같은 자리에 진행 중인 에이전트 목록이 뜬다
- 파생 상태라서 타임라인을 종료 이전으로 되감으면 자동으로 "진행 중"으로 돌아간다 — 별도 처리 없음

## 백엔드 붙이기

`.env`:

```
VITE_API_URL=http://localhost:8000
```

이것만 넣으면 `transport/index.ts`가 `sseDriver`를 고른다. 앱 코드는 한 줄도 안 바뀐다.

### 1) 실행 생성 — `POST {VITE_API_URL}/runs`

하단 입력 바에서 요청을 보내면 호출된다.

```
요청:  { "prompt": "2024년 전기차 시장을 조사해서 리포트로 정리해줘" }
응답:  { "runId": "run-7f3a" }
```

mock 모드에서는 `transport/scenario.ts`가 프롬프트에서 실행 시나리오를 만들어 메모리에 담고
그 id를 돌려준다. 프롬프트에서 검색어를 뽑아내고 길이·키워드로 파이프라인 모양을 고른다.

| 조건 | 파이프라인 |
|---|---|
| 실패/에러/장애 키워드 | orchestrator → fetcher(503) → cache fallback |
| 16자 미만 | orchestrator → worker |
| 그 외 | orchestrator → researcher → analyst → (40자 초과면 critic) → writer |

시뮬레이션이 없는 사실을 지어내지 않도록, 최종 답변은 목업임을 밝히고
어떤 파이프라인이 돌았는지만 요약한다.

### 2) 이벤트 스트림 — `GET {VITE_API_URL}/runs/{runId}/stream` (text/event-stream)

```
event: meta
data: {"runId":"run-7f3a","title":"전기차 시장 조사"}

event: agent
data: {"type":"agent.started","ts":0.0,"agentId":"orchestrator","label":"Orchestrator","role":"orchestrator"}

event: agent
data: {"type":"tool.called","ts":3.0,"agentId":"researcher","callId":"c1","toolName":"web_search","input":{...}}

event: done
data: {}
```

`data`에 담기는 객체는 `src/entities/event.ts`의 `AgentEvent` 유니온 그대로다.
named event 없이 그냥 `data:`만 흘려보내도 `onmessage`가 받는다.

WebSocket이면 `sseDriver.ts`를 참고해 `wsDriver.ts`를 하나 더 만들고
`transport/index.ts`의 분기만 고치면 된다.

### 이벤트 종류

| type | 의미 | 그래프에 미치는 영향 |
|---|---|---|
| `agent.started` | 에이전트 생성 | 노드 추가 (+ parentId면 spawn 엣지) |
| `agent.thinking` | 추론 중 | status → thinking |
| `tool.called` | 도구 호출 시작 | 도구 노드 + tool 엣지 추가 |
| `tool.result` | 도구 결과/에러 | 도구 노드 status 갱신 |
| `message.sent` | 에이전트 간 메시지 | message 엣지 (같은 쌍은 카운트로 접힘) |
| `agent.finished` | 종료 | status → done/error |

`ts`는 실행 시작 기준 **초**. mockDriver가 이 간격대로 이벤트를 재생한다.
