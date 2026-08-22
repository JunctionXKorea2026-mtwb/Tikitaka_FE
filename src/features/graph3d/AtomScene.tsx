import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { runStateOf, useRunStore, type Turn } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'
import {
  buildAtom,
  icosphere,
  layoutTurns,
  toThree,
  type AtomModel,
  type AtomNode,
  type Link,
  type Pulse,
  type Shell,
  type Vec3,
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
  const turns = useRunStore((s) => s.turns)
  const activeId = useRunStore((s) => s.activeId)
  const selectTurn = useRunStore((s) => s.selectTurn)

  // 대화 전체를 한 번에 보여준다. 클릭해도 카메라를 옮기지 않는다 —
  // 어느 턴이 패널·타임라인과 묶여 있는지만 밝기로 표시한다.
  const molecule = useMemo(() => buildMolecule(turns), [turns])
  const [spin, setSpin] = useState(true)

  const distance = Math.max(6, molecule.radius * SCALE * 2.4)

  return (
    <div className="atom3d">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, distance * 0.22, distance], fov: 45, near: 0.1, far: 400 }}
        gl={{ antialias: true }}
        onPointerMissed={() => useViewStore.getState().select(null)}
      >
        <color attach="background" args={['#03050d']} />
        <ambientLight intensity={0.45} />
        <pointLight position={[6, 8, 6]} intensity={45} color="#bcd8ff" distance={120} />

        <Starfield />

        {/* 주제와 주제, 질문과 후속 질문을 잇는 결합 */}
        {molecule.bonds.map((bond) => (
          <TurnBond key={bond.id} from={bond.from} to={bond.to} />
        ))}

        {molecule.atoms.map((item) => (
          <group key={item.id} position={toThree(item.origin, SCALE)}>
            <Atom
              atom={item.atom}
              active={item.id === activeId}
              discussionId={item.id}
              onSelectTurn={() => selectTurn(item.id)}
            />
          </group>
        ))}

        <OrbitControls
          enablePan
          minDistance={distance * 0.15}
          maxDistance={distance * 3}
          autoRotate={spin}
          autoRotateSpeed={0.3}
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
        <span>드래그: 회전 · 휠: 확대 · 우클릭 드래그: 이동 · 클릭: 선택</span>
        <button className={spin ? 'is-on' : undefined} onClick={() => setSpin((v) => !v)}>
          자동 회전 {spin ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}

/**
 * 대화 전체 = 분자.
 *
 * 턴마다 원자를 만들고 트리 배치로 자리를 잡는다.
 * 턴의 이벤트가 늘 때만 다시 접도록 캐시한다 — 매 렌더마다 전 대화를 재계산하면 낭비다.
 */
interface MoleculeItem {
  id: string
  origin: Vec3
  atom: AtomModel
}

interface Molecule {
  atoms: MoleculeItem[]
  bonds: { id: string; from: Vec3; to: Vec3 }[]
  /** 분자 전체를 감싸는 반지름 — 카메라 거리를 정한다 */
  radius: number
}

const atomCache = new Map<string, AtomModel>()

function buildMolecule(turns: Turn[]): Molecule {
  const placements = layoutTurns(turns.map((t) => ({ id: t.id, parentId: t.parentId })))
  const originOf = new Map(placements.map((p) => [p.id, p.position]))

  const atoms: MoleculeItem[] = []
  for (const turn of turns) {
    const key = `${turn.id}:${turn.events.length}`
    let atom = atomCache.get(key)
    if (!atom) {
      atom = buildAtom(runStateOf(turn), turn.prompt)
      atomCache.set(key, atom)
      // 같은 턴의 옛 항목은 버린다 (이벤트가 늘면 키가 바뀐다)
      for (const k of atomCache.keys()) {
        if (k !== key && k.startsWith(`${turn.id}:`)) atomCache.delete(k)
      }
    }
    atoms.push({ id: turn.id, origin: originOf.get(turn.id) ?? ORIGIN3, atom })
  }

  const bonds = placements
    .filter((p) => p.parentId && originOf.has(p.parentId))
    .map((p) => ({
      id: `bond-${p.id}`,
      from: originOf.get(p.parentId as string) as Vec3,
      to: p.position,
    }))

  const radius = atoms.reduce(
    (max, a) => Math.max(max, Math.hypot(a.origin.x, a.origin.z) + a.atom.extent),
    260,
  )

  return { atoms, bonds, radius }
}

const ORIGIN3: Vec3 = { x: 0, y: 0, z: 0 }

/** 질문과 후속 질문(또는 다른 주제)을 잇는 굵은 결합 */
function TurnBond({ from, to }: { from: Vec3; to: Vec3 }) {
  const points = useMemo(() => [toThree(from, SCALE), toThree(to, SCALE)], [from, to])
  return (
    <Line
      points={points}
      color="#4f8fd8"
      lineWidth={1.6}
      transparent
      opacity={0.4}
      toneMapped={false}
    />
  )
}

function Atom({
  atom,
  active,
  discussionId,
  onSelectTurn,
}: {
  atom: AtomModel
  active: boolean
  discussionId?: string
  onSelectTurn: () => void
}) {
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
        {/* 활성 턴만 격자를 조금 밝게 — 크기는 그대로 둔다 */}
        <Lattice shell={atom.shells[0]} opacity={active ? 0.26 : 0.13} />
        <Lattice shell={atom.shells[1]} opacity={active ? 0.15 : 0.075} />

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
        active={active}
        discussionId={discussionId}
        selected={selectedId === atom.rootId}
        onSelect={() => {
          onSelectTurn()
          select(atom.rootId)
        }}
      />
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
  active,
  selected,
  discussionId,
  onSelect,
}: {
  atom: AtomModel
  active: boolean
  selected: boolean
  discussionId?: string
  onSelect: () => void
}) {
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const color = colorOf(atom.rootStatus)
  const busy = atom.rootStatus === 'running' || atom.rootStatus === 'thinking'
  const r = atom.nucleusRadius * SCALE
  const base = selected ? 8 : active ? 5.5 : 3

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
        <div
          className={`orb__label nucleus__label ${atom.rootStatusClass}${active ? ' is-active' : ''}`}
        >
          <b>{atom.question || atom.rootLabel}</b>
          <span>
            {atom.rootLabel}
            {discussionId && ` · ${discussionId.slice(0, 8)}`}
          </span>
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
