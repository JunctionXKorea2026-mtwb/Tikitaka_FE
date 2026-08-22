import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useRunState } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import { buildAtom, toThree, type AtomModel, type Body, type Pulse, type Spoke } from './atom'

/**
 * 3D 홀로그램 뷰 — three.js로 그리는 방사형 구조.
 *
 * 물체는 **움직이지 않는다.** 각자 공전하면 눈이 쉴 곳이 없어 오히려 안 읽힌다.
 * 움직이는 것은 둘뿐이고 각각 이유가 있다.
 *   - 카메라의 느린 자동 회전 (입체감을 주기 위해, 끌 수 있다)
 *   - 메시지 스파크 (지금 무엇이 오가는지 알려준다)
 *
 * 모형과 배치(atom.ts)는 렌더러와 무관하다. 좌표계만 맞춘다:
 * px 단위를 three 단위로 줄이고(SCALE), CSS의 y-down을 three의 y-up으로 뒤집는다.
 */

/** px → three 월드 단위 */
const SCALE = 0.01

/** 푸른 계열 팔레트. error만 계열 밖에 둔다 — 실패가 파랗게 묻히면 안 된다. */
const COLOR: Record<string, string> = {
  running: '#3f9dff',
  thinking: '#9fb9ff',
  calling: '#7b74ff',
  done: '#45dcff',
  error: '#ff5f80',
  ok: '#45dcff',
}

const colorOf = (status: string) => COLOR[status] ?? '#8ea6cc'
const NEUTRON = '#93a9c9'

export function AtomScene() {
  const run = useRunState()
  const atom = useMemo(() => buildAtom(run), [run])
  const [spin, setSpin] = useState(true)

  // 그래프가 커지면 카메라를 뒤로 물린다
  const distance = Math.max(5.5, atom.extent * SCALE * 2.1)

  return (
    <div className="atom3d">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, distance * 0.3, distance], fov: 45, near: 0.1, far: 120 }}
        gl={{ antialias: true }}
        onPointerMissed={() => useViewStore.getState().select(null)}
      >
        <color attach="background" args={['#03050d']} />
        <fog attach="fog" args={['#03050d', distance * 1.4, distance * 3.4]} />

        {/* 발광 재질이 주역이지만, 약한 조명이 있어야 구체의 실루엣이 산다 */}
        <ambientLight intensity={0.4} />
        <pointLight position={[6, 8, 6]} intensity={50} color="#bcd8ff" distance={60} />

        <Starfield />
        <Atom atom={atom} />

        <OrbitControls
          enablePan={false}
          minDistance={distance * 0.4}
          maxDistance={distance * 2.6}
          autoRotate={spin}
          autoRotateSpeed={0.35}
          rotateSpeed={0.7}
          enableDamping
          dampingFactor={0.08}
        />

        <EffectComposer>
          <Bloom intensity={1.35} luminanceThreshold={0.2} luminanceSmoothing={0.5} mipmapBlur />
        </EffectComposer>
      </Canvas>

      <div className="atom3d__scan" />
      <div className="atom3d__hud">
        <span>드래그: 회전 · 휠: 확대 · 클릭: 선택</span>
        <button className={spin ? 'is-on' : undefined} onClick={() => setSpin((v) => !v)}>
          자동 회전 {spin ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}

function Atom({ atom }: { atom: AtomModel }) {
  const select = useViewStore((s) => s.select)
  const selectedId = useViewStore((s) => s.selectedId)

  return (
    <group>
      {/* 스포크 — 부모-자식 연결. 방사 구조를 눈에 보이게 한다 */}
      {atom.spokes.map((spoke) => (
        <SpokeLine key={spoke.id} spoke={spoke} />
      ))}

      {/* 에너지선 (에이전트 간 메시지) */}
      {atom.pulses.map((pulse) => (
        <PulseLine key={pulse.id} pulse={pulse} />
      ))}

      {/* 핵 */}
      <group
        onClick={(e) => {
          e.stopPropagation()
          select(atom.rootId)
        }}
      >
        {atom.nucleons.map((n, i) => (
          <Sphere
            key={i}
            position={toThree(n.position, SCALE)}
            radius={(n.kind === 'proton' ? 9 : 7.5) * SCALE}
            color={n.kind === 'proton' ? colorOf(atom.rootStatus) : NEUTRON}
            intensity={n.kind === 'proton' ? 2.6 : 1.1}
          />
        ))}
        {atom.rootId && (
          <Html
            position={[0, -(atom.nucleusRadius + 40) * SCALE, 0]}
            center
            distanceFactor={10}
            zIndexRange={[10, 0]}
          >
            <div className={`orb__label nucleus__label ${atom.rootStatusClass}`}>
              <b>{atom.rootLabel}</b>
              <span>
                {atom.nucleons.filter((n) => n.kind === 'proton').length}p ·{' '}
                {atom.nucleons.filter((n) => n.kind === 'neutron').length}n
              </span>
            </div>
          </Html>
        )}
      </group>

      {/* 에이전트와 도구 */}
      {atom.bodies.map((body) => (
        <BodyNode
          key={body.id}
          body={body}
          selected={selectedId === body.id}
          onSelect={() => select(body.kind === 'agent' ? body.id : null)}
        />
      ))}
    </group>
  )
}

function BodyNode({
  body,
  selected,
  onSelect,
}: {
  body: Body
  selected: boolean
  onSelect: () => void
}) {
  const isAgent = body.kind === 'agent'
  const busy = body.status === 'running' || body.status === 'thinking' || body.status === 'calling'

  return (
    <group
      position={toThree(body.position, SCALE)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <Sphere
        radius={(isAgent ? 18 : 9) * SCALE}
        color={colorOf(String(body.status))}
        intensity={selected ? 6 : isAgent ? 3.4 : 2.2}
        pulse={busy}
      />
      <Html position={[isAgent ? 0.28 : 0.17, 0.07, 0]} distanceFactor={10} zIndexRange={[9, 0]}>
        <div className={`orb__label ${body.statusClass} orb--${body.kind}-label`}>
          <b>{body.label}</b>
          {isAgent && <span>{body.status}</span>}
        </div>
      </Html>
    </group>
  )
}

/** 발광 구체. Bloom이 이 emissive를 받아 광채로 번지게 한다. */
function Sphere({
  position,
  radius,
  color,
  intensity,
  pulse = false,
}: {
  position?: [number, number, number]
  radius: number
  color: string
  intensity: number
  pulse?: boolean
}) {
  const material = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }) => {
    if (!pulse || !material.current) return
    // 실행 중인 것만 숨쉰다 — 멈춘 것과 구분되고, 자리는 그대로라 산만하지 않다
    material.current.emissiveIntensity = intensity * (0.78 + 0.3 * Math.sin(clock.elapsedTime * 3))
  })

  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 32, 24]} />
      <meshStandardMaterial
        ref={material}
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        roughness={0.28}
        metalness={0.05}
        toneMapped={false}
      />
    </mesh>
  )
}

/** 부모에서 자식으로 뻗는 선. 위치가 고정이라 한 번만 만든다. */
function SpokeLine({ spoke }: { spoke: Spoke }) {
  const points = useMemo(
    () => [toThree(spoke.from, SCALE), toThree(spoke.to, SCALE)],
    [spoke.from, spoke.to],
  )

  return (
    <Line
      points={points}
      color={colorOf(spoke.status)}
      lineWidth={spoke.kind === 'agent' ? 1.2 : 0.8}
      transparent
      opacity={spoke.kind === 'agent' ? 0.3 : 0.16}
      dashed={spoke.kind === 'tool'}
      dashSize={0.06}
      gapSize={0.05}
      toneMapped={false}
    />
  )
}

/**
 * 에이전트 간 메시지. 선은 고정이고, 활성일 때만 스파크가 지나간다.
 * 이 움직임은 "지금 무엇이 오가는지"를 알려주므로 남겨 둔다.
 */
function PulseLine({ pulse }: { pulse: Pulse }) {
  const spark = useRef<THREE.Mesh>(null)
  const a = useMemo(() => toThree(pulse.from, SCALE), [pulse.from])
  const b = useMemo(() => toThree(pulse.to, SCALE), [pulse.to])

  useFrame(({ clock }) => {
    if (!spark.current) return
    const t = (clock.elapsedTime % 1.4) / 1.4
    spark.current.position.set(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    )
  })

  return (
    <group>
      <Line
        points={[a, b]}
        color={pulse.active ? '#6fb6ff' : '#38507a'}
        lineWidth={pulse.active ? 1.6 : 0.7}
        transparent
        opacity={pulse.active ? 0.85 : 0.14}
        toneMapped={false}
      />
      {pulse.active && (
        <mesh ref={spark}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#9fd0ff"
            emissiveIntensity={7}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}

/** 배경 별. Points 하나로 1500개를 찍는다. */
function Starfield() {
  const geometry = useMemo(() => {
    let seed = 20260822
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    const count = 1500
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // 구껍질에 고르게 뿌린다 — 뭉치지 않는다
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(rand() * 2 - 1)
      const r = 30 + rand() * 24
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.09}
        color="#c8dcff"
        sizeAttenuation
        transparent
        opacity={0.7}
        toneMapped={false}
      />
    </points>
  )
}
