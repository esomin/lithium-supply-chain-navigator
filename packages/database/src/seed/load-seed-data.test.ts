import { describe, it, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFromFiles, loadFromPipeline, loadSeedData } from './load-seed-data.js';
import type { SeedDataResult } from '../types.js';
import type { SupplyChainNode, SupplyChainEdge } from '@navigator/shared';

const currentDir = dirname(fileURLToPath(import.meta.url));
// packages/database/src/seed/ → packages/pipeline/data/
const seedDataPath = resolve(currentDir, '..', '..', '..', 'pipeline', 'data');

describe('loadFromFiles', () => {
    let result: SeedDataResult;

    beforeAll(() => {
        result = loadFromFiles({ basePath: seedDataPath });
    });

    it('should load all 17 master nodes', () => {
        expect(result.nodes).toHaveLength(17);
    });

    it('should load nodes with correct types distribution', () => {
        const mines = result.nodes.filter(n => n.type === 'Mine');
        const refineries = result.nodes.filter(n => n.type === 'Refinery');
        const plants = result.nodes.filter(n => n.type === 'Plant');

        expect(mines).toHaveLength(7);
        expect(refineries).toHaveLength(4);
        expect(plants).toHaveLength(6);
    });

    it('should load nodes for target countries', () => {
        const countries = new Set(result.nodes.map(n => n.country));
        expect(countries).toContain('Chile');
        expect(countries).toContain('China');
        expect(countries).toContain('SouthKorea');
        expect(countries).toContain('Australia');
        expect(countries).toContain('Argentina');
        expect(countries).toContain('Poland');
    });

    it('should load nodes with valid coordinates', () => {
        for (const node of result.nodes) {
            expect(node.coordinates.latitude).toBeGreaterThanOrEqual(-90);
            expect(node.coordinates.latitude).toBeLessThanOrEqual(90);
            expect(node.coordinates.longitude).toBeGreaterThanOrEqual(-180);
            expect(node.coordinates.longitude).toBeLessThanOrEqual(180);
        }
    });

    it('should load nodes with metadata including productionCapacity', () => {
        for (const node of result.nodes) {
            expect(node.metadata.productionCapacity).toBeGreaterThan(0);
            expect(node.metadata.capacityUnit).toBeDefined();
        }
    });

    it('should load supply chain edges', () => {
        const supplyEdges = result.edges.filter(e => e.type === 'Supply');
        expect(supplyEdges.length).toBeGreaterThanOrEqual(4);
    });

    it('should load edges with valid structure', () => {
        for (const edge of result.edges) {
            expect(edge.id).toBeDefined();
            expect(edge.sourceNodeId).toBeDefined();
            expect(edge.targetNodeId).toBeDefined();
        }
    });

    it('should have specific master nodes by ID', () => {
        const nodeIds = result.nodes.map(n => n.id);
        expect(nodeIds).toContain('MINE_AU_PILBARA');
        expect(nodeIds).toContain('MINE_AU_GREENBUSHES');
        expect(nodeIds).toContain('MINE_CL_ATACAMA');
        expect(nodeIds).toContain('REF_KR_POSCO_PILBARA');
        expect(nodeIds).toContain('MAT_KR_LG_CHEM');
        expect(nodeIds).toContain('MAT_KR_ECOPRO_BM');
        expect(nodeIds).toContain('MAT_PL_UMICORE');
    });

    it('should report no errors for valid seed data', () => {
        expect(result.errors).toHaveLength(0);
    });

    describe('error handling', () => {
        it('should handle non-existent seed data path gracefully', () => {
            const badResult = loadFromFiles({ basePath: '/non/existent/path' });
            expect(badResult.nodes).toHaveLength(0);
            expect(badResult.edges).toHaveLength(0);
            expect(badResult.errors.length).toBeGreaterThan(0);
        });
    });
});

describe('loadSeedData (호환 함수)', () => {
    it('should work with basePath parameter', () => {
        const result = loadSeedData(seedDataPath);
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should handle invalid path gracefully', () => {
        const result = loadSeedData('/non/existent/path');
        expect(result.nodes).toHaveLength(0);
        expect(result.edges).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('loadFromPipeline', () => {
    it('should convert pipeline output to SeedDataResult', () => {
        const mockNodes: SupplyChainNode[] = [
            {
                id: 'N-01',
                type: 'Mine',
                name: 'Test Mine',
                country: 'Chile',
                coordinates: { latitude: -23.5, longitude: -68.2 },
                metadata: { productionCapacity: 5000, capacityUnit: 'tons_lce' },
                description: '테스트 광산',
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-01'),
            },
        ];
        const mockEdges: SupplyChainEdge[] = [
            {
                id: 'E-01',
                type: 'Supply',
                sourceNodeId: 'R-01',
                targetNodeId: 'N-01',
                attributes: { volume: 1000 },
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-01'),
            },
        ];

        const result = loadFromPipeline({ nodes: mockNodes, edges: mockEdges });

        expect(result.nodes).toHaveLength(1);
        expect(result.edges).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
        expect(result.nodes[0].id).toBe('N-01');
        expect(result.edges[0].id).toBe('E-01');
    });

    it('should create independent copies of the data', () => {
        const nodes: SupplyChainNode[] = [
            {
                id: 'N-01',
                type: 'Mine',
                name: 'Test Mine',
                country: 'Chile',
                coordinates: { latitude: -23.5, longitude: -68.2 },
                metadata: { productionCapacity: 5000, capacityUnit: 'tons_lce' },
                description: '테스트 광산',
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-01'),
            },
        ];

        const result = loadFromPipeline({ nodes, edges: [] });

        // 원본 배열과 독립적인 복사본인지 확인
        expect(result.nodes).not.toBe(nodes);
    });
});
