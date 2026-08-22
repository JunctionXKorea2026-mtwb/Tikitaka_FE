import type { AgentRole } from '../../entities/event'
import type { AgentStatus, RunState } from '../../entities/run'

/**
 * 실행 상태를 방사형 3D 모형으로 옮긴다.
 *
 *   핵          루트 에이전트
 *   양성자      생성된 하위 에이전트 수
 *   중성자      도구 호출 수          → 실행이 진행될수록 핵이 자란다
 *   전자        하위 에이전트 (상태 = 색)
 *   위성        그 에이전트의 도구 호출
 *   스포크      부모-자식 연결
 *   에너지선    에이전트 간 메시지
 *
 * 위치는 **정적**이다. 물체가 각자 공전하면 눈이 쉴 곳이 없어 오히려 안 읽힌다.
 * 움직이는 것은 카메라(천천히, 끌 수 있음)와 메시지 스파크뿐이고 후자는 정보를 나른다.
 *
 * 2D(React Flow + ELK)와 달리 좌표를 공유하지 않는다. 여기서는 계층이
 * "중심에서 얼마나 뻗어 나갔는가"로 표현된다.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Nucleon {
  kind: 'proton' | 'neutron'
  position: Vec3
}

export interface Body {
  id: string
  kind: 'agent' | 'tool'
  /** 무엇에 매달려 있는가. null이면 핵. */
  parentId: string | null
  label: string
  /** CSS에서 --accent를 잡는 클래스 (status-* / tool-*) */
  statusClass: string
  status: AgentStatus | 'running' | 'ok' | 'error'
  role?: AgentRole
  /** 원점(핵) 기준 절대 위치 */
  position: Vec3
}

/** 부모에서 자식으로 뻗는 선 */
export interface Spoke {
  id: string
  from: Vec3
  to: Vec3
  kind: 'agent' | 'tool'
  statusClass: string
  status: string
}

export interface Pulse {
  id: string
  from: Vec3
  to: Vec3
  active: boolean
  count: number
}

export interface AtomModel {
  rootId: string | null
  rootLabel: string
  rootStatus: string
  rootStatusClass: string
  nucleons: Nucleon[]
  nucleusRadius: number
  bodies: Body[]
  spokes: Spoke[]
  pulses: Pulse[]
  /** 가장 바깥 물체까지의 거리 */
  extent: number
}

const MAX_NUCLEONS = 26
/** 핵에서 에이전트까지 */
const AGENT_REACH = 240
/** 에이전트에서 도구까지 */
const TOOL_REACH = 105
/** 세로를 눌러 공처럼 뭉치지 않고 방사형으로 퍼져 보이게 한다 */
const FLATTEN = 0.52

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

export function buildAtom(run: RunState): AtomModel {
  const agents = run.agentOrder.map((id) => run.agents[id]).filter((a) => !!a)
  const root = agents.find((a) => !a.parentId)

  if (!root) {
    return {
      rootId: null,
      rootLabel: '',
      rootStatus: '',
      rootStatusClass: '',
      nucleons: [],
      nucleusRadius: 0,
      bodies: [],
      spokes: [],
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

  const bodies: Body[] = []
  const spokes: Spoke[] = []
  const position = new Map<string, Vec3>([[root.id, ORIGIN]])

  // 1단계: 핵에 직접 매달린 에이전트를 구면에 고르게 흩는다
  const direct = others.filter((a) => a.parentId === root.id)
  const dirs = spread(direct.length)

  direct.forEach((agent, i) => {
    const p = scale(dirs[i], AGENT_REACH)
    position.set(agent.id, p)
    bodies.push(agentBody(agent, root.id, p))
    spokes.push(makeSpoke(`spoke-${agent.id}`, ORIGIN, p, 'agent', agent.status))
  })

  // 2단계: 그 아래 중첩된 에이전트는 부모의 바깥 방향으로 더 뻗는다
  const nested = others.filter((a) => a.parentId !== root.id)
  for (const agent of nested) {
    const parentPos = position.get(agent.parentId ?? root.id) ?? ORIGIN
    const siblings = nested.filter((a) => a.parentId === agent.parentId)
    const p = fanOut(parentPos, siblings.indexOf(agent), siblings.length, AGENT_REACH * 0.62)
    position.set(agent.id, p)
    bodies.push(agentBody(agent, agent.parentId ?? root.id, p))
    spokes.push(makeSpoke(`spoke-${agent.id}`, parentPos, p, 'agent', agent.status))
  }

  // 3단계: 도구는 자기 에이전트의 바깥쪽에 부챗살로 편다
  for (const agent of agents) {
    const base = position.get(agent.id) ?? ORIGIN
    agent.calls.forEach((call, j) => {
      const reach = agent.id === root.id ? nucleusRadius + TOOL_REACH : TOOL_REACH
      const p = fanOut(base, j, agent.calls.length, reach)
      const id = `tool:${call.callId}`
      position.set(id, p)
      bodies.push({
        id,
        kind: 'tool',
        parentId: agent.id === root.id ? null : agent.id,
        label: call.toolName,
        statusClass: `tool-${call.status}`,
        status: call.status,
        position: p,
      })
      spokes.push(makeSpoke(`spoke-${id}`, base, p, 'tool', call.status))
    })
  }

  const pulses: Pulse[] = Object.values(run.links)
    .map((link) => ({
      id: link.id,
      from: position.get(link.from) ?? ORIGIN,
      to: position.get(link.to) ?? ORIGIN,
      active: run.clock - link.lastTs <= 2,
      count: link.count,
    }))
    // 핵에서 핵으로 가는 것 같은 길이 0짜리 선은 그리지 않는다
    .filter((p) => length(sub(p.to, p.from)) > 1)

  const extent = bodies.reduce((max, b) => Math.max(max, length(b.position)), nucleusRadius + 160)

  return {
    rootId: root.id,
    rootLabel: root.label,
    rootStatus: root.status,
    rootStatusClass: `status-${root.status}`,
    nucleons,
    nucleusRadius,
    bodies,
    spokes,
    pulses,
    extent,
  }
}

// ------------------------------------------------------------------ 배치

/**
 * 구면에 n개를 고르게 흩는다 (피보나치 나선).
 * 세로를 눌러 방사형 분출처럼 보이게 한다 — 완전한 공이면 계층이 안 읽힌다.
 */
function spread(n: number): Vec3[] {
  if (n === 0) return []
  if (n === 1) return [{ x: 1, y: 0, z: 0 }]

  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Vec3[] = []

  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    out.push(normalize({ x: Math.cos(theta) * r, y: y * FLATTEN, z: Math.sin(theta) * r }))
  }
  return out
}

/**
 * 기준점에서 "중심의 반대 방향"으로 부챗살처럼 편다.
 * 바깥을 향하므로 안쪽 물체와 겹치지 않는다.
 */
function fanOut(base: Vec3, index: number, count: number, reach: number): Vec3 {
  const outward = length(base) < 1 ? { x: 1, y: 0, z: 0 } : normalize(base)
  const [u, v] = basis(outward)
  const angle = count <= 1 ? 0 : (index / count) * Math.PI * 2
  const wide = count <= 1 ? 0 : 0.78

  const dir = normalize({
    x: outward.x * 0.7 + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * wide,
    y: outward.y * 0.7 + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * wide * FLATTEN,
    z: outward.z * 0.7 + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * wide,
  })

  return add(base, scale(dir, reach))
}

/** 주어진 방향에 수직인 정규직교 두 축 */
function basis(n: Vec3): [Vec3, Vec3] {
  // n과 나란하지 않은 보조 벡터를 골라야 외적이 0이 되지 않는다
  const helper: Vec3 = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const u = normalize(cross(n, helper))
  return [u, normalize(cross(n, u))]
}

/** 핵자를 구 안에 고르게 흩는다 (피보나치 구 배치) */
function packNucleons(protons: number, neutrons: number, radius: number): Nucleon[] {
  const total = protons + neutrons
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Nucleon[] = []

  for (let i = 0; i < total; i++) {
    const y = total === 1 ? 0 : 1 - (i / (total - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    // 껍질에만 붙지 않도록 안쪽으로도 조금씩 당긴다
    const shell = 0.55 + (0.45 * ((i * 7919) % 100)) / 100

    out.push({
      kind: i < protons ? 'proton' : 'neutron',
      position: {
        x: Math.cos(theta) * r * radius * shell,
        y: y * radius * shell,
        z: Math.sin(theta) * r * radius * shell,
      },
    })
  }
  return out
}

function agentBody(
  agent: { id: string; label: string; status: AgentStatus; role: AgentRole },
  parentId: string,
  position: Vec3,
): Body {
  return {
    id: agent.id,
    kind: 'agent',
    parentId,
    label: agent.label,
    statusClass: `status-${agent.status}`,
    status: agent.status,
    role: agent.role,
    position,
  }
}

const makeSpoke = (
  id: string,
  from: Vec3,
  to: Vec3,
  kind: 'agent' | 'tool',
  status: string,
): Spoke => ({
  id,
  from,
  to,
  kind,
  status,
  statusClass: kind === 'agent' ? `status-${status}` : `tool-${status}`,
})

// ------------------------------------------------------------------ 벡터

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s })
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

function normalize(v: Vec3): Vec3 {
  const m = length(v)
  return m < 1e-9 ? { x: 1, y: 0, z: 0 } : { x: v.x / m, y: v.y / m, z: v.z / m }
}

/**
 * three 좌표로의 변환.
 * 모형은 화면 px 단위에 CSS 관례대로 y가 아래로 증가한다.
 * three는 월드 단위에 y가 위로 증가하므로 줄이고 뒤집는다.
 */
export const toThree = (v: Vec3, s: number): [number, number, number] => [v.x * s, -v.y * s, v.z * s]
