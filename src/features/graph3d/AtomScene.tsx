import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useRunState } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import { buildAtom, ringPoints, solvePositions, toThree, type AtomModel, type Body } from './atom'

/**
 * 3D 홀로그램 뷰 — three.js로 그리는 진짜 구체.
 *
 * CSS 그라디언트로는 아무리 겹쳐도 결국 스프라이트라 납작하다. 여기서는
 * SphereGeometry에 발광 재질을 입히고 Bloom을 걸어 광원처럼 타오르게 한다.
 *
 * 원자 모형과 궤도 수학(atom.ts)은 렌더러와 무관하게 짜여 있어 그대로 쓴다.
 * 좌표계만 맞춘다: 화면 px 단위를 three 단위로 줄이고(SCALE), CSS의 y-down을
 * three의 y-up으로 뒤집는다.
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

  return (
    <div className="atom3d">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 2.2, 7.5], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
        onPointerMissed={() => useViewStore.getState().select(null)}
      >
        <color attach="background" args={['#03050d']} />
        <fog attach="fog" args={['#03050d', 9, 22]} />

        {/* 발광 재질이 주역이지만, 약한 조명이 있어야 구체의 실루엣이 산다 */}
        <ambientLight intensity={0.35} />
        <pointLight position={[6, 8, 6]} intensity={45} color="#bcd8ff" distance={40} />

        <Starfield />
        <Atom atom={atom} />

        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={18}
          autoRotate
          autoRotateSpeed={0.45}
          rotateSpeed={0.7}
          enableDamping
          dampingFactor={0.06}
        />

        <EffectComposer>
          <Bloom intensity={1.5} luminanceThreshold={0.18} luminanceSmoothing={0.5} mipmapBlur />
        </EffectComposer>
      </Canvas>

      <div className="atom3d__scan" />
      <div className="atom3d__hud">
        <span>드래그: 회전 · 휠: 확대 · 클릭: 선택</span>
      </div>
    </div>
  )
}

/** 원자 전체. 위치 갱신은 useFrame 안에서 ref로만 한다 (React 재렌더 없음). */
function Atom({ atom }: { atom: AtomModel }) {
  const select = useViewStore((s) => s.select)
  const selectedId = useViewStore((s) => s.selectedId)

  const orbRefs = useRef(new Map<string, THREE.Group>())
  const ringRefs = useRef(new Map<string, THREE.Group>())
  const pulseRefs = useRef(new Map<string, THREE.Line>())

  useFrame(({ clock }) => {
    const positions = solvePositions(atom.bodies, clock.elapsedTime)

    for (const body of atom.bodies) {
      const p = positions.get(body.id)
      if (!p) continue
      const orb = orbRefs.current.get(body.id)
      if (orb) orb.position.set(...toThree(p, SCALE))

      // 궤도선은 부모를 따라다닌다 (도구 위성은 움직이는 에이전트를 공전한다)
      const parent = positions.get(body.parentId ?? '@nucleus')
      const ring = ringRefs.current.get(body.id)
      if (ring && parent) ring.position.set(...toThree(parent, SCALE))
    }

    for (const pulse of atom.pulses) {
      const line = pulseRefs.current.get(pulse.id)
      const a = positions.get(pulse.from)
      const b = positions.get(pulse.to)
      if (!line || !a || !b) continue
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
      attr.setXYZ(0, ...toThree(a, SCALE))
      attr.setXYZ(1, ...toThree(b, SCALE))
      attr.needsUpdate = true
    }
  })

  return (
    <group>
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
            position={toThree(n, SCALE)}
            radius={(n.kind === 'proton' ? 9 : 7.5) * SCALE}
            color={n.kind === 'proton' ? colorOf(statusOf(atom.rootStatusClass)) : NEUTRON}
            intensity={n.kind === 'proton' ? 2.6 : 1.1}
          />
        ))}
        {atom.rootId && (
          <Html
            position={[0, -(atom.nucleusRadius + 34) * SCALE, 0]}
            center
            distanceFactor={9}
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

      {/* 궤도선 */}
      {atom.bodies.map((body) => (
        <group
          key={`ring-${body.id}`}
          ref={(el) => {
            if (el) ringRefs.current.set(body.id, el)
            else ringRefs.current.delete(body.id)
          }}
        >
          <OrbitRing body={body} />
        </group>
      ))}

      {/* 에너지선 (메시지) */}
      {atom.pulses.map((pulse) => (
        <PulseLine
          key={pulse.id}
          active={pulse.active}
          register={(el) => {
            if (el) pulseRefs.current.set(pulse.id, el)
            else pulseRefs.current.delete(pulse.id)
          }}
        />
      ))}

      {/* 전자와 위성 */}
      {atom.bodies.map((body) => {
        const isAgent = body.kind === 'agent'
        const color = colorOf(String(body.status))
        const selected = selectedId === body.id

        return (
          <group
            key={body.id}
            ref={(el) => {
              if (el) orbRefs.current.set(body.id, el)
              else orbRefs.current.delete(body.id)
            }}
            onClick={(e) => {
              e.stopPropagation()
              select(isAgent ? body.id : null)
            }}
          >
            <Sphere
              radius={(isAgent ? 17 : 9) * SCALE}
              color={color}
              intensity={selected ? 6 : isAgent ? 3.4 : 2.2}
              pulse={
                body.status === 'running' ||
                body.status === 'thinking' ||
                body.status === 'calling'
              }
            />
            <Html
              position={[isAgent ? 0.26 : 0.16, 0.06, 0]}
              distanceFactor={9}
              zIndexRange={[9, 0]}
            >
              <div className={`orb__label ${body.statusClass} orb--${body.kind}-label`}>
                <b>{body.label}</b>
                {isAgent && <span>{body.status}</span>}
              </div>
            </Html>
          </group>
        )
      })}
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
    // 실행 중인 것만 맥동한다 — 멈춘 것과 구분된다
    material.current.emissiveIntensity =
      intensity * (0.75 + 0.35 * Math.sin(clock.elapsedTime * 4))
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

/**
 * 궤도선. atom.ts의 solvePositions와 같은 회전을 three 좌표계로 옮긴 것이다.
 *   수평 원(XZ) → rotateX(tilt) → rotateY(ringYaw)
 * CSS의 y-down을 뒤집었으므로 tilt의 부호도 뒤집는다.
 */
function OrbitRing({ body }: { body: Body }) {
  const points = useMemo(() => ringPoints(body, SCALE), [body])

  return (
    <Line
      points={points}
      color={colorOf(String(body.status))}
      lineWidth={body.kind === 'agent' ? 1.1 : 0.8}
      transparent
      opacity={body.kind === 'agent' ? 0.26 : 0.15}
      dashed={body.kind === 'tool'}
      dashSize={0.05}
      gapSize={0.05}
      toneMapped={false}
    />
  )
}

/**
 * 두 점을 잇는 선. 끝점은 매 프레임 갱신되므로 자리만 잡아 둔다.
 *
 * 객체를 렌더마다 새로 만들면 GPU 자원이 계속 재생성되므로 useMemo로 고정한다.
 * 끝점이 움직여 바운딩 구가 매 프레임 어긋나므로 컬링은 끈다.
 */
function PulseLine({
  active,
  register,
}: {
  active: boolean
  register: (el: THREE.Line | null) => void
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const l = new THREE.Line(geometry, new THREE.LineBasicMaterial({ transparent: true }))
    l.frustumCulled = false
    return l
  }, [])

  useEffect(() => {
    const material = line.material as THREE.LineBasicMaterial
    material.color.set(active ? '#6fb6ff' : '#38507a')
    material.opacity = active ? 0.95 : 0.22
    material.toneMapped = false
  }, [line, active])

  useEffect(() => {
    return () => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
  }, [line])

  return <primitive object={line} ref={register} />
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
      const r = 26 + rand() * 20
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [])

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.09}
        color="#c8dcff"
        sizeAttenuation
        transparent
        opacity={0.75}
        toneMapped={false}
      />
    </points>
  )
}

const statusOf = (statusClass: string) => statusClass.replace(/^(status|tool)-/, '')
