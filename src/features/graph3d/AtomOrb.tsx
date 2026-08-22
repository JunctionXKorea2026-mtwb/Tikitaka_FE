import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * 노드 하나 = 그 자체로 하나의 원자.
 *
 * 매끈한 구는 당구공처럼 보인다. 아이언맨 랩의 홀로그램이 살아 보이는 건
 * 여러 겹이 겹쳐 있기 때문이다. 안쪽부터:
 *
 *   1. 코어      작고 희게 타오르는 중심 (Bloom이 여기서 번진다)
 *   2. 안개      코어를 감싼 부드러운 발광 (BackSide로 안쪽을 비춘다)
 *   3. 침        중심에서 바깥으로 뻗은 수십 개의 가는 선 (성게)
 *   4. 껍질      지오데식 와이어프레임 — 구의 부피를 눈에 보이게 한다
 *   5. 먼지      껍질 표면의 점들, 반짝임
 *   6. 고리      기울기가 다른 얇은 원 두 개
 *
 * 모든 겹이 가산 혼합(AdditiveBlending)이라 겹칠수록 밝아진다 — 빛처럼 보이는 핵심.
 */

interface AtomOrbProps {
  radius: number
  color: string
  /** 코어 발광 세기. Bloom 임계값을 넘겨야 번진다. */
  intensity: number
  /** 실행 중이면 코어가 숨쉰다 */
  pulse?: boolean
  /** 침·먼지 개수. 작은 노드는 줄인다. */
  detail?: number
  /** 껍질만 필요할 때 (핵처럼 안쪽에 이미 내용이 있는 경우) 코어를 끈다 */
  core?: boolean
}

export function AtomOrb({
  radius,
  color,
  intensity,
  pulse = false,
  detail = 1,
  core: showCore = true,
}: AtomOrbProps) {
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const shell = useRef<THREE.Group>(null)

  const spikes = useMemo(() => spikeGeometry(radius, Math.round(64 * detail)), [radius, detail])
  const dust = useMemo(() => dustGeometry(radius, Math.round(90 * detail)), [radius, detail])
  const rings = useMemo(() => ringGeometries(radius), [radius])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (pulse && core.current) {
      // 자리는 그대로 두고 밝기만 숨쉰다 — 산만하지 않게
      core.current.emissiveIntensity = intensity * (0.78 + 0.32 * Math.sin(t * 3))
    }
    // 껍질만 아주 느리게 돈다. 원자가 살아 있다는 최소한의 신호.
    if (shell.current) shell.current.rotation.y = t * 0.12
  })

  return (
    <group>
      {showCore && (
        <>
          {/* 1. 코어 */}
          <mesh>
            <sphereGeometry args={[radius * 0.3, 24, 18]} />
            <meshStandardMaterial
              ref={core}
              color="#ffffff"
              emissive={color}
              emissiveIntensity={intensity}
              toneMapped={false}
            />
          </mesh>

          {/* 2. 안개 — 안쪽 면을 칠해 코어를 감싼 빛무리를 만든다 */}
          <mesh>
            <sphereGeometry args={[radius * 0.78, 32, 24]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.16}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      )}

      <group ref={shell}>
        {/* 3. 침 */}
        <lineSegments geometry={spikes}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={0.42}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>

        {/* 4. 지오데식 껍질 */}
        <mesh>
          <icosahedronGeometry args={[radius, 2]} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* 5. 먼지 */}
        <points geometry={dust}>
          <pointsMaterial
            color="#dceaff"
            size={radius * 0.075}
            sizeAttenuation
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>

        {/* 6. 고리 */}
        {rings.map((geometry, i) => (
          <lineLoop key={i} geometry={geometry}>
            <lineBasicMaterial
              color={color}
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </lineLoop>
        ))}
      </group>
    </group>
  )
}

// ------------------------------------------------------------------ 지오메트리
//
// 같은 반지름은 몇 번이고 다시 쓰이므로 캐시한다.
// (에이전트용·도구용 두 종류뿐이라 캐시가 몇 개 안 된다)

const cache = new Map<string, THREE.BufferGeometry>()

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = cache.get(key)
  if (hit) return hit
  const made = make()
  cache.set(key, made)
  return made
}

/** 구면에 고르게 흩은 방향들 (피보나치 나선) */
function directions(count: number): [number, number, number][] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: [number, number, number][] = []
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    out.push([Math.cos(theta) * r, y, Math.sin(theta) * r])
  }
  return out
}

/** 중심에서 바깥으로 뻗는 침. 길이를 조금씩 달리해야 성게처럼 보인다. */
function spikeGeometry(radius: number, count: number): THREE.BufferGeometry {
  return cached(`spike:${radius}:${count}`, () => {
    const dirs = directions(count)
    const positions = new Float32Array(count * 6)

    dirs.forEach((d, i) => {
      const inner = radius * 0.42
      // 결정론적 흔들림 — 같은 길이가 늘어서면 기계적으로 보인다
      const outer = radius * (1.0 + 0.22 * (((i * 7919) % 100) / 100))
      positions.set(
        [d[0] * inner, d[1] * inner, d[2] * inner, d[0] * outer, d[1] * outer, d[2] * outer],
        i * 6,
      )
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  })
}

/** 껍질 표면에 뿌린 반짝임 */
function dustGeometry(radius: number, count: number): THREE.BufferGeometry {
  return cached(`dust:${radius}:${count}`, () => {
    const dirs = directions(count)
    const positions = new Float32Array(count * 3)

    dirs.forEach((d, i) => {
      const r = radius * (0.9 + 0.24 * (((i * 6271) % 100) / 100))
      positions.set([d[0] * r, d[1] * r, d[2] * r], i * 3)
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  })
}

/** 기울기가 다른 얇은 고리 두 개 */
function ringGeometries(radius: number): THREE.BufferGeometry[] {
  return [
    { r: radius * 1.06, tiltX: 0.32, tiltZ: 0.18 },
    { r: radius * 0.86, tiltX: 1.24, tiltZ: -0.5 },
  ].map(({ r, tiltX, tiltZ }, index) =>
    cached(`ring:${radius}:${index}`, () => {
      const segments = 72
      const positions = new Float32Array(segments * 3)
      const m = new THREE.Matrix4().makeRotationX(tiltX).multiply(
        new THREE.Matrix4().makeRotationZ(tiltZ),
      )
      const v = new THREE.Vector3()

      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2
        v.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyMatrix4(m)
        positions.set([v.x, v.y, v.z], i * 3)
      }

      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      return g
    }),
  )
}
