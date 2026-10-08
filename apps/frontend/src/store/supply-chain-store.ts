import { create } from 'zustand';
import type { SupplyChainNode, SupplyChainEdge, RiskScore } from '@navigator/shared';

// HS 코드 필터 옵션
export type HsCodeFilter = string[];

// 그래프 필터 상태
export interface GraphFilters {
    hsCode: HsCodeFilter;
    countries: string[];
}

// 공급망 그래프 전역 상태
export interface SupplyChainState {
    // 그래프 데이터
    nodes: SupplyChainNode[];
    edges: SupplyChainEdge[];

    // 리스크 점수 (뷰 전환 시 상태 보존을 위해 전역 관리)
    riskScores: RiskScore[];

    // UI 상태
    selectedNodeId: string | null;
    filters: GraphFilters;
    isLoading: boolean;
    zoomLevel: number;
    showAIPanel: boolean;
    pendingAIQuery: string | null;

    // 액션
    setNodes: (nodes: SupplyChainNode[]) => void;
    setEdges: (edges: SupplyChainEdge[]) => void;
    setRiskScores: (riskScores: RiskScore[]) => void;
    selectNode: (nodeId: string | null) => void;
    setFilters: (filters: Partial<GraphFilters>) => void;
    setLoading: (isLoading: boolean) => void;
    setZoomLevel: (zoomLevel: number) => void;
    setShowAIPanel: (show: boolean) => void;
    toggleAIPanel: () => void;
    triggerAIQuery: (query: string) => void;
    clearPendingAIQuery: () => void;
    reset: () => void;
}

// 초기 필터 상태
const initialFilters: GraphFilters = {
    hsCode: ['2530.90', '2836.91', '2825.20'],
    countries: ['SouthKorea', 'China', 'Chile', 'Argentina', 'Australia', 'Poland'],
};

// Zustand 스토어 생성 - 공급망 그래프 상태 관리
export const useSupplyChainStore = create<SupplyChainState>((set) => ({
    // 초기 상태
    nodes: [],
    edges: [],
    riskScores: [],
    selectedNodeId: null,
    filters: initialFilters,
    isLoading: false,
    zoomLevel: 1.0,
    showAIPanel: false,
    pendingAIQuery: null,

    // 노드 데이터 설정
    setNodes: (nodes) => set({ nodes }),

    // 엣지 데이터 설정
    setEdges: (edges) => set({ edges }),

    // 리스크 점수 설정 (뷰 전환 시에도 유지됨)
    setRiskScores: (riskScores) => set({ riskScores }),

    // 노드 선택/해제
    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    // 필터 업데이트 (부분 업데이트 지원)
    setFilters: (newFilters) =>
        set((state) => ({
            filters: { ...state.filters, ...newFilters },
        })),

    // 로딩 상태 설정
    setLoading: (isLoading) => set({ isLoading }),

    // 줌 레벨 설정
    setZoomLevel: (zoomLevel) => set({ zoomLevel }),

    // AI 인사이트 패널 표시 제어
    setShowAIPanel: (showAIPanel) => set({ showAIPanel }),
    toggleAIPanel: () => set((state) => ({ showAIPanel: !state.showAIPanel })),

    // 외부에서 AI 패널 열기 및 질의 트리거
    triggerAIQuery: (query) => set({ showAIPanel: true, pendingAIQuery: query }),
    clearPendingAIQuery: () => set({ pendingAIQuery: null }),

    // 상태 초기화
    reset: () =>
        set({
            nodes: [],
            edges: [],
            riskScores: [],
            selectedNodeId: null,
            filters: initialFilters,
            isLoading: false,
            zoomLevel: 1.0,
            showAIPanel: false,
            pendingAIQuery: null,
        }),
}));
