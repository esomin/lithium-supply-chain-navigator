import { describe, it, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeedData } from './load-seed-data.js';
import type { SeedDataResult } from './load-seed-data.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
// 시드 데이터는 packages/pipeline/data/로 이동됨
const seedDataPath = resolve(currentDir, '..', '..', '..', '..', 'packages', 'pipeline', 'data');

describe('loadSeedData', () => {
    let result: SeedDataResult;

    beforeAll(() => {
        result = loadSeedData(seedDataPath);
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

    it('should load valid edges with supported types', () => {
        expect(result.edges.length).toBeGreaterThan(0);
        const types = new Set(result.edges.map(e => String(e.type)));
        expect(types.has('Supply') || types.has('Ownership') || types.has('Delivery')).toBe(true);
    });

    it('should have all edges referencing existing node IDs', () => {
        const nodeIds = new Set(result.nodes.map(n => n.id));
        for (const edge of result.edges) {
            expect(nodeIds.has(edge.sourceNodeId)).toBe(true);
            expect(nodeIds.has(edge.targetNodeId)).toBe(true);
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
            const badResult = loadSeedData('/non/existent/path');
            expect(badResult.nodes).toHaveLength(0);
            expect(badResult.edges).toHaveLength(0);
            expect(badResult.errors.length).toBeGreaterThan(0);
        });
    });
});
