import { lazy, Suspense } from 'react'

/**
 * 3D 뷰 진입점.
 *
 * three.js 일체(three + R3F + drei + postprocessing)는 무겁고 2D만 쓰는 사람에게는
 * 필요 없다. 그래서 3D로 토글할 때만 내려받는다.
 */
const AtomScene = lazy(() =>
  import('./AtomScene').then((m) => ({ default: m.AtomScene })),
)

export function Flow3D() {
  return (
    <Suspense
      fallback={
        <div className="atom3d atom3d--loading">
          <p>3D 엔진을 불러오는 중…</p>
        </div>
      }
    >
      <AtomScene />
    </Suspense>
  )
}
