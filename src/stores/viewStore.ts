import type { XYPosition } from '@xyflow/react'
import { create } from 'zustand'

export type PanelTab = 'result' | 'agent'

interface ViewStore {
  selectedId: string | null
  /**
   * 사용자가 손으로 끈 노드의 좌표.
   * 자동 레이아웃 결과 위에 덮어씌워지므로, 새 이벤트가 와도 위치가 리셋되지 않는다.
   */
  positions: Record<string, XYPosition>
  /** 툴 호출을 별도 노드로 펼쳐서 보여줄지 */
  showTools: boolean
  /** 우측 패널에서 보고 있는 탭 */
  panelTab: PanelTab
  /** 결과를 캔버스 위 넓은 오버레이로 볼지 */
  resultExpanded: boolean

  select: (id: string | null) => void
  setTab: (tab: PanelTab) => void
  setResultExpanded: (expanded: boolean) => void
  setPosition: (id: string, pos: XYPosition) => void
  resetPositions: () => void
  toggleTools: () => void
}

export const useViewStore = create<ViewStore>((set) => ({
  selectedId: null,
  positions: {},
  showTools: true,
  panelTab: 'result',
  resultExpanded: false,

  // 노드를 고르는 행위 자체가 "상세를 보겠다"는 뜻이므로 탭도 같이 넘긴다
  select: (selectedId) =>
    set(selectedId ? { selectedId, panelTab: 'agent' } : { selectedId }),

  setTab: (panelTab) => set({ panelTab }),
  setResultExpanded: (resultExpanded) => set({ resultExpanded }),
  setPosition: (id, pos) => set((s) => ({ positions: { ...s.positions, [id]: pos } })),
  resetPositions: () => set({ positions: {} }),
  toggleTools: () => set((s) => ({ showTools: !s.showTools })),
}))
