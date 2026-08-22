import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { activeTurn, useRunState, useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import {
  buildAtom,
  icosphere,
  toThree,
  type AtomModel,
  type AtomNode,
  type Link,
  type Pulse,
  type Shell,
} from './atom'

/**
 * 3D 홀로그램 뷰 — 실행 하나를 원자 하나로 그린다.
 *
 *   핵          사용자의 질문
 *   안쪽 오비탈  에이전트 (격자 반지름 215)
 *   바깥 오비탈  도구 호출 (격자 반지름 330)
 *
 * 껍질은 측지선 격자로 그린다. 노드는 그 격자 **꼭짓점에 박혀** 있어서
 * 떠다니는 스티커가 아니라 구조의 일부로 보인다.
 *
 * 움직이는 것은 셋뿐이고 각각 이유가 있다.
 *   - 카메라의 느린 자동 회전 (입체감, 끌 수 있다)
 *   - 껍질의 아주 느린 자전 (오비탈이 살아 있다는 신호)
 *   - 메시지 스파크 (지금 무엇이 오가는지)
 */

/** px → three 월드 단위 */
const SCALE = 0.01
/** 대화의 이웃 턴이 놓이는 간격 */
const NEIGHBOR_GAP = 5.4
/** 이웃 턴의 축소 비율 — 활성 턴이 확실히 주인공이어야 한다 */
const NEIGHBOR_SCALE = 0.34

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
/** 격자 자체의 색 — 노드보다 어두워야 노드가 읽힌다 */
const LATTICE = '#2f7fd0'

export function AtomScene() {
  const run = useRunState()
  const question = useRunStore((s) => activeTurn(s)?.prompt ?? '')
  const turns = useRunStore((s) => s.turns)
  const activeId = useRunStore((s) => s.activeId)
  const selectTurn = useRunStore((s) => s.selectTurn)
  const atom = useMemo(() => buildAtom(run, question), [run, question])
  const [spin, setSpin] = useState(true)

  const activeIndex = turns.findIndex((t) => t.id === activeId)

  // 바깥 껍질이 화면을 채우도록
  const distance = atom.extent * SCALE * 2.05

  return (
    <div className="atom3d">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, distance * 0.16, distance], fov: 45, near: 0.1, far: 120 }}
        gl={{ antialias: true }}
        onPointerMissed={() => useViewStore.getState().select(null)}
      >
        <color attach="background" args={['#03050d']} />
        <ambientLight intensity={0.45} />
        <pointLight position={[6, 8, 6]} intensity={45} color="#bcd8ff" distance={60} />

        <Starfield />
        <Atom atom={atom} />

        {/* 대화의 다른 턴들 — 작고 어둡게 옆에 선다. 대화가 곧 분자가 된다. */}
        {turns.map((turn, i) =>
          turn.id === activeId ? null : (
            <NeighborAtom
              key={turn.id}
              offset={(i - activeIndex) * NEIGHBOR_GAP}
              onSelect={() => selectTurn(turn.id)}
            />
          ),
        )}

        <OrbitControls
          enablePan={false}
          minDistance={distance * 0.3}
          maxDistance={distance * 2.4}
          autoRotate={spin}
          autoRotateSpeed={0.32}
          rotateSpeed={0.7}
          enableDamping
          dampingFactor={0.08}
        />

        <EffectComposer>
          <Bloom intensity={1.9} luminanceThreshold={0.14} luminanceSmoothing={0.6} mipmapBlur />
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
  const shells = useRef<THREE.Group>(null)

  // 껍질만 아주 느리게 돈다. 노드도 함께 돌아야 격자에 박힌 채로 보인다.
  useFrame(({ clock }) => {
    if (shells.current) shells.current.rotation.y = clock.elapsedTime * 0.035
  })

  if (!atom.rootId) return null

  return (
    <group>
      <group ref={shells}>
        <Lattice shell={atom.shells[0]} opacity={0.22} />
        <Lattice shell={atom.shells[1]} opacity={0.13} />

        {/* 결합선 — 핵에서 에이전트로, 에이전트에서 도구로 */}
        {atom.links.map((link) => (
          <Bond key={link.id} link={link} />
        ))}

        {/* 에너지선 (에이전트 간 메시지) */}
        {atom.pulses.map((pulse) => (
          <PulseLine key={pulse.id} pulse={pulse} />
        ))}

        {/* 격자에 박힌 노드 */}
        {atom.nodes.map((node) => (
          <NodeOrb
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            onSelect={() => select(node.kind === 'agent' ? node.id : null)}
          />
        ))}
      </group>

      {/* 핵 = 질문. 껍질과 함께 돌지 않는다 — 중심은 고정이어야 읽힌다 */}
      <Nucleus
        atom={atom}
        selected={selectedId === atom.rootId}
        onSelect={() => select(atom.rootId)}
      />
    </group>
  )
}

/**
 * 대화의 다른 턴. 내용은 생략하고 껍질 실루엣만 남긴다 —
 * "저기 또 하나의 질문이 있다"만 전하면 충분하고, 자세히 보려면 클릭해서 옮겨간다.
 */
function NeighborAtom({ offset, onSelect }: { offset: number; onSelect: () => void }) {
  return (
    <group
      position={[offset, 0, 0]}
      scale={NEIGHBOR_SCALE}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <Lattice shell={{ radius: 330, detail: 2 }} opacity={0.16} />
      <mesh>
        <sphereGeometry args={[0.5, 24, 18]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#3f9dff"
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** 오비탈 껍질을 이루는 측지선 격자 — 모서리 선 + 꼭짓점 점 */
function Lattice({ shell, opacity }: { shell: Shell; opacity: number }) {
  const { lines, points } = useMemo(() => {
    const { vertices, edges } = icosphere(shell.radius, shell.detail)

    const linePositions = new Float32Array(edges.length * 6)
    edges.forEach(([a, b], i) => {
      linePositions.set([...toThree(vertices[a], SCALE), ...toThree(vertices[b], SCALE)], i * 6)
    })

    const pointPositions = new Float32Array(vertices.length * 3)
    vertices.forEach((v, i) => pointPositions.set(toThree(v, SCALE), i * 3))

    const l = new THREE.BufferGeometry()
    l.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    const p = new THREE.BufferGeometry()
    p.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3))
    return { lines: l, points: p }
  }, [shell.radius, shell.detail])

  useEffect(
    () => () => {
      lines.dispose()
      points.dispose()
    },
    [lines, points],
  )

  return (
    <group>
      <lineSegments geometry={lines}>
        <lineBasicMaterial
          color={LATTICE}
          transparent
          opacity={opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <points geometry={points}>
        <pointsMaterial
          color="#8fc4ff"
          size={0.035}
          sizeAttenuation
          transparent
          opacity={Math.min(1, opacity * 3.2)}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  )
}

/** 핵 — 질문. 밝은 코어와 그것을 감싼 빛무리. */
function Nucleus({
  atom,
  selected,
  onSelect,
}: {
  atom: AtomModel
  selected: boolean
  onSelect: () => void
}) {
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const color = colorOf(atom.rootStatus)
  const busy = atom.rootStatus === 'running' || atom.rootStatus === 'thinking'
  const r = atom.nucleusRadius * SCALE
  const base = selected ? 8 : 5

  useFrame(({ clock }) => {
    if (!busy || !core.current) return
    core.current.emissiveIntensity = base * (0.8 + 0.28 * Math.sin(clock.elapsedTime * 2.4))
  })

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <mesh>
        <sphereGeometry args={[r * 0.52, 32, 24]} />
        <meshStandardMaterial
          ref={core}
          color="#ffffff"
          emissive={color}
          emissiveIntensity={base}
          toneMapped={false}
        />
      </mesh>

      {/* 빛무리 — 안쪽 면을 칠해 코어를 감싼다 */}
      <mesh>
        <sphereGeometry args={[r, 32, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <Html position={[0, -r * 2.2, 0]} center distanceFactor={9} zIndexRange={[11, 0]}>
        <div className={`orb__label nucleus__label ${atom.rootStatusClass}`}>
          <b>{atom.question || atom.rootLabel}</b>
          <span>{atom.rootLabel}</span>
        </div>
      </Html>
    </group>
  )
}

/** 격자 꼭짓점에 박힌 노드 */
function NodeOrb({
  node,
  selected,
  onSelect,
}: {
  node: AtomNode
  selected: boolean
  onSelect: () => void
}) {
  const isAgent = node.kind === 'agent'
  const busy = node.status === 'running' || node.status === 'thinking' || node.status === 'calling'
  const color = colorOf(String(node.status))
  const r = (isAgent ? 15 : 9) * SCALE
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const base = selected ? 8 : isAgent ? 4.5 : 3

  useFrame(({ clock }) => {
    if (!busy || !core.current) return
    // 자리는 그대로 두고 밝기만 숨쉰다
    core.current.emissiveIntensity = base * (0.76 + 0.32 * Math.sin(clock.elapsedTime * 3))
  })

  return (
    <group
      position={toThree(node.position, SCALE)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <mesh>
        <sphereGeometry args={[r, 24, 18]} />
        <meshStandardMaterial
          ref={core}
          color="#ffffff"
          emissive={color}
          emissiveIntensity={base}
          toneMapped={false}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[r * 2.4, 20, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <Html position={[r * 2.2, r * 1.4, 0]} distanceFactor={9} zIndexRange={[9, 0]}>
        <div className={`orb__label ${node.statusClass} orb--${node.kind}-label`}>
          <b>{node.label}</b>
          {isAgent && <span>{node.status}</span>}
        </div>
      </Html>
    </group>
  )
}

/** 핵→에이전트 / 에이전트→도구 결합선 */
function Bond({ link }: { link: Link }) {
  const points = useMemo(
    () => [toThree(link.from, SCALE), toThree(link.to, SCALE)],
    [link.from, link.to],
  )

  return (
    <Line
      points={points}
      color={colorOf(link.status)}
      lineWidth={link.kind === 'agent' ? 1.1 : 0.8}
      transparent
      opacity={link.kind === 'agent' ? 0.32 : 0.18}
      toneMapped={false}
    />
  )
}

/** 에이전트 간 메시지. 선은 고정이고, 활성일 때만 스파크가 지나간다. */
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

  if (!pulse.active) return null

  return (
    <group>
      <Line
        points={[a, b]}
        color="#6fb6ff"
        lineWidth={1.5}
        transparent
        opacity={0.7}
        toneMapped={false}
      />
      <mesh ref={spark}>
        <sphereGeometry args={[0.032, 16, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#9fd0ff"
          emissiveIntensity={7}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** 배경 별. Points 하나로 1200개를 찍는다. */
function Starfield() {
  const geometry = useMemo(() => {
    let seed = 20260822
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    const count = 1200
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(rand() * 2 - 1)
      const r = 26 + rand() * 22
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
        size={0.085}
        color="#c8dcff"
        sizeAttenuation
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}
