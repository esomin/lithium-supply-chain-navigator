// AI Insight Types (Phase 2 - LLM 기반 인사이트 생성)

/**
 * LLM 인사이트 응답.
 * 그래프 토폴로지 + 문서 컨텍스트 기반으로 생성된 분석 결과.
 */
export interface InsightResponse {
    /** 생성된 인사이트 답변 */
    answer: string;
    /** 출처 인용 목록 */
    citations: Citation[];
    /** 세션 식별자 */
    sessionId: string;
    /** 에러 발생 시 메시지 */
    error?: string;
}

/**
 * 출처 인용 정보.
 * 인사이트 생성에 사용된 데이터 출처를 나타낸다.
 */
export interface Citation {
    /** 출처명 (문서 제목 또는 데이터 포인트 설명) */
    source: string;
    /** 인용된 내용 요약 */
    content: string;
    /** 관련도 점수 (0-1) */
    relevance: number;
    /** 주입 당시의 문서 번호 ([문서 1], [문서 2] 등, 1-based) */
    docIndex?: number;
}

/**
 * 대화 메시지.
 * 세션 내 사용자-어시스턴트 간 대화 이력을 나타낸다.
 */
export interface ChatMessage {
    /** 메시지 역할 */
    role: 'user' | 'assistant';
    /** 메시지 내용 */
    content: string;
    /** 어시스턴트 응답의 출처 인용 */
    citations?: Citation[];
    /** 메시지 생성 시각 */
    timestamp: Date;
}

/**
 * 시뮬레이션 세부 수급 배분 항목.
 */
export interface SimulationAllocationItem {
    rank?: number;
    sourceNode: string; // 신규/대체 공급원 (예: POSCO Pilbara Lithium Solution)
    targetNode?: string; // 공급받는 차질 노드 (예: EcoPro BM Pohang, Hunan Yuneng)
    allocatedVolume?: string | number;
    contributionPercentage?: string | number;
    unit?: string;
    tier?: string;
}

/**
 * AI 질의에 포함되는 현재 화면 시뮬레이션 맥락 페이로드.
 */
export interface SimulationContextPayload {
    scenarioId?: string;
    scenarioName?: string;
    originalDeficitPercentage?: number;
    selectedPlan?: {
        title: string;
        remainingDeficitPercentage?: number;
        totalExtraCostUsd?: number;
        averageExtraLeadTimeDays?: number;
        allocations: SimulationAllocationItem[];
    } | null;
}

/**
 * AI 질의 요청 body.
 */
export interface InsightQueryRequest {
    /** 세션 식별자 (없으면 새 세션 생성) */
    sessionId?: string;
    /** 사용자 질의 */
    query: string;
    /** 현재 화면 시뮬레이션 맥락 (선택 사항) */
    simulationContext?: SimulationContextPayload | null;
}

/**
 * 대체 공급 경로 정보.
 * 시뮬레이션 결과 기반으로 추천된 대안 경로를 나타낸다.
 */
export interface AiAlternativeRoute {
    /** 대안 경로 설명 */
    description: string;
    /** 대안 경로의 노드 ID 목록 */
    path: string[];
    /** 실현 가능성 점수 (0-100) */
    feasibilityScore: number;
    /** 추천 근거 */
    rationale: string;
}

/**
 * 대안 추천 응답.
 * 시뮬레이션 결과 기반 대체 공급 경로 추천 결과를 포함한다.
 */
export interface RecommendationResponse extends InsightResponse {
    /** 대체 공급 경로 목록 */
    alternatives: AiAlternativeRoute[];
}

/**
 * 대안 추천 요청 body.
 */
export interface RecommendationRequest {
    /** 세션 식별자 (없으면 새 세션 생성) */
    sessionId?: string;
    /** 시뮬레이션 시나리오 ID */
    simulationId: string;
}
