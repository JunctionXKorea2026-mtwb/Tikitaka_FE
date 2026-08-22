import type { EdgeTypes } from '@xyflow/react'
import { MessageEdge } from './MessageEdge'
import { SpawnEdge, ToolEdge } from './StructuralEdge'

/** nodeTypes와 같은 이유로 모듈 스코프 상수. */
export const edgeTypes = {
  message: MessageEdge,
  spawn: SpawnEdge,
  tool: ToolEdge,
} satisfies EdgeTypes
