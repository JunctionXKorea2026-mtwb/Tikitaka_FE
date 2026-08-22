import type { Edge, Node } from '@xyflow/react'
import type { AgentRole } from '../../entities/event'
import type { AgentStatus, RunState } from '../../entities/run'

/**
 * 도메인 상태 → React Flow 그래프.
 *
 * 순수 함수이며 좌표는 넣지 않는다(전부 0,0). 좌표는 layout 단계가 채운다.
 * 이 분리 덕분에 상태가 초당 수십 번 바뀌어도 레이아웃은 위상이 변할 때만 다시 돈다.
 */

export type AgentNodeData = {
  label: string
  role: AgentRole
  status: AgentStatus
  thought?: string
  toolCount: number
  runningTool?: string
  duration?: number
}

export type ToolNodeData = {
  name: string
  status: 'running' | 'ok' | 'error'
}

export type AgentFlowNode = Node<AgentNodeData, 'agent'>
export type ToolFlowNode = Node<ToolNodeData, 'tool'>
export type AppNode = AgentFlowNode | ToolFlowNode

export type MessageEdgeData = {
  count: number
  lastContent: string
  active: boolean
}

export type AppEdge = Edge

export const NODE_SIZE = {
  agent: { width: 210, height: 88 },
  tool: { width: 150, height: 40 },
} as const

/** 메시지가 "방금 흐른" 것으로 볼 시간 창(초). 엣지 애니메이션 on/off 기준. */
const ACTIVE_WINDOW = 2

interface DeriveOptions {
  showTools: boolean
}

export function deriveGraph(
  run: RunState,
  { showTools }: DeriveOptions,
): { nodes: AppNode[]; edges: AppEdge[] } {
  const nodes: AppNode[] = []
  const edges: AppEdge[] = []

  for (const id of run.agentOrder) {
    const agent = run.agents[id]
    if (!agent) continue

    const runningCall = agent.calls.find((c) => c.status === 'running')

    nodes.push({
      id,
      type: 'agent',
      position: { x: 0, y: 0 },
      data: {
        label: agent.label,
        role: agent.role,
        status: agent.status,
        thought: agent.thought,
        toolCount: agent.calls.length,
        runningTool: runningCall?.toolName,
        duration: (agent.finishedAt ?? run.clock) - agent.startedAt,
      },
    })

    // 부모가 자식을 띄운 관계 (실선)
    if (agent.parentId && run.agents[agent.parentId]) {
      edges.push({
        id: `spawn:${agent.parentId}->${id}`,
        source: agent.parentId,
        target: id,
        type: 'spawn',
      })
    }

    if (!showTools) continue

    for (const call of agent.calls) {
      const toolId = `tool:${call.callId}`
      nodes.push({
        id: toolId,
        type: 'tool',
        position: { x: 0, y: 0 },
        data: { name: call.toolName, status: call.status },
      })
      edges.push({
        id: `calls:${call.callId}`,
        source: id,
        target: toolId,
        type: 'tool',
      })
    }
  }

  // 에이전트 간 메시지 (접힌 링크)
  for (const link of Object.values(run.links)) {
    if (!run.agents[link.from] || !run.agents[link.to]) continue
    edges.push({
      id: `msg:${link.id}`,
      source: link.from,
      target: link.to,
      type: 'message',
      data: {
        count: link.count,
        lastContent: link.lastContent,
        active: run.clock - link.lastTs <= ACTIVE_WINDOW,
      } satisfies MessageEdgeData,
    })
  }

  return { nodes, edges }
}

/**
 * 계층을 결정하는 엣지만 골라낸다.
 *
 * 메시지 엣지는 양방향(researcher→orchestrator 응답 등)이라 그래프에 사이클을 만들고,
 * 그대로 넣으면 ELK가 사이클을 끊으면서 부모가 자식 오른쪽으로 밀린다.
 * 배치는 구조(spawn/tool)로만 잡고, 메시지는 그 위에 그린다.
 */
export const isStructural = (edge: AppEdge) => edge.type === 'spawn' || edge.type === 'tool'

/**
 * 위상 서명. 레이아웃에 영향을 주는 것(노드 + 구조 엣지)만 담고
 * 상태(status 등)나 메시지 엣지는 담지 않는다. 이 값이 바뀔 때만 재배치한다.
 */
export function topologySignature(nodes: AppNode[], edges: AppEdge[]): string {
  const structural = edges.filter(isStructural).map((e) => e.id)
  return `${nodes.map((n) => n.id).join(',')}|${structural.join(',')}`
}
