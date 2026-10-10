// unused
// AI 인사이트 컨트롤러 — 질의 처리, 세션 관리, 대안 추천
import type { DataStore } from '@navigator/database';
import type {
    InsightResponse,
    ChatMessage,
    DocumentChunk,
    VectorStore,
    EmbeddingProvider,
    SimulationResult,
    RecommendationResponse,
    SimulationContextPayload,
} from '@navigator/shared';
import { AIInsightsService, type GraphContext } from '../services/ai-insights-service.js';

/**
 * AI 인사이트 컨트롤러.
 * 사용자 질의를 처리하고 그래프 + 문서 컨텍스트 기반 인사이트를 생성한다.
 * 시뮬레이션 결과 기반 대체 공급 경로 추천을 지원한다.
 */
export class AIInsightsController {
    private readonly service: AIInsightsService;

    constructor(
        private readonly store: DataStore,
        private readonly vectorStore: VectorStore,
        private readonly embeddingProvider: EmbeddingProvider,
    ) {
        this.service = new AIInsightsService();
    }

    /**
     * AI 질의를 처리한다.
     * 그래프 토폴로지와 관련 문서 청크를 수집하여 LLM에 전달한다.
     */
    async query(
        sessionId: string,
        userQuery: string,
        simulationContext?: SimulationContextPayload | null,
    ): Promise<InsightResponse> {
        // 1. 그래프 컨텍스트 수집
        const graphContext: GraphContext = {
            nodes: this.store.getNodes(),
            edges: this.store.getEdges(),
        };

        // 2. 관련 문서 청크 검색 (벡터 유사도 기반)
        let documentChunks: DocumentChunk[] = [];
        try {
            const queryEmbedding = await this.embeddingProvider(userQuery);
            documentChunks = this.vectorStore.search(queryEmbedding, 5);
        } catch (error) {
            console.warn('[AIInsightsController] 문서 검색 실패, 그래프 컨텍스트만 사용합니다:', error);
        }

        // 3. LLM 인사이트 생성
        return this.service.generateInsight(sessionId, userQuery, graphContext, documentChunks, simulationContext);
    }

    /**
     * 시뮬레이션 결과 기반 대체 공급 경로를 추천한다.
     * @param sessionId 세션 식별자
     * @param simulationResult 시뮬레이션 실행 결과
     * @returns 대안 추천 응답 (대체 경로 + 실현 가능성 점수)
     */
    async recommend(sessionId: string, simulationResult: SimulationResult): Promise<RecommendationResponse> {
        // 그래프 컨텍스트 수집
        const graphContext: GraphContext = {
            nodes: this.store.getNodes(),
            edges: this.store.getEdges(),
        };

        // 대안 추천 생성
        return this.service.generateAlternativeRecommendations(sessionId, simulationResult, graphContext);
    }

    /**
     * 세션 대화 이력을 조회한다.
     */
    getSessionHistory(sessionId: string): ChatMessage[] {
        return this.service.getSessionHistory(sessionId);
    }

    /**
     * 세션이 존재하는지 확인한다.
     */
    hasSession(sessionId: string): boolean {
        return this.service.hasSession(sessionId);
    }
}
