import type { XYPosition } from '@xyflow/react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PanelTab = 'result' | 'agent'
export type Dimension = '2d' | '3d'

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
  /** 그래프를 2D(React Flow)로 볼지 3D로 볼지 */
  dimension: Dimension
  /** 사이드바가 열려 있는지. 원자를 클릭하면 열린다. */
  panelOpen: boolean
  /** 사이드바 너비 (px). 드래그로 조절하고 저장된다. */
  panelWidth: number

  select: (id: string | null, intent?: PanelTab) => void
  setTab: (tab: PanelTab) => void
  toggleDimension: () => void
  closePanel: () => void
  setPanelWidth: (width: number) => void
  setResultExpanded: (expanded: boolean) => void
  setPosition: (id: string, pos: XYPosition) => void
  resetPositions: () => void
  toggleTools: () => void
}

export const MIN_PANEL = 300
export const MAX_PANEL = 720

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
  selectedId: null,
  positions: {},
  showTools: true,
  panelTab: 'result',
  resultExpanded: false,
      dimension: '3d',
      panelOpen: false,
      panelWidth: 400,

      /**
       * 노드를 고르는 행위 자체가 "상세를 보겠다"는 뜻이다.
       * 그래서 사이드바를 열고 탭도 같이 넘긴다.
       * 핵(질문)을 고르면 결과, 에이전트를 고르면 그 에이전트 상세.
       */
      select: (selectedId, intent = 'agent') =>
        set(
          selectedId
            ? { selectedId, panelTab: intent, panelOpen: true }
            : { selectedId },
        ),

      setTab: (panelTab) => set({ panelTab }),
      toggleDimension: () => set((s) => ({ dimension: s.dimension === '2d' ? '3d' : '2d' })),
      closePanel: () => set({ panelOpen: false, selectedId: null }),
      setPanelWidth: (width) =>
        set({ panelWidth: Math.max(MIN_PANEL, Math.min(MAX_PANEL, Math.round(width))) }),
      setResultExpanded: (resultExpanded) => set({ resultExpanded }),
      setPosition: (id, pos) => set((s) => ({ positions: { ...s.positions, [id]: pos } })),
      resetPositions: () => set({ positions: {} }),
      toggleTools: () => set((s) => ({ showTools: !s.showTools })),
    }),
    {
      name: 'agent-flow-view',
      // 화면 상태 중 "다음에도 유지되면 좋은 것"만 저장한다.
      // 선택·열림은 매번 새로 시작하는 게 자연스럽다.
      partialize: (s) => ({ panelWidth: s.panelWidth, dimension: s.dimension }),
    },
  ),
)
