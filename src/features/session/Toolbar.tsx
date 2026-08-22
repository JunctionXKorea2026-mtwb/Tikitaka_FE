import { useState } from 'react'
import { activeTurn, useRunStore } from '../../stores/runStore'

/**
 * 툴바는 "지금 어느 흐름을 보고 있는가"만 말한다.
 * 표시 옵션(차원·속도·도구·배치)은 걷어냈다 — 화면이 3D 하나로 정리되면서
 * 대부분 의미가 없어졌고, 남아 있으면 무엇이 진짜 조작인지 흐려진다.
 *
 * 접을 수 있다. 3D를 크게 볼 때 위쪽 띠까지 없애고 싶을 때가 있다.
 */
export function Toolbar() {
  const turn = useRunStore(activeTurn)
  const turnCount = useRunStore((s) => s.turns.length)
  const replay = useRunStore((s) => s.replay)
  const [open, setOpen] = useState(true)

  return (
    <header className={`toolbar${open ? '' : ' is-collapsed'}`}>
      <button
        className="toolbar__fold"
        onClick={() => setOpen((v) => !v)}
        title={open ? '툴바 접기' : '툴바 펼치기'}
        aria-expanded={open}
      >
        {open ? '▴' : '▾'}
      </button>

      <div className="toolbar__brand">
        <span className="toolbar__logo">◇</span>
        <div>
          <h1>Agent Flow</h1>
          {open && (
            <p>
              {turn ? (
                <>
                  {turnCount}개 턴 · {turn.title || turn.prompt}
                  <code className="toolbar__id" title={turn.id}>
                    {turn.id.slice(0, 8)}
                  </code>
                </>
              ) : (
                '요청을 입력하면 실행이 시작됩니다'
              )}
            </p>
          )}
        </div>
      </div>

      {open && (
        <div className="toolbar__actions">
          <button onClick={replay} disabled={!turn}>
            다시 재생
          </button>
        </div>
      )}
    </header>
  )
}
