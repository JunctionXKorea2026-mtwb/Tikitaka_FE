import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { icosphere } from '../graph3d/atom'

/**
 * 랜딩 배경 — 원자들이 천천히 떠다닌다.
 *
 * 앱 화면과 같은 세계관을 쓰되 정보는 담지 않는다. 여기 원자는 장식이라
 * 상태색도 없고 격자도 성기게 간다 (본 화면에서 색이 뜻을 갖는 걸 흐리지 않으려고).
 *
 * 본 화면의 3D와 three 청크를 공유하므로 추가 다운로드가 없다.
 */

const TINTS = ['#3f9dff', '#45dcff', '#7b74ff', '#9fb9ff']

interface Drifter {
  position: [number, number, number]
  radius: number
  color: string
  /** 떠다니는 속도·위상 — 서로 어긋나야 살아 보인다 */
  speed: number
  phase: number
  spin: number
}

export function LandingScene() {
  const atoms = useMemo<Drifter[]>(() => {
    let seed = 20260823
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    // 가운데는 글자가 앉는 자리라 비워 두고 가장자리에만 띄운다
    return Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2 + rand() * 0.6
      const dist = 3.4 + rand() * 2.2
      return {
        position: [
          Math.cos(angle) * dist,
          (rand() - 0.5) * 3.4,
          -2 - rand() * 5,
        ] as [number, number, number],
        radius: 0.5 + rand() * 0.75,
        color: TINTS[i % TINTS.length],
        speed: 0.16 + rand() * 0.24,
        phase: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * 0.14,
      }
    })
  }, [])

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 8], fov: 50, near: 0.1, far: 60 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#03050d']} />
      <fog attach="fog" args={['#03050d', 9, 26]} />
      <ambientLight intensity={0.5} />

      <Starfield />
      {atoms.map((atom, i) => (
        <Drift key={i} atom={atom} />
      ))}

      <EffectComposer>
        <Bloom intensity={1.7} luminanceThreshold={0.15} luminanceSmoothing={0.6} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}

/** 원자 하나 — 위아래로 흔들리며 천천히 돈다 */
function Drift({ atom }: { atom: Drifter }) {
  const group = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    group.current.position.y = atom.position[1] + Math.sin(t * atom.speed + atom.phase) * 0.42
    group.current.rotation.y = t * atom.spin
    group.current.rotation.x = Math.sin(t * atom.speed * 0.5) * 0.12
  })

  return (
    <group ref={group} position={atom.position}>
      <Lattice radius={atom.radius} color={atom.color} />
      <mesh>
        <sphereGeometry args={[atom.radius * 0.16, 20, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={atom.color}
          emissiveIntensity={4}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[atom.radius * 0.5, 24, 18]} />
        <meshBasicMaterial
          color={atom.color}
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** 측지선 격자 — 본 화면과 같은 방식이지만 성기게 */
function Lattice({ radius, color }: { radius: number; color: string }) {
  const { lines, points } = useMemo(() => {
    const { vertices, edges } = icosphere(radius, 1)

    const lp = new Float32Array(edges.length * 6)
    edges.forEach(([a, b], i) => {
      lp.set([vertices[a].x, vertices[a].y, vertices[a].z], i * 6)
      lp.set([vertices[b].x, vertices[b].y, vertices[b].z], i * 6 + 3)
    })
    const pp = new Float32Array(vertices.length * 3)
    vertices.forEach((v, i) => pp.set([v.x, v.y, v.z], i * 3))

    const l = new THREE.BufferGeometry()
    l.setAttribute('position', new THREE.BufferAttribute(lp, 3))
    const p = new THREE.BufferGeometry()
    p.setAttribute('position', new THREE.BufferAttribute(pp, 3))
    return { lines: l, points: p }
  }, [radius])

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
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <points geometry={points}>
        <pointsMaterial
          color="#cfe4ff"
          size={0.05}
          sizeAttenuation
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  )
}

/** 배경 별 */
function Starfield() {
  const geometry = useMemo(() => {
    let seed = 7717
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const count = 900
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(rand() * 2 - 1)
      const r = 16 + rand() * 14
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi)
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
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
  )
}
