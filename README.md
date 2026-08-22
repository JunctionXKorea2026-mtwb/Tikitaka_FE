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
   ├─ graph/          2D — FlowCanvas, derive, layout/elk, nodes/, edges/, CanvasEmpty
   ├─ graph3d/        3D — atom(원자 모형·궤도 수학), AtomScene(three.js), Flow3D(lazy)
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

툴바의 `2D | 3D`로 전환한다. 두 뷰는 **같은 일을 하지 않는다.**

| | 역할 |
|---|---|
| **2D** | 읽는 뷰 — 실제로 뭐가 일어났는지 파고든다 |
| **3D** | 보여주는 뷰 — 데모·발표 |

방향성 있고 텍스트 중심인 그래프를 회전하는 3D 공간에서 읽는 건 2D보다 나쁘다.
그래서 3D를 "쓰기 편하게" 만들려 하지 않고, 대신 마음껏 연출한다.

### 원자 모형

**실행 하나 = 원자 하나.** 여러 개를 띄우지 않는다.

| 원자 | 실행 |
|---|---|
| 핵 | 사용자의 질문 |
| 안쪽 오비탈 (r=215) | 에이전트들 |
| 바깥 오비탈 (r=330) | 도구 호출들 |
| 격자 | 오비탈 껍질을 눈에 보이게 하는 측지선 구조 |
| 결합선 | 핵→에이전트, 에이전트→도구 |
| 에너지선 | 에이전트 간 메시지 |

노드는 껍질 위 아무 데나 뜨지 않고 **격자 꼭짓점에 스냅**된다. 그래야 구조에 박힌 것처럼
보이고 떠다니는 스티커로 보이지 않는다. 도구는 자기 에이전트와 같은 방향의 바깥 껍질에
놓여서 결합선이 방사로 뻗는다.

격자는 정이십면체를 세분한 측지선 구다 (`icosphere()`). three의 `IcosahedronGeometry`는
면마다 꼭짓점을 복제해서 격자 선을 뽑기에 나쁘므로 직접 만든다.
오일러 공식 V − E + F = 2 로 검증한다.

```
detail 2 (안쪽)   V=162  E=480   F=320
detail 3 (바깥)   V=642  E=1920  F=1280
```

**위치는 정적이다.** 물체가 각자 공전하면 눈이 쉴 곳이 없어 오히려 안 읽힌다.
움직이는 것은 셋뿐이고 각각 이유가 있다 — 카메라의 느린 자동 회전(끌 수 있다),
껍질의 아주 느린 자전, 그리고 지금 무엇이 오가는지 알려주는 메시지 스파크.

### 팔레트

3D 안에서만 푸른 계열로 통일한다 (2D는 원래 색 유지).

```
running #3f9dff · thinking #9fb9ff · calling #7b74ff · done #45dcff · error #ff5f80
```

`error`만 일부러 계열 밖에 뒀다 — 실패가 파랗게 묻히면 안 된다.

## 대화 — 후속 질문과 새 주제

후속 질문은 이전 실행을 **지우지 않는다.** 턴이 쌓이고, 턴마다 `parentId`를 갖는다.

| 입력 방식 | parentId | 뜻 |
|---|---|---|
| **이어서 질문** | 지금 보고 있는 턴 | 그 맥락을 잇는다. 과거 턴을 골라두면 **거기서 갈라진다** |
| **새 주제** | `null` | 같은 작업 공간의 새 뿌리 |

그래서 대화는 사슬이 아니라 **숲**이다.

**주제 전환을 자동 판별하지 않는다.** 판별이 틀리면 대화가 조용히 갈라져서 더 나쁘다.
입력창의 `이어서 질문 | 새 주제` 토글로 사용자가 정한다.

### 3D — 대화가 곧 분자

**모든 턴의 원자를 동시에 보여준다.** 클릭해도 카메라를 옮기지 않는다 (포커싱 없음).
어느 턴이 패널·타임라인과 묶여 있는지는 격자 밝기와 라벨 테두리로만 표시한다.

배치는 트리 레이아웃이다 (`layoutTurns()`):

```
x = 깊이     이어서 물을수록 오른쪽으로 뻗는다
z = 레인     가지와 다른 주제는 안쪽/바깥쪽으로 갈라진다
```

레인은 후위 순회로 정한다 — 잎이 차례로 레인을 가져가고 부모는 자식들의 평균에 놓인다.
원자 사이 간격은 바깥 껍질 지름(470px)보다 넉넉한 620/560px이다.

```
주제 A:  ●───●───●        z = -280
주제 B:  ●───●            z = +280
        깊이0 1   2
```

### 2D

활성 턴의 그래프를 그린다. 여러 턴을 한 캔버스에 늘어놓지 않는 이유는 노드 id가
턴마다 겹치고(`orchestrator`가 매 턴 등장) ELK 레이아웃을 턴 수만큼 돌려야 해서다.
대신 결과 패널이 사슬 구조를 들여쓰기와 `새 주제` 구분선으로 보여준다.

- 턴을 클릭하면 캔버스(2D·3D 모두)가 그 턴으로 옮겨간다
- 타임라인은 **활성 턴 안에서** 스크럽한다
- 툴바의 `새 대화`로 스레드 전체를 비운다

mock 모드에서는 후속 질문의 파이프라인이 짧아진다 (`Refiner` 하나). 새 주제는 다시
전체 파이프라인을 돈다.

## 요청과 최종 답변

파이프라인의 답변은 **루트 에이전트**(= `parentId`가 없는 에이전트)의 `agent.finished.result`다.
백엔드는 여기에 사용자에게 보여줄 최종 텍스트를 넣어주기만 하면 된다 (줄바꿈 `\n` 그대로 렌더).

앱은 **자동으로 실행을 시작하지 않는다.** 요청을 입력해야 시작한다.

- 사이드바가 좁으면 **크게 보기 ⤢** 로 캔버스 위 860px 오버레이로 펼친다 (Esc / 배경 클릭으로 닫힘)
- 실행 중에는 같은 자리에 진행 중인 에이전트 목록이 뜬다
- 파생 상태라서 타임라인을 종료 이전으로 되감으면 자동으로 "진행 중"으로 돌아간다

## 백엔드 붙이기

`.env`:

```
VITE_API_URL=http://localhost:8000
```

이것만 넣으면 `transport/index.ts`가 `sseDriver`를 고른다. 앱 코드는 한 줄도 안 바뀐다.

### 1) 실행 생성 — `POST {VITE_API_URL}/runs`

하단 입력 바에서 요청을 보내면 호출된다.

```
요청:  { "prompt": "2023년이랑 비교해줘", "threadId": "thread-x91",
         "turn": 1, "parentRunId": "run-3c0a" }
응답:  { "runId": "run-7f3a" }
```

`threadId`가 작업 공간을 묶고, `parentRunId`가 맥락의 갈래를 정한다.
값이 있으면 그 실행에 이어지는 후속 질문이고, `null`이면 같은 스레드 안의 새 주제다.

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
