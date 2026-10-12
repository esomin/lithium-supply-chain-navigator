import { describe, it, expect, beforeAll } from 'vitest';
import { store } from './store.js';
import { loadSeedData } from '@navigator/database';

describe('서버 시작 시 시드 데이터 초기화', () => {
    beforeAll(() => {
        // 서버 startServer() 호출 시 실행되는 초기화 로직을 시뮬레이션
        const seedResult = loadSeedData();
        store.loadSeedData(seedResult);
    });

    it('InMemoryStore에 17개 마스터 노드가 로딩되어야 한다', () => {
        const nodes = store.getNodes();
        expect(nodes).toHaveLength(17);
    });

    it('InMemoryStore에 엣지 데이터가 로딩되어야 한다', () => {
        const edges = store.getEdges();
        expect(edges.length).toBeGreaterThan(0);
    });

    it('노드 ID로 개별 노드를 조회할 수 있어야 한다', () => {
        const node = store.getNodeById('MINE_AU_PILBARA');
        expect(node).toBeDefined();
        expect(node!.type).toBe('Mine');
        expect(node!.name).toBe('Pilbara Minerals Pilgangoora');
    });

    it('엣지 ID로 개별 엣지를 조회할 수 있어야 한다', () => {
        const edges = store.getEdges();
        expect(edges.length).toBeGreaterThan(0);

        const firstEdge = edges[0];
        const found = store.getEdgeById(firstEdge.id);
        expect(found).toBeDefined();
        expect(found!.id).toBe(firstEdge.id);
    });

    it('특정 노드의 인바운드 엣지를 조회할 수 있어야 한다', () => {
        const inboundEdges = store.getInboundEdges('REF_KR_POSCO_PILBARA');
        expect(inboundEdges.length).toBeGreaterThanOrEqual(1);
        expect(inboundEdges.some(e => e.sourceNodeId === 'MINE_AU_PILBARA')).toBe(true);
    });

    it('DataStore 인터페이스를 통해 노체 타입이 포함되어야 한다', () => {
        const nodes = store.getNodes();
        const types = new Set(nodes.map(n => n.type));
        expect(types).toContain('Mine');
        expect(types).toContain('Refinery');
        expect(types).toContain('Plant');
    });

    it('대상 국가의 노드가 존재해야 한다', () => {
        const nodes = store.getNodes();
        const countries = new Set(nodes.map(n => n.country));
        expect(countries).toContain('Chile');
        expect(countries).toContain('China');
        expect(countries).toContain('SouthKorea');
        expect(countries).toContain('Australia');
        expect(countries).toContain('Argentina');
        expect(countries).toContain('Poland');
    });
});
