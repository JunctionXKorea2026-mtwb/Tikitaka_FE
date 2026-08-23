import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
/**
 * 다음 질문이 붙을 원자를 표시하는 색.
 * 상태색(파랑 계열)과 겹치지 않게 호박색을 쓴다 — 상태가 아니라 "지금 겨냥한 곳"이라
 * 계열을 벗어나야 한눈에 구분된다.
 */
const TARGET = '#ffb347'

export function AtomScene() {
  const turns = useRunStore((s) => s.turns)
  const activeId = useRunStore((s) => s.activeId)
  const selectTurn = useRunStore((s) => s.selectTurn)

  // 대화 전체를 한 번에 보여준다. 클릭해도 카메라를 옮기지 않는다 —
  // 어느 턴이 패널·타임라인과 묶여 있는지만 밝기로 표시한다.
  const molecule = useMemo(() => buildMolecule(turns), [turns])
  const [spin, setSpin] = useState(true)
  const [dragging, setDragging] = useState<string | null>(null)
  // 원자를 끈 직후의 클릭이 선택으로 새지 않게 막는다
  const dragGuard = useRef(false)

  const atomPositions = useViewStore((s) => s.atomPositions)
  const composeMode = useViewStore((s) => s.composeMode)
  // 이어서 물으면 지금 보고 있는 턴에 붙는다. 그 원자를 표시해 준다.
  const targetId = composeMode === 'follow' ? activeId : null

  // 손으로 옮긴 자리가 있으면 그걸 쓴다
  const originOf = (id: string, base: Vec3): [number, number, number] =>
    atomPositions[id] ?? toThree(base, SCALE)

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

        <ViewportFit />
        <Starfield />

        {/* 주제와 주제, 질문과 후속 질문을 잇는 결합 */}
        {molecule.bonds.map((bond) => (
          <TurnBond
            key={bond.id}
            from={originOf(bond.fromId, bond.from)}
            to={originOf(bond.toId, bond.to)}
          />
        ))}

        {molecule.atoms.map((item) => (
          <AtomGroup
            key={item.id}
            id={item.id}
            position={originOf(item.id, item.origin)}
            setDragging={setDragging}
            guard={dragGuard}
          >
            <Atom
              guard={dragGuard}
              title={item.title}
              atom={item.atom}
              active={item.id === activeId}
              target={item.id === targetId}
              discussionId={item.id}
              onSelectTurn={() => selectTurn(item.id)}
            />
          </AtomGroup>
        ))}

        <OrbitControls
          // 원자를 끄는 동안은 카메라가 따라 돌면 안 된다
          enabled={dragging === null}
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
        <span>드래그: 회전 · 휠: 확대 · 클릭: 선택 · 원자를 끌면 자리 이동</span>
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
  /** 화면에 띄울 짧은 제목 (LLM 요약이 있으면 그것, 없으면 질문 앞부분) */
  title: string
}

interface Molecule {
  atoms: MoleculeItem[]
  /** 양 끝의 턴 id도 들고 있어야 손으로 옮긴 자리를 반영할 수 있다 */
  bonds: { id: string; fromId: string; toId: string; from: Vec3; to: Vec3 }[]
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
    atoms.push({
      id: turn.id,
      origin: originOf.get(turn.id) ?? ORIGIN3,
      atom,
      title: turn.titleSummary || turn.prompt,
    })
  }

  const bonds = placements
    .filter((p) => p.parentId && originOf.has(p.parentId))
    .map((p) => ({
      id: `bond-${p.id}`,
      fromId: p.parentId as string,
      toId: p.id,
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
function TurnBond({
  from,
  to,
}: {
  from: [number, number, number]
  to: [number, number, number]
}) {
  const points = useMemo(() => [from, to], [from, to])
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
  target,
  title,
  discussionId,
  guard,
  onSelectTurn,
}: {
  atom: AtomModel
  active: boolean
  /** 다음 질문이 여기에 붙는다 */
  target: boolean
  title: string
  discussionId?: string
  guard: React.RefObject<boolean>
  onSelectTurn: () => void
}) {
  const rawSelect = useViewStore((s) => s.select)
  // 끈 직후라면 선택하지 않는다
  const select: typeof rawSelect = (id, intent) => {
    if (guard.current) return
    rawSelect(id, intent)
  }
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
        <Lattice
          shell={atom.shells[0]}
          opacity={target ? 0.4 : active ? 0.26 : 0.13}
          color={target ? TARGET : undefined}
        />
        <Lattice
          shell={atom.shells[1]}
          opacity={target ? 0.22 : active ? 0.15 : 0.075}
          color={target ? TARGET : undefined}
        />

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
            onSelect={() => {
              if (guard.current) return
              // 에이전트를 고르면 그 턴으로 옮기고 상세를 연다
              onSelectTurn()
              select(node.kind === 'agent' ? node.id : null, 'agent')
            }}
          />
        ))}
      </group>

      {/* 핵 = 질문. 껍질과 함께 돌지 않는다 — 중심은 고정이어야 읽힌다 */}
      <Nucleus
        atom={atom}
        active={active}
        target={target}
        title={title}
        discussionId={discussionId}
        // 활성 턴에서만 선택을 표시한다 (id가 겹칠 여지를 아예 없앤다)
        selected={active && selectedId === atom.rootId}
        onSelect={() => {
          if (guard.current) return
          // 핵은 질문 그 자체 — 그 턴의 결과를 보여준다
          onSelectTurn()
          select(atom.rootId, 'result')
        }}
      />
    </group>
  )
}

/**
 * 원자를 끌어서 옮긴다.
 *
 * 카메라를 마주 보는 평면 위에서 끈다 — 어느 각도에서 봐도 포인터를 따라오게 하려면
 * 이 평면이 제일 자연스럽다. 옮긴 자리는 저장되고, 자동 배치 위에 덮어씌워진다.
 *
 * 포인터가 원자를 벗어나도 계속 따라와야 하므로 이동/뗌은 window에서 듣는다.
 * 움직임이 임계값을 넘지 않으면 드래그가 아니라 클릭으로 흘려보낸다 — 안 그러면
 * 원자를 고를 수 없다.
 */
function AtomGroup({
  id,
  position,
  setDragging,
  guard,
  children,
}: {
  id: string
  position: [number, number, number]
  setDragging: (id: string | null) => void
  /** 끈 직후의 클릭을 선택으로 치지 않기 위한 공유 표시 */
  guard: React.RefObject<boolean>
  children: React.ReactNode
}) {
  const setAtomPosition = useViewStore((s) => s.setAtomPosition)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const plane = useRef(new THREE.Plane())
  const grab = useRef(new THREE.Vector3())
  const moved = useRef(false)

  const onPointerDown = useCallback(
    (e: { stopPropagation: () => void; ray: THREE.Ray; nativeEvent: PointerEvent }) => {
      e.stopPropagation()
      const here = new THREE.Vector3(...position)

      // 카메라를 마주 보는 평면
      const normal = camera.getWorldDirection(new THREE.Vector3()).negate()
      plane.current.setFromNormalAndCoplanarPoint(normal, here)

      const hit = new THREE.Vector3()
      if (!e.ray.intersectPlane(plane.current, hit)) return
      grab.current.copy(here).sub(hit)
      moved.current = false
      guard.current = false
      setDragging(id)

      const rect = gl.domElement.getBoundingClientRect()
      const ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2()

      const onMove = (ev: PointerEvent) => {
        ndc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        )
        ray.setFromCamera(ndc, camera)
        const next = new THREE.Vector3()
        if (!ray.ray.intersectPlane(plane.current, next)) return
        next.add(grab.current)
        if (next.distanceTo(here) > 0.05) {
          moved.current = true
          guard.current = true
        }
        setAtomPosition(id, [next.x, next.y, next.z])
      }

      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDragging(null)
        // 이 pointerup 뒤에 오는 click 한 번만 막고 표시를 지운다
        window.setTimeout(() => {
          guard.current = false
        }, 0)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [camera, gl, guard, id, position, setAtomPosition, setDragging],
  )

  return (
    <group position={position} onPointerDown={onPointerDown}>
      {children}
    </group>
  )
}

/**
 * 사이드바가 가리는 만큼 화면을 되돌려 준다.
 *
 * 사이드바는 캔버스 **위에** 얹힌다 (그리드 칸으로 두면 열 때마다 WebGL 캔버스가
 * 리사이즈되면서 화면이 통째로 흔들린다). 대신 그만큼 원자가 가려지므로,
 * 캔버스 크기는 그대로 두고 **카메라 프러스텀만** 손본다.
 *
 *   zoom          가려지는 폭만큼 시야를 넓힌다 → 잘리지 않는다
 *   setViewOffset 프러스텀을 오른쪽으로 밀면 내용은 왼쪽으로 온다
 *                 → 남은 영역 한가운데에 놓인다
 *
 * OrbitControls는 카메라 위치를 만지고 여기서는 투영만 만지므로 서로 싸우지 않는다.
 */
function ViewportFit() {
  const panelOpen = useViewStore((s) => s.panelOpen)
  const panelWidth = useViewStore((s) => s.panelWidth)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    // 패널이 화면을 다 덮는 상황에서 0으로 나누지 않도록 막는다
    const hidden = panelOpen ? Math.min(panelWidth, size.width * 0.7) : 0

    if (hidden > 0) {
      cam.zoom = (size.width - hidden) / size.width
      cam.setViewOffset(size.width, size.height, hidden / 2, 0, size.width, size.height)
    } else {
      cam.zoom = 1
      cam.clearViewOffset()
    }
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height, panelOpen, panelWidth])

  return null
}

/** 오비탈 껍질을 이루는 측지선 격자 — 모서리 선 + 꼭짓점 점 */
function Lattice({
  shell,
  opacity,
  color = LATTICE,
}: {
  shell: Shell
  opacity: number
  color?: string
}) {
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
          color={color}
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
  target,
  selected,
  title,
  discussionId,
  onSelect,
}: {
  atom: AtomModel
  active: boolean
  target: boolean
  selected: boolean
  title: string
  discussionId?: string
  onSelect: () => void
}) {
  const core = useRef<THREE.MeshStandardMaterial>(null)
  // 다음 질문이 붙을 원자는 상태색을 벗어난 호박색으로 — 한눈에 겨냥한 곳이 보인다
  const color = target ? TARGET : colorOf(atom.rootStatus)
  const busy = atom.rootStatus === 'running' || atom.rootStatus === 'thinking'
  const r = atom.nucleusRadius * SCALE
  const base = target ? 9 : selected ? 8 : active ? 5.5 : 3

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
          className={`orb__label nucleus__label ${atom.rootStatusClass}${active ? ' is-active' : ''}${target ? ' is-target' : ''}`}
          title={atom.question || atom.rootLabel}
        >
          {/* LLM이 줄인 제목이 있으면 그걸 쓴다. 없으면 질문 앞부분을 자른다.
              질문 전문을 띄우면 원자마다 문단이 붙어 화면을 못 읽는다. */}
          <b>{shortTitle(title || atom.question || atom.rootLabel, 22)}</b>
          <span>
            {target ? '↳ 여기에 이어서' : discussionId ? discussionId.slice(0, 8) : atom.rootLabel}
          </span>
        </div>
      </Html>
    </group>
  )
}

/** 핵에 붙일 짧은 제목. 원자가 여러 개 떠 있으므로 한 줄을 넘기면 안 된다. */
function shortTitle(text: string, max = 16): string {
  const line = text.trim().split('\n')[0]
  return line.length > max ? `${line.slice(0, max)}…` : line
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
