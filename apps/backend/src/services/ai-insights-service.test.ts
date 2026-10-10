// AI 인사이트 서비스 단위 테스트
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIInsightsService, type GraphContext } from './ai-insights-service.js';
import type { DocumentChunk, SupplyChainNode, SupplyChainEdge } from '@navigator/shared';

// 테스트용 그래프 컨텍스트 생성
function createTestGraphContext(): GraphContext {
    const nodes: SupplyChainNode[] = [
        {
            id: 'M-01',
            type: 'Mine',
            name: 'Atacama Salt Flat Mine',
            country: 'Chile',
            coordinates: { latitude: -23.5, longitude: -68.2 },
            metadata: { productionCapacity: 80000, capacityUnit: 'tons_lce' },
            description: '칠레 아타카마 염호 리튬 광산',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: 'RF-01',
            type: 'Refinery',
            name: 'Ganfeng Lithium Refinery',
            country: 'China',
            coordinates: { latitude: 28.7, longitude: 115.8 },
            metadata: { productionCapacity: 50000, capacityUnit: 'tons' },
            description: '간펑 리튬 정제 공장',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ];

    const edges: SupplyChainEdge[] = [
        {
            id: 'E-01',
            type: 'Supply',
            sourceNodeId: 'M-01',
            targetNodeId: 'RF-01',
            attributes: { volume: 30000, price: 15000000, year: 2024, hsCode: '2836.91' },
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ];

    return { nodes, edges };
}

// 테스트용 문서 청크 생성
function createTestDocumentChunks(): DocumentChunk[] {
    return [
        {
            id: 'chunk-1',
            documentId: 'doc-1',
            content: '2024년 칠레 리튬 생산량은 전년 대비 15% 증가했다.',
            embedding: new Array(1536).fill(0.1),
            metadata: {
                source: 'USGS Mineral Report',
                date: new Date('2024-06-01'),
                documentType: 'technical_report',
            },
        },
        {
            id: 'chunk-2',
            documentId: 'doc-2',
            content: '중국의 리튬 정제 시설은 전 세계 생산량의 65%를 처리한다.',
            embedding: new Array(1536).fill(0.2),
            metadata: {
                source: 'IEA Report',
                date: new Date('2024-03-01'),
                documentType: 'policy',
            },
        },
    ];
}

describe('AIInsightsService', () => {
    let service: AIInsightsService;

    beforeEach(() => {
        // GEMINI_API_KEY가 없으면 모델은 null로 초기화됨
        delete process.env.GEMINI_API_KEY;
        service = new AIInsightsService();
    });

    describe('buildContextPrompt', () => {
        it('그래프 토폴로지와 문서 컨텍스트를 결합한 프롬프트를 생성한다', () => {
            const graphContext = createTestGraphContext();
            const chunks = createTestDocumentChunks();
            const query = '칠레-중국 리튬 공급의 IRA 규제 리스크와 시장 전망은?';

            const prompt = service.buildContextPrompt(graphContext, chunks, query);

            // 시스템 프롬프트에 핵심 요소 포함 확인
            expect(prompt).toContain('Role & Instructions');
            expect(prompt).toContain('Atacama Salt Flat Mine');
            expect(prompt).toContain('Ganfeng Lithium Refinery');
            expect(prompt).toContain('USGS Mineral Report');
            expect(prompt).toContain('IEA Report');
            expect(prompt).toContain(query);
        });

        it('문서 청크가 없으면 "관련 문서가 없습니다" 메시지를 포함한다', () => {
            const graphContext = createTestGraphContext();
            const prompt = service.buildContextPrompt(graphContext, [], '질문');

            expect(prompt).toContain('관련 문서가 없습니다');
        });

        it('그래프 노드가 없으면 "그래프 데이터가 없습니다" 메시지를 포함한다', () => {
            const graphContext: GraphContext = { nodes: [], edges: [] };
            const prompt = service.buildContextPrompt(graphContext, [], '질문');

            expect(prompt).toContain('그래프 데이터가 없습니다');
        });

        it('출처 인용 규칙을 프롬프트에 포함한다', () => {
            const graphContext = createTestGraphContext();
            const prompt = service.buildContextPrompt(graphContext, [], '질문');

            expect(prompt).toContain('[출처: 소스명]');
        });
    });

    describe('generateInsight', () => {
        it('API 키가 없으면 에러를 반환한다', async () => {
            const result = await service.generateInsight(
                'session-1',
                '질문',
                createTestGraphContext(),
                createTestDocumentChunks(),
            );

            expect(result.error).toBeDefined();
            expect(result.error).toContain('API 키');
            expect(result.answer).toBe('');
            expect(result.sessionId).toBe('session-1');
        });

        it('사용자 메시지를 세션 이력에 추가한다', async () => {
            await service.generateInsight(
                'session-2',
                '리튬 공급 현황',
                createTestGraphContext(),
                [],
            );

            const history = service.getSessionHistory('session-2');
            expect(history.length).toBeGreaterThanOrEqual(1);
            expect(history[0].role).toBe('user');
            expect(history[0].content).toBe('리튬 공급 현황');
        });
    });

    describe('getSessionHistory', () => {
        it('존재하지 않는 세션은 빈 배열을 반환한다', () => {
            const history = service.getSessionHistory('nonexistent');
            expect(history).toEqual([]);
        });

        it('세션 이력을 올바르게 반환한다', async () => {
            await service.generateInsight('session-3', '질문1', createTestGraphContext(), []);
            await service.generateInsight('session-3', '질문2', createTestGraphContext(), []);

            const history = service.getSessionHistory('session-3');
            // API 키가 없어 에러 응답이므로 user 메시지만 기록됨
            expect(history.length).toBe(2);
            expect(history[0].content).toBe('질문1');
            expect(history[1].content).toBe('질문2');
        });
    });

    describe('hasSession', () => {
        it('존재하지 않는 세션은 false를 반환한다', () => {
            expect(service.hasSession('nonexistent')).toBe(false);
        });

        it('질의 후 세션이 존재한다', async () => {
            await service.generateInsight('session-4', '질문', createTestGraphContext(), []);
            expect(service.hasSession('session-4')).toBe(true);
        });
    });
});
