import { describe, it, expect, beforeEach } from 'vitest';
import { useSupplyChainStore } from './supply-chain-store';
import type { SupplyChainNode, SupplyChainEdge, RiskScore } from '@navigator/shared';

// 뷰 전환 시 상태 보존 테스트
describe('supply-chain-store - 뷰 전환 시 상태 보존', () => {
    // 각 테스트 전 스토어 초기화
    beforeEach(() => {
        useSupplyChainStore.getState().reset();
    });

    // 테스트용 노드 데이터
    const mockNodes: SupplyChainNode[] = [
        {
            id: 'M-01',
            type: 'Mine',
            name: 'SQM Atacama',
            country: 'Chile',
            coordinates: { latitude: -23.5, longitude: -68.0 },
            description: '리튬 광산',
            metadata: { productionCapacity: 70000, capacityUnit: 'tons_lce' },
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
        },
        {
            id: 'RF-01',
            type: 'Refinery',
            name: 'Ganfeng Xinyu',
            country: 'China',
            coordinates: { latitude: 27.8, longitude: 114.9 },
            description: '리튬 제련소',
            metadata: { productionCapacity: 40000, capacityUnit: 'tons_lce' },
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
        },
    ];

    // 테스트용 엣지 데이터
    const mockEdges: SupplyChainEdge[] = [
        {
            id: 'E-01',
            sourceNodeId: 'M-01',
            targetNodeId: 'RF-01',
            type: 'Supply',
            attributes: { volume: 5000, price: 150000, unitPrice: 30, priceType: 'fob', hsCode: '2825.20' },
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
        },
    ];

    // 테스트용 리스크 점수 데이터
    const mockRiskScores: RiskScore[] = [
        {
            entityId: 'M-01',
            entityType: 'node',
            score: 45,
            factors: [
                { category: 'geopolitical', weight: 0.5, rawValue: 0.3, normalizedValue: 30 },
                { category: 'supply_concentration', weight: 0.5, rawValue: 0.6, normalizedValue: 60 },
            ],
            isHighRisk: false,
            computedAt: new Date('2025-01-01'),
        },
        {
            entityId: 'RF-01',
            entityType: 'node',
            score: 72,
            factors: [
                { category: 'geopolitical', weight: 0.5, rawValue: 0.8, normalizedValue: 80 },
                { category: 'supply_concentration', weight: 0.5, rawValue: 0.64, normalizedValue: 64 },
            ],
            isHighRisk: true,
            computedAt: new Date('2025-01-01'),
        },
    ];

    it('selectedNodeId가 뷰 전환 후에도 유지된다', () => {
        const store = useSupplyChainStore.getState();

        // 노드 선택
        store.selectNode('M-01');
        expect(useSupplyChainStore.getState().selectedNodeId).toBe('M-01');

        // 뷰 전환 시뮬레이션: 스토어 상태 재접근 (Zustand는 전역이므로 유지됨)
        const stateAfterSwitch = useSupplyChainStore.getState();
        expect(stateAfterSwitch.selectedNodeId).toBe('M-01');
    });

    it('filters가 뷰 전환 후에도 유지된다', () => {
        const store = useSupplyChainStore.getState();

        // HS 코드 필터 설정
        store.setFilters({ hsCode: ['2825.20'] });

        // 뷰 전환 시뮬레이션: 스토어 상태 재접근
        const stateAfterSwitch = useSupplyChainStore.getState();
        expect(stateAfterSwitch.filters.hsCode).toEqual(['2825.20']);
    });

    it('riskScores가 뷰 전환 후에도 유지된다', () => {
        const store = useSupplyChainStore.getState();

        // 리스크 점수 설정
        store.setRiskScores(mockRiskScores);
        expect(useSupplyChainStore.getState().riskScores).toHaveLength(2);

        // 뷰 전환 시뮬레이션: 스토어 상태 재접근
        const stateAfterSwitch = useSupplyChainStore.getState();
        expect(stateAfterSwitch.riskScores).toHaveLength(2);
        expect(stateAfterSwitch.riskScores[0].entityId).toBe('M-01');
        expect(stateAfterSwitch.riskScores[1].score).toBe(72);
    });

    it('nodes와 edges가 뷰 전환 후에도 유지된다', () => {
        const store = useSupplyChainStore.getState();

        // 데이터 설정
        store.setNodes(mockNodes);
        store.setEdges(mockEdges);

        // 뷰 전환 시뮬레이션: 스토어 상태 재접근
        const stateAfterSwitch = useSupplyChainStore.getState();
        expect(stateAfterSwitch.nodes).toHaveLength(2);
        expect(stateAfterSwitch.edges).toHaveLength(1);
        expect(stateAfterSwitch.nodes[0].id).toBe('M-01');
    });

    it('복합 상태가 동시에 설정된 후에도 모두 유지된다', () => {
        const store = useSupplyChainStore.getState();

        // 모든 상태를 한 번에 설정 (실제 사용 시나리오)
        store.setNodes(mockNodes);
        store.setEdges(mockEdges);
        store.setRiskScores(mockRiskScores);
        store.selectNode('RF-01');
        store.setFilters({ hsCode: ['2825.20'] });

        // 뷰 전환 시뮬레이션: 모든 상태가 보존되는지 확인
        const state = useSupplyChainStore.getState();
        expect(state.nodes).toHaveLength(2);
        expect(state.edges).toHaveLength(1);
        expect(state.riskScores).toHaveLength(2);
        expect(state.selectedNodeId).toBe('RF-01');
        expect(state.filters.hsCode).toEqual(['2825.20']);
    });

    it('reset 호출 시 riskScores도 함께 초기화된다', () => {
        const store = useSupplyChainStore.getState();

        // 상태 설정
        store.setRiskScores(mockRiskScores);
        store.selectNode('M-01');
        expect(useSupplyChainStore.getState().riskScores).toHaveLength(2);

        // 리셋
        store.reset();
        const state = useSupplyChainStore.getState();
        expect(state.riskScores).toHaveLength(0);
        expect(state.selectedNodeId).toBeNull();
        expect(state.showAIPanel).toBe(false);
    });

    it('showAIPanel 및 toggleAIPanel 상태가 정상 동작하고 뷰 전환 시에도 유지된다', () => {
        const store = useSupplyChainStore.getState();

        expect(store.showAIPanel).toBe(false);

        // setShowAIPanel 테스트
        store.setShowAIPanel(true);
        expect(useSupplyChainStore.getState().showAIPanel).toBe(true);

        // toggleAIPanel 테스트
        store.toggleAIPanel();
        expect(useSupplyChainStore.getState().showAIPanel).toBe(false);

        store.toggleAIPanel();
        expect(useSupplyChainStore.getState().showAIPanel).toBe(true);

        // 뷰 전환 시뮬레이션: 스토어 상태 유지 확인
        const stateAfterSwitch = useSupplyChainStore.getState();
        expect(stateAfterSwitch.showAIPanel).toBe(true);
    });
});
