import { lazy, Suspense } from 'react'
import { useViewStore } from '../../stores/viewStore'

/**
 * 첫 화면.
 *
 * 글자와 버튼은 DOM으로 즉시 그리고, 3D 배경만 나중에 붙는다.
 * three는 무거워서 기다렸다가 함께 띄우면 첫 화면이 한참 비어 있게 된다.
 */
const LandingScene = lazy(() =>
  import('./LandingScene').then((m) => ({ default: m.LandingScene })),
)

export function Landing() {
  const start = useViewStore((s) => s.start)

  return (
    <div className="landing">
      <div className="landing__scene">
        <Suspense fallback={null}>
          <LandingScene />
        </Suspense>
      </div>

      <div className="landing__center">
        <span className="landing__mark" aria-hidden>
          ◇
        </span>
        <h1>Agent Flow</h1>
        <p>
          에이전트 팀이 하나의 질문을 두고 토론합니다.
          <br />그 과정을 원자 구조로 봅니다.
        </p>

        <button className="landing__start" onClick={start}>
          START
        </button>

        <span className="landing__hint">질문을 입력하면 토론이 시작됩니다</span>
      </div>
    </div>
  )
}
