import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { icosphere } from '../graph3d/atom'

/**
 * 랜딩 배경 — 원자 하나.
 *
 * START를 누르면 그 원자가 급격히 퍼지면서 화면을 삼킨다.
 * "밖에서 보던 구조 안으로 들어간다"는 느낌이라, 커지는 동시에 옅어져야 한다 —
 * 커지기만 하면 벽에 부딪히는 것처럼 보인다.
 *
 * 진행도는 ref 하나로 공유한다. 매 프레임 state를 바꾸면 React가 따라오지 못한다.
 */

const TINT = '#4da3ff'
/** 퍼지는 데 걸리는 시간 (초). Landing의 전환 타이머와 맞춘다. */
export const BURST_SECONDS = 0.9

export function LandingScene({ exiting }: { exiting: boolean }) {
  const progress = useRef(0)

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6.2], fov: 50, near: 0.1, far: 60 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#03050d']} />
      <ambientLight intensity={0.5} />

      <Clock exiting={exiting} progress={progress} />
      <Starfield progress={progress} />
      <Atom progress={progress} />

      <EffectComposer>
        <Bloom intensity={1.8} luminanceThreshold={0.14} luminanceSmoothing={0.6} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}

/** 진행도만 굴린다. 나머지는 이 값을 읽어 각자 움직인다. */
function Clock({ exiting, progress }: { exiting: boolean; progress: RefObject<number> }) {
  useFrame((_, delta) => {
    if (!exiting) return
    progress.current = Math.min(1, progress.current + delta / BURST_SECONDS)
  })
  return null
}

/** 처음엔 느리고 끝에 급가속 — 빨려드는 느낌은 이 곡선에서 나온다 */
const easeIn = (t: number) => t * t * t

function Atom({ progress }: { progress: RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const shell = useRef<THREE.LineBasicMaterial>(null)
  const dots = useRef<THREE.PointsMaterial>(null)
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const halo = useRef<THREE.MeshBasicMaterial>(null)

  const { lines, points } = useLattice(1.85, 3)

  useFrame(({ clock }) => {
    const e = easeIn(progress.current)
    const g = group.current
    if (!g) return

    // 가만히 있을 때는 아주 느리게 돈다. 살아 있다는 최소한의 신호.
    g.rotation.y = clock.elapsedTime * 0.06
    g.rotation.x = Math.sin(clock.elapsedTime * 0.13) * 0.12
    g.scale.setScalar(1 + e * 11)

    // 커지면서 옅어져야 통과하는 것처럼 보인다
    const fade = 1 - e
    if (shell.current) shell.current.opacity = 0.34 * fade
    if (dots.current) dots.current.opacity = 0.9 * fade
    if (halo.current) halo.current.opacity = 0.15 * fade
    if (core.current) core.current.emissiveIntensity = 5 * (1 - easeIn(progress.current) * 0.9)
  })

  return (
    <group ref={group}>
      <lineSegments geometry={lines}>
        <lineBasicMaterial
          ref={shell}
          color={TINT}
          transparent
          opacity={0.34}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      <points geometry={points}>
        <pointsMaterial
          ref={dots}
          color="#cfe4ff"
          size={0.045}
          sizeAttenuation
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>

      {/* 안쪽 빛무리 */}
      <mesh>
        <sphereGeometry args={[1.3, 32, 24]} />
        <meshBasicMaterial
          ref={halo}
          color={TINT}
          transparent
          opacity={0.15}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* 핵 */}
      <mesh>
        <sphereGeometry args={[0.2, 24, 18]} />
        <meshStandardMaterial
          ref={core}
          color="#ffffff"
          emissive={TINT}
          emissiveIntensity={5}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** 별도 함께 밀려나야 "지나간다"는 느낌이 산다 */
function Starfield({ progress }: { progress: RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const geometry = useMemo(() => {
    let seed = 7717
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const count = 1100
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(rand() * 2 - 1)
      const r = 14 + rand() * 14
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi)
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.rotation.y = clock.elapsedTime * 0.012
    group.current.scale.setScalar(1 + easeIn(progress.current) * 1.6)
  })

  return (
    <group ref={group}>
      <points geometry={geometry}>
        <pointsMaterial
          size={0.07}
          color="#c8dcff"
          sizeAttenuation
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  )
}

/** 본 화면과 같은 측지선 구를 쓴다 */
function useLattice(radius: number, detail: number) {
  const geo = useMemo(() => {
    const { vertices, edges } = icosphere(radius, detail)

    const lp = new Float32Array(edges.length * 6)
    edges.forEach(([a, b], i) => {
      lp.set([vertices[a].x, vertices[a].y, vertices[a].z], i * 6)
      lp.set([vertices[b].x, vertices[b].y, vertices[b].z], i * 6 + 3)
    })
    const pp = new Float32Array(vertices.length * 3)
    vertices.forEach((v, i) => pp.set([v.x, v.y, v.z], i * 3))

    const lines = new THREE.BufferGeometry()
    lines.setAttribute('position', new THREE.BufferAttribute(lp, 3))
    const points = new THREE.BufferGeometry()
    points.setAttribute('position', new THREE.BufferAttribute(pp, 3))
    return { lines, points }
  }, [radius, detail])

  useEffect(
    () => () => {
      geo.lines.dispose()
      geo.points.dispose()
    },
    [geo],
  )

  return geo
}
