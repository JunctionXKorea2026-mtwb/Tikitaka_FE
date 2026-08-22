import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRunState } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import { buildAtom, segmentTransform, solvePositions, type Body, type Vec3 } from './atom'

/**
 * 3D 홀로그램 뷰 — 실행을 원자 모형으로 보여준다.
 *
 * 2D(React Flow)는 읽는 뷰, 여기는 보여주는 뷰다. 그래서 ELK 좌표를 공유하지 않고
 * 계층을 "무엇이 무엇을 공전하는가"로 표현한다. 매핑은 atom.ts 주석 참고.
 *
 * three.js를 쓰지 않는다. 100,000 Stars도 라벨은 CSS3D로 그렸고, 그쪽이 WebGL을
 * 쓴 이유는 별이 10만 개였기 때문이다. 여기는 물체가 스무 개 남짓이다.
 *
 * 매 프레임 위치를 JS가 계산해 transform만 직접 쓴다 (React 재렌더 없음).
 * 라벨은 무대 회전을 정확히 되돌려 항상 정면을 본다.
 */

const PITCH_LIMIT = Math.PI / 2 - 0.12
const IDLE_DELAY = 4000
const SPIN_SPEED = 0.00035

export function Flow3D() {
  const run = useRunState()
  const atom = useMemo(() => buildAtom(run), [run])

  const select = useViewStore((s) => s.select)
  const selectedId = useViewStore((s) => s.selectedId)

  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const cam = useRef({ yaw: -0.5, pitch: 0.26, zoom: 1, spinOffset: 0 })
  const [fit, setFit] = useState(1)
  const [spin, setSpin] = useState(true)

  // 프레임 루프가 참조할 최신 값들
  const bodiesRef = useRef<Body[]>(atom.bodies)
  bodiesRef.current = atom.bodies
  const fitRef = useRef(fit)
  fitRef.current = fit

  const orbRefs = useRef(new Map<string, HTMLElement>())
  const ringRefs = useRef(new Map<string, HTMLElement>())
  const labelRefs = useRef(new Map<string, HTMLElement>())
  const pulseRefs = useRef(new Map<string, HTMLElement>())
  const pulsesRef = useRef(atom.pulses)
  pulsesRef.current = atom.pulses

  const setRef = (map: React.RefObject<Map<string, HTMLElement>>, id: string) => (el: HTMLElement | null) => {
    if (el) map.current.set(id, el)
    else map.current.delete(id)
  }

  /** 무대(카메라) 변환. 드래그·줌·자동회전이 모두 여기로 모인다. */
  const applyStage = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const { yaw, pitch, zoom, spinOffset } = cam.current
    const s = zoom * fitRef.current
    el.style.transform =
      `scale3d(${s}, ${s}, ${s}) rotateX(${pitch}rad) rotateY(${yaw + spinOffset}rad)`
  }, [])

  useEffect(applyStage, [applyStage, fit])

  // 물체 위치 + 라벨 빌보드 + 펄스 선을 매 프레임 갱신
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)

      if (spin && now - lastTouch.current > IDLE_DELAY) {
        cam.current.spinOffset += (now - last) * SPIN_SPEED
        applyStage()
      }
      last = now

      const t = now / 1000
      const positions = solvePositions(bodiesRef.current, t)

      // 무대는 rotateX(pitch)·rotateY(yaw)를 적용한다.
      // 라벨이 정면을 보려면 그 역인 rotateY(−yaw)·rotateX(−pitch)를 걸면 된다.
      const { yaw, pitch, spinOffset } = cam.current
      const billboard = `rotateY(${-(yaw + spinOffset)}rad) rotateX(${-pitch}rad)`

      for (const body of bodiesRef.current) {
        const p = positions.get(body.id)
        const el = orbRefs.current.get(body.id)
        if (p && el) el.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`

        const label = labelRefs.current.get(body.id)
        if (label) label.style.transform = billboard

        // 궤도선은 부모를 따라다닌다 (도구 위성은 에이전트를 공전하므로 중심이 움직인다).
        // 회전은 solvePositions와 같다: 수평 원을 rotateX(tilt) → rotateY(ringYaw).
        // div는 XY평면에 있으므로 먼저 눕혀야 한다 → rotateX(90 + tilt).
        const ring = ringRefs.current.get(body.id)
        const parent = positions.get(body.parentId ?? '@nucleus')
        if (ring && parent) {
          ring.style.transform =
            `translate3d(${parent.x}px, ${parent.y}px, ${parent.z}px)` +
            ` rotateY(${body.ringYaw}deg) rotateX(${90 + body.tilt}deg)`
        }
      }

      const nucleusLabel = labelRefs.current.get('@nucleus')
      if (nucleusLabel) nucleusLabel.style.transform = billboard

      for (const pulse of pulsesRef.current) {
        const el = pulseRefs.current.get(pulse.id)
        const a = positions.get(pulse.from)
        const b = positions.get(pulse.to)
        if (!el || !a || !b) continue
        const { length, transform } = segmentTransform(a as Vec3, b as Vec3)
        el.style.width = `${length}px`
        el.style.transform = transform
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [spin, applyStage])

  // 원자 전체가 화면에 들어오도록 배율을 맞춘다
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const recompute = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0) return
      const span = atom.extent * 2 + 220
      setFit(Math.max(0.25, Math.min(1.15, Math.min(width / span, height / span))))
    }
    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    recompute()
    return () => observer.disconnect()
  }, [atom.extent])

  // ---- 조작 ----

  const lastTouch = useRef(0)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const touch = () => (lastTouch.current = performance.now())

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    touch()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    cam.current.yaw += dx * 0.006
    cam.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.current.pitch + dy * 0.005))
    d.x = e.clientX
    d.y = e.clientY
    touch()
    applyStage()
  }

  const onPointerUp = () => {
    suppressClick.current = Boolean(drag.current?.moved)
    drag.current = null
    touch()
  }

  const onWheel = (e: React.WheelEvent) => {
    cam.current.zoom = Math.max(0.35, Math.min(3, cam.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
    touch()
    applyStage()
  }

  const pick = (id: string | null) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    select(id)
  }

  const starfield = useStarfield()

  return (
    <div
      ref={viewportRef}
      className="atom3d"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onClick={() => pick(null)}
    >
      <div className="atom3d__stars" style={{ boxShadow: starfield }} />
      <div className="atom3d__scan" />

      <div ref={stageRef} className="atom3d__stage">
        {/* 핵 */}
        <div
          className={`nucleus ${atom.rootStatusClass}${selectedId === atom.rootId ? ' is-selected' : ''}`}
          style={{ '--r': `${atom.nucleusRadius}px` } as React.CSSProperties}
          onClick={(e) => {
            e.stopPropagation()
            pick(atom.rootId)
          }}
        >
          <i className="nucleus__halo" />
          {atom.nucleons.map((n, i) => (
            <i
              key={i}
              className={`nucleon nucleon--${n.kind}`}
              style={{ transform: `translate3d(${n.x}px, ${n.y}px, ${n.z}px)` }}
            />
          ))}
          {atom.rootId && (
            <div className="orb__label nucleus__label" ref={setRef(labelRefs, '@nucleus')}>
              <b>{atom.rootLabel}</b>
              <span>
                {atom.nucleons.filter((n) => n.kind === 'proton').length}p ·{' '}
                {atom.nucleons.filter((n) => n.kind === 'neutron').length}n
              </span>
            </div>
          )}
        </div>

        {/* 궤도선 — 위치가 고정이라 CSS만으로 그린다 */}
        {atom.bodies.map((body) => (
          <div
            key={`ring-${body.id}`}
            ref={setRef(ringRefs, body.id)}
            className={`ring ring--${body.kind} ${body.statusClass}`}
            style={{
              width: `${body.radius * 2}px`,
              height: `${body.radius * 2}px`,
              marginLeft: `${-body.radius}px`,
              marginTop: `${-body.radius}px`,
            }}
          />
        ))}

        {/* 에너지선 (에이전트 간 메시지) */}
        {atom.pulses.map((pulse) => (
          <div
            key={pulse.id}
            ref={setRef(pulseRefs, pulse.id)}
            className={`pulse${pulse.active ? ' is-active' : ''}`}
          >
            {pulse.active && <i className="pulse__spark" />}
          </div>
        ))}

        {/* 전자와 위성 */}
        {atom.bodies.map((body) => (
          <div
            key={body.id}
            ref={setRef(orbRefs, body.id)}
            className={`orb orb--${body.kind} ${body.statusClass}${
              selectedId === body.id ? ' is-selected' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation()
              pick(body.kind === 'agent' ? body.id : null)
            }}
          >
            <i className="orb__core" />
            <i className="orb__trail" />
            <div className="orb__label" ref={setRef(labelRefs, body.id)}>
              <b>{body.label}</b>
              {body.kind === 'agent' && <span>{body.status}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="atom3d__hud">
        <span>드래그: 회전 · 휠: 확대 · 클릭: 선택</span>
        <button
          className={spin ? 'is-on' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            setSpin((v) => !v)
          }}
        >
          자동 회전 {spin ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}

/** 결정론적 별 배경. box-shadow 한 줄로 200개를 찍는다 (DOM 노드 1개). */
function useStarfield(): string {
  return useMemo(() => {
    let seed = 20260822
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const parts: string[] = []
    for (let i = 0; i < 200; i++) {
      const x = (rand() * 4200 - 2100).toFixed(0)
      const y = (rand() * 2600 - 1300).toFixed(0)
      const big = rand() > 0.88
      const alpha = (0.12 + rand() * 0.5).toFixed(2)
      parts.push(`${x}px ${y}px 0 ${big ? 1 : 0}px rgba(190, 215, 255, ${alpha})`)
    }
    return parts.join(', ')
  }, [])
}
