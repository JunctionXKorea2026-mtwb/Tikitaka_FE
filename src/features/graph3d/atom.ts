import type { AgentRole } from '../../entities/event'
import type { AgentStatus, RunState } from '../../entities/run'

/**
 * 실행 하나 = 원자 하나.
 *
 *   핵          사용자의 질문
 *   안쪽 오비탈  에이전트들
 *   바깥 오비탈  도구 호출들
 *   격자         오비탈 껍질을 눈에 보이게 하는 측지선 구조
 *   결합선       핵→에이전트, 에이전트→도구
 *   에너지선     에이전트 간 메시지
 *
 * 노드는 껍질 위 아무 데나 뜨지 않고 **격자 꼭짓점에 스냅**된다.
 * 그래야 구조에 박힌 것처럼 보이고, 떠다니는 스티커처럼 보이지 않는다.
 *
 * 도구는 자기 에이전트와 같은 방향의 바깥 껍질에 놓인다 — 결합선이 방사로 뻗는다.
 *
 * 2D(React Flow + ELK)와 달리 좌표를 공유하지 않는다.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface AtomNode {
  id: string
  kind: 'agent' | 'tool'
  parentId: string | null
  label: string
  /** CSS에서 --accent를 잡는 클래스 (status-* / tool-*) */
  statusClass: string
  status: AgentStatus | 'running' | 'ok' | 'error'
  role?: AgentRole
  position: Vec3
  /** 0 = 안쪽 오비탈, 1 = 바깥 오비탈 */
  shell: 0 | 1
}

export interface Link {
  id: string
  from: Vec3
  to: Vec3
  kind: 'agent' | 'tool'
  status: string
}

export interface Pulse {
  id: string
  from: Vec3
  to: Vec3
  active: boolean
  count: number
}

export interface Shell {
  radius: number
  /** 측지선 세분 단계. 클수록 격자가 촘촘하다. */
  detail: number
}

export interface AtomModel {
  rootId: string | null
  rootLabel: string
  rootStatus: string
  rootStatusClass: string
  /** 핵에 붙는 질문 (있으면) */
  question: string
  shells: [Shell, Shell]
  nucleusRadius: number
  nodes: AtomNode[]
  links: Link[]
  pulses: Pulse[]
  extent: number
}

/** 안쪽 오비탈 = 에이전트, 바깥 오비탈 = 도구 */
const SHELLS: [Shell, Shell] = [
  { radius: 150, detail: 2 },
  { radius: 235, detail: 3 },
]

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

export function buildAtom(run: RunState, question = ''): AtomModel {
  const agents = run.agentOrder.map((id) => run.agents[id]).filter((a) => !!a)
  const root = agents.find((a) => !a.parentId)

  const base: AtomModel = {
    rootId: null,
    rootLabel: '',
    rootStatus: '',
    rootStatusClass: '',
    question,
    shells: SHELLS,
    nucleusRadius: 46,
    nodes: [],
    links: [],
    pulses: [],
    extent: SHELLS[1].radius,
  }
  if (!root) return base

  const inner = icosphere(SHELLS[0].radius, SHELLS[0].detail).vertices
  const outer = icosphere(SHELLS[1].radius, SHELLS[1].detail).vertices

  const others = agents.filter((a) => a.id !== root.id)
  const nodes: AtomNode[] = []
  const links: Link[] = []
  const position = new Map<string, Vec3>([[root.id, ORIGIN]])

  // 에이전트를 안쪽 껍질에 고르게 흩고, 가장 가까운 격자 꼭짓점에 스냅한다
  const usedInner = new Set<number>()
  const dirs = spread(others.length)

  others.forEach((agent, i) => {
    const p = snap(inner, dirs[i], usedInner)
    position.set(agent.id, p)
    nodes.push({
      id: agent.id,
      kind: 'agent',
      parentId: null,
      label: agent.label,
      statusClass: `status-${agent.status}`,
      status: agent.status,
      role: agent.role,
      position: p,
      shell: 0,
    })
    links.push({ id: `link-${agent.id}`, from: ORIGIN, to: p, kind: 'agent', status: agent.status })
  })

  // 도구는 자기 에이전트와 같은 방향의 바깥 껍질에 — 결합선이 방사로 이어진다
  const usedOuter = new Set<number>()

  for (const agent of agents) {
    const anchor = position.get(agent.id) ?? ORIGIN
    const outward = length(anchor) < 1 ? { x: 0, y: 1, z: 0 } : normalize(anchor)

    agent.calls.forEach((call, j) => {
      const dir = jitter(outward, j, agent.calls.length)
      const p = snap(outer, dir, usedOuter)
      const id = `tool:${call.callId}`
      position.set(id, p)
      nodes.push({
        id,
        kind: 'tool',
        parentId: agent.id === root.id ? null : agent.id,
        label: call.toolName,
        statusClass: `tool-${call.status}`,
        status: call.status,
        position: p,
        shell: 1,
      })
      links.push({ id: `link-${id}`, from: anchor, to: p, kind: 'tool', status: call.status })
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
    .filter((p) => length(sub(p.to, p.from)) > 1)

  return {
    ...base,
    rootId: root.id,
    rootLabel: root.label,
    rootStatus: root.status,
    rootStatusClass: `status-${root.status}`,
    nodes,
    links,
    pulses,
    extent: SHELLS[1].radius,
  }
}

// ------------------------------------------------------------------ 배치

/** 구면에 n개를 고르게 흩는다 (피보나치 나선) */
function spread(n: number): Vec3[] {
  if (n === 0) return []
  if (n === 1) return [{ x: 0, y: 0, z: 1 }]

  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    out.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r })
  }
  return out
}

/** 같은 방향 주위로 조금씩 벌린다 (한 에이전트의 도구들이 겹치지 않게) */
function jitter(dir: Vec3, index: number, count: number): Vec3 {
  if (count <= 1) return dir
  const helper: Vec3 = Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const u = normalize(cross(dir, helper))
  const v = normalize(cross(dir, u))
  const angle = (index / count) * Math.PI * 2
  const wide = 0.42

  return normalize({
    x: dir.x + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * wide,
    y: dir.y + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * wide,
    z: dir.z + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * wide,
  })
}

/**
 * 방향과 가장 가까운 **아직 안 쓴** 격자 꼭짓점을 고른다.
 * 스냅해야 노드가 격자에 박힌 것처럼 보인다. 중복을 막아야 두 노드가 겹치지 않는다.
 */
function snap(vertices: Vec3[], dir: Vec3, used: Set<number>): Vec3 {
  const d = normalize(dir)
  let best = -1
  let bestDot = -Infinity

  for (let i = 0; i < vertices.length; i++) {
    if (used.has(i)) continue
    const v = vertices[i]
    const m = length(v)
    const dot = (v.x * d.x + v.y * d.y + v.z * d.z) / (m || 1)
    if (dot > bestDot) {
      bestDot = dot
      best = i
    }
  }

  if (best < 0) return scale(d, length(vertices[0] ?? { x: 1, y: 0, z: 0 }))
  used.add(best)
  return vertices[best]
}

// ------------------------------------------------------------------ 측지선 구

export interface Icosphere {
  vertices: Vec3[]
  /** 꼭짓점 인덱스 쌍 */
  edges: [number, number][]
}

const sphereCache = new Map<string, Icosphere>()

/**
 * 정이십면체를 세분해 만든 측지선 구.
 *
 * three의 IcosahedronGeometry는 면마다 꼭짓점을 복제해서 격자 선을 뽑기에 나쁘다.
 * 여기서는 꼭짓점을 공유하도록 직접 만들고, 면에서 유일한 모서리만 추린다.
 */
export function icosphere(radius: number, detail: number): Icosphere {
  const key = `${radius}:${detail}`
  const hit = sphereCache.get(key)
  if (hit) return hit

  const t = (1 + Math.sqrt(5)) / 2
  let vertices: Vec3[] = [
    { x: -1, y: t, z: 0 },
    { x: 1, y: t, z: 0 },
    { x: -1, y: -t, z: 0 },
    { x: 1, y: -t, z: 0 },
    { x: 0, y: -1, z: t },
    { x: 0, y: 1, z: t },
    { x: 0, y: -1, z: -t },
    { x: 0, y: 1, z: -t },
    { x: t, y: 0, z: -1 },
    { x: t, y: 0, z: 1 },
    { x: -t, y: 0, z: -1 },
    { x: -t, y: 0, z: 1 },
  ].map(normalize)

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]

  for (let step = 0; step < detail; step++) {
    const midpoints = new Map<string, number>()

    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      const seen = midpoints.get(key)
      if (seen !== undefined) return seen
      const index = vertices.length
      vertices.push(normalize(add(vertices[a], vertices[b])))
      midpoints.set(key, index)
      return index
    }

    const next: [number, number, number][] = []
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }

  // 면에서 유일한 모서리만 추린다 (한 모서리는 두 면이 공유한다)
  const seen = new Set<string>()
  const edges: [number, number][] = []
  for (const [a, b, c] of faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [number, number][]) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([p, q])
    }
  }

  const result: Icosphere = { vertices: vertices.map((v) => scale(v, radius)), edges }
  sphereCache.set(key, result)
  return result
}

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
  return m < 1e-9 ? { x: 0, y: 1, z: 0 } : { x: v.x / m, y: v.y / m, z: v.z / m }
}

/**
 * three 좌표로의 변환.
 * 모형은 화면 px 단위에 CSS 관례대로 y가 아래로 증가한다.
 * three는 월드 단위에 y가 위로 증가하므로 줄이고 뒤집는다.
 */
export const toThree = (v: Vec3, s: number): [number, number, number] => [v.x * s, -v.y * s, v.z * s]


// ------------------------------------------------------------------ 대화 배치

/** 원자 사이 간격. 바깥 껍질 지름(470px)보다 넉넉해야 겹치지 않는다. */
export const TURN_GAP_X = 620
export const TURN_GAP_Z = 560

export interface TurnNode {
  id: string
  parentId: string | null
}

export interface TurnPlacement {
  id: string
  parentId: string | null
  position: Vec3
  depth: number
}

/**
 * 대화를 3D 공간에 배치한다.
 *
 * 턴은 사슬이 아니라 **숲**이다 — 후속 질문은 부모를 갖고, 새 주제는 뿌리가 된다.
 * 그래서 배치도 트리 레이아웃이어야 한다.
 *
 *   x = 깊이        이어서 물을수록 오른쪽으로 뻗는다
 *   z = 레인        가지와 다른 주제는 안쪽/바깥쪽으로 갈라진다
 *
 * 레인은 후위 순회로 정한다. 잎이 차례로 레인을 하나씩 가져가고,
 * 부모는 자식들의 평균에 놓인다 (고전적인 tidy tree의 축소판).
 */
export function layoutTurns(turns: TurnNode[]): TurnPlacement[] {
  if (turns.length === 0) return []

  const byId = new Map(turns.map((t) => [t.id, t]))
  const children = new Map<string, string[]>()
  const roots: string[] = []

  for (const turn of turns) {
    // 부모가 목록에 없으면 뿌리로 취급한다 (지워진 턴을 가리키는 경우)
    if (turn.parentId && byId.has(turn.parentId)) {
      const list = children.get(turn.parentId) ?? []
      list.push(turn.id)
      children.set(turn.parentId, list)
    } else {
      roots.push(turn.id)
    }
  }

  const lane = new Map<string, number>()
  const depth = new Map<string, number>()
  let nextLane = 0

  const walk = (id: string, d: number): number => {
    depth.set(id, d)
    const kids = children.get(id) ?? []

    if (kids.length === 0) {
      const own = nextLane
      nextLane += 1
      lane.set(id, own)
      return own
    }

    const kidLanes = kids.map((kid) => walk(kid, d + 1))
    const mean = kidLanes.reduce((a, b) => a + b, 0) / kidLanes.length
    lane.set(id, mean)
    return mean
  }

  for (const root of roots) walk(root, 0)

  // 레인 전체를 0 기준으로 가운데 정렬한다
  const lanes = [...lane.values()]
  const center = (Math.min(...lanes) + Math.max(...lanes)) / 2
  const depths = [...depth.values()]
  const centerDepth = (Math.min(...depths) + Math.max(...depths)) / 2

  return turns.map((turn) => ({
    id: turn.id,
    parentId: byId.has(turn.parentId ?? '') ? turn.parentId : null,
    depth: depth.get(turn.id) ?? 0,
    position: {
      x: ((depth.get(turn.id) ?? 0) - centerDepth) * TURN_GAP_X,
      y: 0,
      z: ((lane.get(turn.id) ?? 0) - center) * TURN_GAP_Z,
    },
  }))
}
