import { lazy, Suspense, useState } from 'react'
import { useViewStore } from '../../stores/viewStore'

/**
 * 첫 화면.
 *
 * 글자와 버튼은 DOM으로 즉시 그리고, 3D 배경만 나중에 붙는다.
 * three는 무거워서 기다렸다가 함께 띄우면 첫 화면이 한참 비어 있게 된다.
 *
 * START를 누르면 원자가 퍼지는 동안 글자가 먼저 빠지고, 다 퍼진 뒤 본 화면으로 넘어간다.
 */
const LandingScene = lazy(() =>
  import('./LandingScene').then((m) => ({ default: m.LandingScene })),
)

/** LandingScene의 BURST_SECONDS와 맞춘다 (0.9초) */
const BURST_MS = 900

export function Landing() {
  const start = useViewStore((s) => s.start)
  const [exiting, setExiting] = useState(false)

  const handleStart = () => {
    if (exiting) return
    setExiting(true)
    window.setTimeout(start, BURST_MS)
  }

  return (
    <div className={`landing${exiting ? ' is-exiting' : ''}`}>
      <div className="landing__scene">
        <Suspense fallback={null}>
          <LandingScene exiting={exiting} />
        </Suspense>
      </div>

      <div className="landing__center">
        <h1>Tikitaka</h1>
        <p>
          에이전트 팀이 하나의 질문을 두고 토론합니다.
          <br />그 과정을 원자 구조로 봅니다.
        </p>

        <button className="landing__start" onClick={handleStart} disabled={exiting}>
          START
        </button>
      </div>
    </div>
  )
}
