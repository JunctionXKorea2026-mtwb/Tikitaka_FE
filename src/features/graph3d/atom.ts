import type { AgentRole } from '../../entities/event'
import type { AgentStatus, RunState } from '../../entities/run'

/**
 * 실행 상태를 원자 모형으로 옮긴다.
 *
 * 아이언맨의 원소 홀로그램 같은 그림을 목표로 하되, 장식이 되지 않도록
 * 모든 요소가 실제 정보를 나른다.
 *
 *   핵          루트 에이전트
 *   양성자      생성된 하위 에이전트 수
 *   중성자      도구 호출 수          → 실행이 진행될수록 핵이 자란다
 *   전자        하위 에이전트 (상태 = 색)
 *   위성        그 에이전트의 도구 호출
 *   에너지선    에이전트 간 메시지
 *
 * 2D(React Flow + ELK)와 달리 좌표를 공유하지 않는다. 여기서는 계층이
 * "무엇이 무엇을 공전하는가"로 표현된다.
 */

export interface Nucleon {
  kind: 'proton' | 'neutron'
  x: number
  y: number
  z: number
}

export interface Body {
  id: string
  kind: 'agent' | 'tool'
  /** 무엇을 공전하는가. null이면 핵. */
  parentId: string | null
  label: string
  /** CSS에서 --accent를 잡는 클래스 (status-* / tool-*) */
  statusClass: string
  status: AgentStatus | 'running' | 'ok' | 'error'
  role?: AgentRole
  /** 부모로부터의 궤도 반지름 */
  radius: number
  /** 궤도면을 세우는 각도 (도) */
  tilt: number
  ringYaw: number
  /** 각속도 (rad/s) */
  speed: number
  phase: number
  /** 부모까지 거슬러 올라간 깊이. 위치를 순서대로 풀 때 쓴다. */
  depth: number
}

export interface Pulse {
  id: string
  from: string
  to: string
  active: boolean
  count: number
}

export interface AtomModel {
  rootId: string | null
  rootLabel: string
  rootStatusClass: string
  nucleons: Nucleon[]
  nucleusRadius: number
  bodies: Body[]
  pulses: Pulse[]
  /** 가장 바깥 궤도. 화면에 맞추는 배율 계산에 쓴다. */
  extent: number
}

const MAX_NUCLEONS = 26

export function buildAtom(run: RunState): AtomModel {
  const agents = run.agentOrder.map((id) => run.agents[id]).filter((a) => !!a)
  const root = agents.find((a) => !a.parentId)

  if (!root) {
    return {
      rootId: null,
      rootLabel: '',
      rootStatusClass: '',
      nucleons: [],
      nucleusRadius: 0,
      bodies: [],
      pulses: [],
      extent: 240,
    }
  }

  const others = agents.filter((a) => a.id !== root.id)
  const toolCalls = agents.reduce((sum, a) => sum + a.calls.length, 0)

  // 핵: 양성자 = 하위 에이전트, 중성자 = 도구 호출
  const protons = Math.max(1, Math.min(MAX_NUCLEONS - 1, others.length))
  const neutrons = Math.min(MAX_NUCLEONS - protons, toolCalls)
  const nucleusRadius = 20 + Math.sqrt(protons + neutrons) * 5.5
  const nucleons = packNucleons(protons, neutrons, nucleusRadius)

  // 전자: 형제 순서에 따라 반지름·기울기·공전 방향을 흩는다
  const bodies: Body[] = []
  const siblingIndex = new Map<string, number>()

  const indexOf = (parentId: string) => {
    const next = (siblingIndex.get(parentId) ?? 0) + 1
    siblingIndex.set(parentId, next)
    return next - 1
  }

  const depthOf = (agentId: string): number => {
    let depth = 0
    let cursor = run.agents[agentId]?.parentId
    while (cursor && depth < 8) {
      depth += 1
      cursor = run.agents[cursor]?.parentId
    }
    return depth
  }

  for (const agent of others) {
    const parentId = agent.parentId === root.id ? null : (agent.parentId ?? null)
    const i = indexOf(agent.parentId ?? root.id)
    const depth = depthOf(agent.id)

    bodies.push({
      id: agent.id,
      kind: 'agent',
      parentId,
      label: agent.label,
      statusClass: `status-${agent.status}`,
      status: agent.status,
      role: agent.role,
      radius: (depth === 1 ? 205 : 120) + i * 48,
      tilt: 66 + (i % 3) * 16,
      // 궤도면을 고르게 흩어 고전적인 원자 기호 모양을 만든다
      ringYaw: (i * 180) / Math.max(1, others.length) + depth * 24,
      speed: (0.2 - i * 0.022) * (i % 2 === 0 ? 1 : -1),
      phase: i * 1.1,
      depth,
    })
  }

  // 위성: 각 에이전트의 도구 호출
  for (const agent of agents) {
    agent.calls.forEach((call, j) => {
      bodies.push({
        id: `tool:${call.callId}`,
        kind: 'tool',
        parentId: agent.id === root.id ? null : agent.id,
        label: call.toolName,
        statusClass: `tool-${call.status}`,
        status: call.status,
        radius: (agent.id === root.id ? nucleusRadius + 74 : 52) + j * 15,
        tilt: 30 + j * 27,
        ringYaw: j * 63,
        speed: (0.85 + j * 0.12) * (j % 2 === 0 ? 1 : -1),
        phase: j * 2.0,
        depth: (agent.id === root.id ? 0 : depthOf(agent.id)) + 1,
      })
    })
  }

  bodies.sort((a, b) => a.depth - b.depth)

  const pulses: Pulse[] = Object.values(run.links).map((link) => ({
    id: link.id,
    from: link.from === root.id ? '@nucleus' : link.from,
    to: link.to === root.id ? '@nucleus' : link.to,
    active: run.clock - link.lastTs <= 2,
    count: link.count,
  }))

  const extent = bodies.reduce((max, b) => Math.max(max, b.radius + 90), nucleusRadius + 160)

  return {
    rootId: root.id,
    rootLabel: root.label,
    rootStatusClass: `status-${root.status}`,
    nucleons,
    nucleusRadius,
    bodies,
    pulses,
    extent,
  }
}

/**
 * 핵자를 구 안에 고르게 흩는다.
 * 피보나치 구 배치 — 개수가 늘어도 뭉치거나 줄서지 않는다.
 */
function packNucleons(protons: number, neutrons: number, radius: number): Nucleon[] {
  const total = protons + neutrons
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Nucleon[] = []

  for (let i = 0; i < total; i++) {
    const y = total === 1 ? 0 : 1 - (i / (total - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    // 껍질에만 붙지 않도록 안쪽으로도 조금씩 당긴다
    const shell = 0.55 + 0.45 * ((i * 7919) % 100) / 100

    out.push({
      kind: i < protons ? 'proton' : 'neutron',
      x: Math.cos(theta) * r * radius * shell,
      y: y * radius * shell,
      z: Math.sin(theta) * r * radius * shell,
    })
  }

  return out
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * 시각 t에서 각 물체의 위치.
 *
 * 부모를 공전하므로 깊이 순으로 풀어야 한다 (bodies는 이미 정렬돼 있다).
 * 궤도면은 수평 원(XZ)을 rotateX(tilt) → rotateY(ringYaw) 시킨 것이고,
 * 이는 CSS 쪽 ring 요소의 변환과 정확히 같은 회전이다.
 */
export function solvePositions(bodies: Body[], time: number): Map<string, Vec3> {
  const positions = new Map<string, Vec3>([['@nucleus', { x: 0, y: 0, z: 0 }]])

  for (const body of bodies) {
    const parent = positions.get(body.parentId ?? '@nucleus') ?? { x: 0, y: 0, z: 0 }
    const angle = body.phase + time * body.speed

    // 수평 원 위의 점
    const x0 = Math.cos(angle) * body.radius
    const z0 = Math.sin(angle) * body.radius

    // rotateX(tilt): y' = −z·sin, z' = z·cos   (y0 = 0)
    const tilt = (body.tilt * Math.PI) / 180
    const y1 = -z0 * Math.sin(tilt)
    const z1 = z0 * Math.cos(tilt)

    // rotateY(ringYaw): x' = x·cos + z·sin, z' = −x·sin + z·cos
    const yaw = (body.ringYaw * Math.PI) / 180
    const x2 = x0 * Math.cos(yaw) + z1 * Math.sin(yaw)
    const z2 = -x0 * Math.sin(yaw) + z1 * Math.cos(yaw)

    positions.set(body.id, { x: parent.x + x2, y: parent.y + y1, z: parent.z + z2 })
  }

  return positions
}

/**
 * three 좌표로의 변환.
 *
 * atom.ts의 모형은 화면 px 단위이고 CSS 관례대로 y가 아래로 증가한다.
 * three는 월드 단위에 y가 위로 증가하므로 줄이고 뒤집는다.
 */
export const toThree = (v: Vec3, scale: number): [number, number, number] => [
  v.x * scale,
  -v.y * scale,
  v.z * scale,
]

/**
 * 궤도선을 이루는 점들 (three 좌표).
 * solvePositions와 같은 회전을 쓴다 — 입자가 이 선 위에 정확히 놓여야 한다.
 */
export function ringPoints(body: Body, scale: number, segments = 96): [number, number, number][] {
  const tilt = (body.tilt * Math.PI) / 180
  const yaw = (body.ringYaw * Math.PI) / 180
  const out: [number, number, number][] = []

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x0 = Math.cos(a) * body.radius
    const z0 = Math.sin(a) * body.radius

    const y1 = -z0 * Math.sin(tilt)
    const z1 = z0 * Math.cos(tilt)

    out.push(
      toThree(
        {
          x: x0 * Math.cos(yaw) + z1 * Math.sin(yaw),
          y: y1,
          z: -x0 * Math.sin(yaw) + z1 * Math.cos(yaw),
        },
        scale,
      ),
    )
  }

  return out
}
