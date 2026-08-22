import type { NodeTypes } from '@xyflow/react'
import { AgentNode } from './AgentNode'
import { ToolNode } from './ToolNode'

/** 모듈 스코프 상수여야 한다. 인라인 객체로 넘기면 매 렌더마다 전체 노드가 재마운트된다. */
export const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
} satisfies NodeTypes
