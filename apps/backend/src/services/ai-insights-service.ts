import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerativeModel, GenerateContentResult, Content } from '@google/generative-ai';
import type {
    InsightResponse,
    Citation,
    ChatMessage,
    SupplyChainNode,
    SupplyChainEdge,
    DocumentChunk,
    SimulationResult,
    AiAlternativeRoute,
    RecommendationResponse,
    SimulationContextPayload,
} from '@navigator/shared';

/** 재시도 설정 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/** 대화 이력 최대 턴 수 (토큰 예산 관리) */
const MAX_HISTORY_TURNS = 10;

/** Gemini 모델명 */
const MODEL_NAME = 'gemini-2.5-flash';

/** 캐시 항목 인터페이스 */
interface CachedInsight {
    answer: string;
    citations: Citation[];
    cachedAt: number;
}

/** 캐시 TTL: 24시간 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

/**
 * 그래프 컨텍스트 정보.
 * LLM 프롬프트 구성에 사용되는 공급망 토폴로지 데이터.
 */
export interface GraphContext {
    nodes: SupplyChainNode[];
    edges: SupplyChainEdge[];
}

/**
 * AI 인사이트 서비스.
 * Gemini API를 통해 공급망 분석 인사이트를 생성한다.
 * 멀티턴 대화와 시뮬레이션 기반 대안 추천을 지원하며, 동일 질의에 대해 Exact Match 캐시를 제공한다.
 */
export class AIInsightsService {
    private model: GenerativeModel | null = null;
    private sessions: Map<string, ChatMessage[]> = new Map();
    private queryCache: Map<string, CachedInsight> = new Map();
    private initAttempted = false;

    constructor() {
        // 지연 초기화: 첫 API 호출 시 Gemini 클라이언트를 초기화한다
        // (.env 로딩 시점이 모듈 임포트보다 늦을 수 있으므로)
    }

    /**
     * Gemini 클라이언트를 필요 시 초기화한다 (lazy initialization).
     */
    private ensureInitialized(): void {
        if (this.model !== null) return;
        if (this.initAttempted) return;
        this.initAttempted = true;
        this.initializeGemini();
    }

    /**
     * Gemini 클라이언트를 초기화한다.
     * API 키가 없으면 경고 로그를 남기고 null 상태로 유지한다.
     */
    private initializeGemini(): void {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.warn('[AIInsightsService] GEMINI_API_KEY가 설정되지 않았습니다. LLM 기능을 사용할 수 없습니다.');
            return;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            this.model = genAI.getGenerativeModel({ model: MODEL_NAME });
            console.info('[AIInsightsService] Gemini 모델 초기화 완료.');
        } catch (error) {
            console.error('[AIInsightsService] Gemini 초기화 실패:', error);
            this.model = null;
        }
    }

    /**
     * 세션 대화 이력을 Gemini Content 형식으로 변환한다.
     * 최근 N턴만 포함하여 토큰 예산을 관리한다.
     */
    private buildChatHistory(sessionId: string): Content[] {
        const history = this.sessions.get(sessionId) ?? [];

        // 최근 MAX_HISTORY_TURNS개 메시지만 사용
        const recentHistory = history.slice(-MAX_HISTORY_TURNS);

        return recentHistory.map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));
    }

    /**
     * 질문의 의도(Intent)를 분류한다 (Adaptive Routing).
     */
    classifyIntent(userQuery: string): 'GENERAL_MARKET' | 'GRAPH_TOPOLOGY' | 'REGULATION_POLICY' | 'HYBRID_ANALYSIS' {
        const q = userQuery.toLowerCase();

        // 1. 규제 및 법률 키워드
        if (/ira|feoc|crma|보조금|세액공제|지분|우려기관|우려단체|통상|관세|조약/.test(q)) {
            return 'REGULATION_POLICY';
        }

        // 2. 그래프 토폴로지 키워드 (특정 시설, 물리적 이동 경로)
        if (/경로|플랜트|공장|제련소|정제소|광산|운송|포스코|에코프로|엘지|lg|유미코아|sqm|아타카마|어떻게 들어|어디로/.test(q)) {
            return 'GRAPH_TOPOLOGY';
        }

        // 3. 일반 시장 통계, 기술 개념, 수요/소비 질문
        if (/비중|소비량|전망|시장 규모|소비국|수요|생산량|lfp|ncm|차이|원리|배터리 종류|가격|추이/.test(q)) {
            return 'GENERAL_MARKET';
        }

        return 'HYBRID_ANALYSIS';
    }

    /**
     * 그래프 토폴로지 + 문서 컨텍스트 + 시뮬레이션 맥락을 결합한 적응형(Adaptive) 시스템 프롬프트를 구성한다.
     */
    buildContextPrompt(
        graphContext: GraphContext,
        documentChunks: DocumentChunk[],
        userQuery: string,
        simulationContext?: SimulationContextPayload | null,
    ): string {
        const intent = this.classifyIntent(userQuery);
        console.info(`[Adaptive RAG] 질문 의도 라우팅: ${intent}`);

        // 그래프 요약 (시장 질문일 경우 노이즈 방지를 위해 최소화)
        const graphSummary = intent === 'GENERAL_MARKET' 
            ? '일반 시장 통계 질문이므로 그래프 토폴로지 세부 연결 정보는 생략되었습니다.'
            : this.buildGraphSummary(graphContext);

        // 문서 컨텍스트 (순수 그래프 경로 질문일 경우 규제 문서 노이즈 방지)
        const documentContext = intent === 'GRAPH_TOPOLOGY'
            ? '순수 시설 경로 질문이므로 관련 외부 규제 문서는 생략되었습니다.'
            : this.buildDocumentContext(documentChunks);

        // 시뮬레이션 맥락 텍스트 조립
        let simulationSection = '';
        if (simulationContext) {
            simulationSection = `## [현재 화면 시뮬레이션 분석 데이터]
- **시나리오**: ${simulationContext.scenarioName ?? simulationContext.scenarioId ?? '공급망 차질 시뮬레이션'}
- **원래 공급 부족률**: ${simulationContext.originalDeficitPercentage !== undefined ? simulationContext.originalDeficitPercentage + '%' : '미지정'}
`;
            if (simulationContext.selectedPlan) {
                const plan = simulationContext.selectedPlan;
                simulationSection += `- **선택된 대체 공급망 방안**: ${plan.title} (결손 해소 후 잔여 결손율: ${plan.remainingDeficitPercentage ?? 0}%)
- **대체 공급원(Alternative Source) 수급 배분 현황**:
${plan.allocations.map(a => `  * [${a.rank ? `${a.rank}차 ` : ''}대체 공급처] ${a.sourceNode}: 공급 배분량 ${a.allocatedVolume ?? 'N/A'} (결손 해소 기여도 ${a.contributionPercentage ?? 'N/A'})${a.targetNode ? ` ➔ (차질 대상: ${a.targetNode})` : ''}`).join('\n')}

> [중요 분석 지침]
> - 위 **대체 공급처(POSCO Pilbara, Umicore Cheonan, Pilgangoora 등)**는 결손을 메우기 위해 신규로 투입된 '대체 공급망 노드'입니다.
> - 기존에 차질(결손)을 겪고 있던 다운스트림 수용처(예: EcoPro BM Pohang, Hunan Yuneng 등)와 '대체 공급처'를 절대 혼동하지 마세요.
> - **대체 공급망의 규제(IRA/FEOC) 적격성 및 수급 타당성은 위 '대체 공급처' 노드들을 기준으로 평가해야 합니다.**
`;
            }
        }

        const domainGuardrails = `## [중요 도메인 지식 및 단위 가드레일 (Domain Rules)]
1. **광물 단위 변환 원칙 (SC6 vs LCE)**:
   - 하드락 광산(Mine: Pilgangoora, Greenbushes 등)의 생산 수치는 **스포듀민 정광(Spodumene Concentrate, SC6)** 기준입니다.
   - **스포듀민 7.5~8톤 ➔ 탄산리튬 등가물(LCE) 약 1톤** 생산 수율(약 12.5~13.3%)을 가집니다.
   - 예: Pilgangoora 연산 755,000톤 SC6은 LCE 기준 **약 95,000~100,000톤 LCE**에 해당합니다. 광산의 SC6 생산량을 정제 LCE 통계와 1:1로 단순 비교하여 과대평가하지 마세요.
2. **배터리 밸류체인 3단계 공정 체계**:
   - **Mine (광산)**: 원광 및 스포듀민 정광(SC6) / 염수 채굴
   - **Refinery (제련소/정제소)**: 정광/염수를 배터리급 수산화리튬(LiOH) 및 탄산리튬(Li2CO3) 화합물로 정제
   - **Plant / CAM (양극재 플랜트)**: 정제된 리튬 화합물과 전구체를 결합하여 최종 양극활물질(tons_cathode) 생산
   - (참고: Umicore Cheonan Plant, LG Chem Cheongju, EcoPro BM Pohang, POSCO Future M Gwangyang 등은 정제소가 아닌 **양극재 플랜트(Plant)**입니다)
3. **글로벌 통계 기준 단위 (USGS/IEA: 리튬 순수 원소 함량 vs LCE)**:
   - USGS 등의 2024년 전 세계 리튬 생산량 **약 240,000톤은 순수 리튬 원소(Lithium Content/Metal)** 기준입니다.
   - 이를 배터리 업계 표준인 **탄산리튬 등가물(LCE)로 환산하면 약 127.7만~130만 톤 LCE** (환산 계수 5.323)입니다.
   - 240,000톤(원소 기준)을 LCE로 직접 오인하여 글로벌 생산량 비율을 왜곡(예: 68만 톤이 글로벌의 2.8배라는 식의 계산)하지 말고, LCE 환산 총량(128만 톤)을 분모로 비교하세요.
4. **양극재 플랜트와 정제소 원료 투입비율 (Cathode to LCE/LiOH) 및 수급 타당성 평가**:
   - 양극재(Cathode/CAM) 1톤 생산에는 화학양론적으로 약 **0.45~0.50톤의 정제 리튬 화합물(LCE/LiOH)**이 투입됩니다.
   - 시스템의 최적화 엔진은 정제소(POSCO Pilbara 4.3만톤, Umicore Cheonan 8.0만톤 등)의 연간 생산용량 한도 내에서 여유 가용 캐파를 초과하지 않도록 안전하게 분배합니다.
   - 대체 공급처들의 할당량이 각 정제소의 생산능력 및 광산 캐파 범위 내에 수용 가능한 수준(예: 2만~4만 톤 규모)으로 할당된 경우, **물리적인 공급 능력 및 수급 타당성은 '적합(Feasible)'**으로 명확히 평가하세요.`;

        if (intent === 'GENERAL_MARKET') {
            return `## Role & Instructions
배터리 및 핵심 광물 시장 전문 분석 어시스턴트로서, 최신 글로벌 통계(예: IEA, USGS)와 산업 지식을 바탕으로 명쾌하고 구조화된 답변을 작성하세요.

${domainGuardrails}

## 참조 시장 문서
${documentContext}

## 답변 규칙
1. "분석가로서", "설명해 드리겠습니다"와 같은 자기소개나 불필요한 메타 서두 없이, 첫 문장부터 즉시 핵심 결론과 정량적 데이터로 시작하세요.
2. 배터리 부문 소비 비중, 주요 소비국 순위 등 수치와 통계를 명확하게 제시하세요. (필요 시 마크다운 표나 글머리 기호 활용)
3. 제공된 문서에 특정 세부 수치가 없더라도, 글로벌 시장 전문 지식을 적극 활용하여 완결성 있게 설명하세요.
4. 문서 인용 시 문맥에 맞춰 [1], [2] 또는 [출처: 소스명] 형식의 인덱스 번호로 인라인 표기하세요.

## 사용자 질문
${userQuery}`;
        }

        if (intent === 'GRAPH_TOPOLOGY') {
            return `## Role & Instructions
리튬 공급망 토폴로지 분석 어시스턴트로서, 아래 공급망 그래프 데이터의 실제 연결 관계만을 기반으로 노드 간의 이동 경로를 구체적으로 설명하세요.

${domainGuardrails}

${simulationSection}

## 공급망 그래프 토폴로지
${graphSummary}

## 답변 규칙
1. 서두의 자기소개나 인사말 없이, 첫 문장부터 즉시 출발 광산(Mine) → 중간 정제소(Refinery) → 도착 양극재 플랜트(Plant)의 구체적인 연결 경로로 시작하세요.
2. 각 시설의 공식 명칭, 국가, 생산 용량(Capacity)을 함께 명시하여 정확성을 높이세요.
3. 출처는 [출처: 공급망 그래프 토폴로지]로 표기하세요.

## 사용자 질문
${userQuery}`;
        }

        return `## Role & Instructions
글로벌 통상 규제(IRA/FEOC/CRMA) 및 공급망 컴플라이언스 분석 어시스턴트로서, 공급망 데이터와 관련 규제 문서를 교차 분석하여 전문적인 판단을 제공하세요.

${domainGuardrails}

${simulationSection}

## 공급망 그래프 토폴로지
${graphSummary}

## 관련 규제 및 시장 문서 컨텍스트
${documentContext}

## 답변 규칙
1. 역할 선언이나 장황한 서두 없이, 첫 문장부터 질문에 대한 규제 적격성 및 위험도 판정 결과로 즉시 진입하세요.
2. 화면 시뮬레이션 분석 데이터가 제공된 경우, 시뮬레이션의 노드별 수급 할당량과 기여도를 근거로 수급 타당성을 실무적으로 분석하세요.
3. 광산 정광(SC6)과 정제 화합물(LCE/LiOH)의 단위 수율 차이를 정확히 반영하여 수급 병목 여부를 판단하세요.
4. 문서 인용 시 [1], [2] 또는 [출처: 소스명] 형식의 인덱스 번호로 인라인 표기하세요.
5. 불확실하거나 해석의 여지가 있는 부분은 유의사항으로 명시하세요.

## 사용자 질문
${userQuery}`;
    }

    /**
     * 질문 문자열을 정규화한다 (공백 정리, 소문자화, 불필요한 특수문자 정리).
     */
    private normalizeQuery(query: string): string {
        return query
            .trim()
            .toLowerCase()
            .replace(/[\s\t\r\n]+/g, ' ')
            .replace(/[?!.,~;:]+/g, '');
    }

    /**
     * 질문 정규화 기반 SHA-256 캐시 키를 생성한다.
     */
    private computeCacheKey(normalizedQuery: string, simulationContext?: SimulationContextPayload | null): string {
        const raw = simulationContext 
            ? `${normalizedQuery}::${JSON.stringify(simulationContext)}` 
            : normalizedQuery;
        return createHash('sha256').update(raw).digest('hex');
    }

    /**
     * 인사이트를 생성한다.
     * 그래프 컨텍스트와 문서 청크를 결합하여 LLM에 질의한다.
     * 단독 질의(이전 대화가 없는 경우) 시 동일 질문에 대한 Exact Match 캐시를 우선 반환한다.
     * 멀티턴 대화를 지원하기 위해 세션 이력을 Gemini chat에 전달한다.
     */
    async generateInsight(
        sessionId: string,
        userQuery: string,
        graphContext: GraphContext,
        documentChunks: DocumentChunk[],
        simulationContext?: SimulationContextPayload | null,
    ): Promise<InsightResponse> {
        const startTime = Date.now();
        console.info(`[LLM] 요청 시작 | session=${sessionId} | query="${userQuery.substring(0, 80)}"`);
        console.info(`[LLM] 컨텍스트 | nodes=${graphContext.nodes.length} edges=${graphContext.edges.length} docs=${documentChunks.length} sim=${!!simulationContext}`);

        // 세션 이력 조회 또는 생성
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, []);
        }
        const history = this.sessions.get(sessionId)!;

        // Exact Match 캐시 검사: 세션에 이전 대화 이력이 없는 첫 질문이거나 반복 질문일 때 캐시 확인
        const normalized = this.normalizeQuery(userQuery);
        const cacheKey = this.computeCacheKey(normalized, simulationContext);
        const cached = this.queryCache.get(cacheKey);

        // 캐시된 데이터가 있고, 문서 청크가 0개가 아니었던 유효 응답일 때만 반환
        if (cached && cached.citations.length > 0 && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            console.info(`[LLM] ⚡ Exact Match 캐시 적중 (Cache Hit) | key=${cacheKey.substring(0, 10)}... | ${Date.now() - startTime}ms`);

            // 사용자 메시지 기록
            history.push({
                role: 'user',
                content: userQuery,
                timestamp: new Date(),
            });

            // 어시스턴트 메시지 기록
            history.push({
                role: 'assistant',
                content: cached.answer,
                citations: cached.citations,
                timestamp: new Date(),
            });

            return {
                answer: cached.answer,
                citations: cached.citations,
                sessionId,
            };
        }

        // 사용자 메시지 기록
        history.push({
            role: 'user',
            content: userQuery,
            timestamp: new Date(),
        });

        // 지연 초기화 시도
        this.ensureInitialized();

        // 모델 미초기화 시 에러 반환
        if (!this.model) {
            console.warn(`[LLM] 실패 | 모델 미초기화 | ${Date.now() - startTime}ms`);
            return {
                answer: '',
                citations: [],
                sessionId,
                error: 'LLM 서비스를 사용할 수 없습니다. API 키를 확인해 주세요.',
            };
        }

        // 프롬프트 구성
        const prompt = this.buildContextPrompt(graphContext, documentChunks, userQuery, simulationContext);
        console.info(`[LLM] 프롬프트 생성 | 길이=${prompt.length}자 (~${Math.round(prompt.length / 4)}토큰)`);

        // 멀티턴 대화: 이전 이력을 Gemini chat 모드로 전달
        const historyTurns = Math.floor(history.length / 2);
        console.info(`[LLM] API 호출 | mode=${historyTurns > 0 ? 'chat' : 'single'} | history=${historyTurns}턴`);

        let result: GenerateContentResult;
        try {
            result = await this.callWithChatHistory(sessionId, prompt);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            console.error(`[LLM] API 오류 | ${errorMessage} | ${Date.now() - startTime}ms`);

            return {
                answer: '',
                citations: [],
                sessionId,
                error: `인사이트 생성에 실패했습니다: ${errorMessage}. 잠시 후 다시 시도해 주세요.`,
            };
        }

        // 응답 텍스트 추출
        const rawResponseText = result.response.text();

        // 출처 인용 추출 및 본문 인용 번호 정규화 ([1], [2], [3]... 순차 동기화)
        const { citations, normalizedResponseText: responseText } = this.extractCitations(
            rawResponseText,
            documentChunks,
            graphContext,
        );

        const elapsed = Date.now() - startTime;
        console.info(`[LLM] 응답 완료 | ${elapsed}ms | 답변=${responseText.length}자 | 인용=${citations.length}건`);

        // 캐시 저장 (LRU 용량 관리)
        if (this.queryCache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = this.queryCache.keys().next().value;
            if (oldestKey) this.queryCache.delete(oldestKey);
        }
        this.queryCache.set(cacheKey, {
            answer: responseText,
            citations,
            cachedAt: Date.now(),
        });

        // 어시스턴트 메시지 기록
        history.push({
            role: 'assistant',
            content: responseText,
            citations,
            timestamp: new Date(),
        });

        return {
            answer: responseText,
            citations,
            sessionId,
        };
    }

    /**
     * 시뮬레이션 결과 기반 대체 공급 경로를 추천한다.
     * 교란 영향 분석 후 대안 경로와 실현 가능성 점수를 생성한다.
     */
    async generateAlternativeRecommendations(
        sessionId: string,
        simulationResult: SimulationResult,
        graphContext: GraphContext,
    ): Promise<RecommendationResponse> {
        // 세션 이력 조회 또는 생성
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, []);
        }
        const history = this.sessions.get(sessionId)!;

        // 시뮬레이션 분석 요청 메시지 기록
        const userMessage = `시뮬레이션 결과(시나리오: ${simulationResult.scenarioId})를 분석하여 대체 공급 경로를 추천해 주세요.`;
        history.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
        });

        // 지연 초기화 시도
        this.ensureInitialized();

        // 모델 미초기화 시 에러 반환
        if (!this.model) {
            return {
                answer: '',
                citations: [],
                sessionId,
                alternatives: [],
                error: 'LLM 서비스를 사용할 수 없습니다. API 키를 확인해 주세요.',
            };
        }

        // 시뮬레이션 결과 기반 프롬프트 구성
        const prompt = this.buildRecommendationPrompt(simulationResult, graphContext);

        // 멀티턴 대화 지원 API 호출
        let result: GenerateContentResult;
        try {
            result = await this.callWithChatHistory(sessionId, prompt);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            console.error('[AIInsightsService] 대안 추천 API 호출 실패:', errorMessage);

            return {
                answer: '',
                citations: [],
                sessionId,
                alternatives: [],
                error: `대안 추천 생성에 실패했습니다: ${errorMessage}. 잠시 후 다시 시도해 주세요.`,
            };
        }

        // 응답 텍스트 추출
        const responseText = result.response.text();

        // 대안 경로 파싱
        const alternatives = this.parseAlternatives(responseText, graphContext);

        // 출처 인용 (시뮬레이션 데이터 기반)
        const citations: Citation[] = [
            {
                source: `시뮬레이션 결과 (${simulationResult.scenarioId})`,
                content: `${simulationResult.propagationPaths.length}개 전파 경로, ${simulationResult.deficits.length}개 노드 공급 결손 분석`,
                relevance: 1.0,
            },
            {
                source: '공급망 그래프 데이터',
                content: `${graphContext.nodes.length}개 노드, ${graphContext.edges.length}개 엣지 기반 대안 분석`,
                relevance: 0.9,
            },
        ];

        // 어시스턴트 메시지 기록
        history.push({
            role: 'assistant',
            content: responseText,
            citations,
            timestamp: new Date(),
        });

        return {
            answer: responseText,
            citations,
            sessionId,
            alternatives,
        };
    }

    /**
     * 세션 대화 이력을 조회한다.
     */
    getSessionHistory(sessionId: string): ChatMessage[] {
        return this.sessions.get(sessionId) ?? [];
    }

    /**
     * 세션이 존재하는지 확인한다.
     */
    hasSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * 세션 대화 이력을 포함하여 Gemini chat 모드로 호출한다.
     * 이전 대화 컨텍스트를 유지하여 멀티턴 질의를 지원한다.
     */
    private async callWithChatHistory(sessionId: string, prompt: string): Promise<GenerateContentResult> {
        // 이전 대화 이력을 Gemini 형식으로 변환 (현재 턴 제외)
        const chatHistory = this.buildChatHistory(sessionId);

        // 이력이 2개 이상이면 chat 모드 사용 (직전 사용자+어시스턴트 쌍 존재)
        if (chatHistory.length >= 2) {
            // 마지막 user 메시지는 sendMessage로 전달하므로 이력에서 제외
            const historyForChat = chatHistory.slice(0, -1);

            const chat = this.model!.startChat({ history: historyForChat });
            return this.callChatWithRetry(chat, prompt);
        }

        // 이력이 없으면 단순 generateContent 호출
        return this.callWithRetry(prompt);
    }

    /**
     * 재시도 로직이 포함된 Gemini chat.sendMessage 호출.
     */
    private async callChatWithRetry(
        chat: ReturnType<GenerativeModel['startChat']>,
        message: string,
    ): Promise<GenerateContentResult> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const result = await chat.sendMessage(message);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(
                    `[AIInsightsService] Chat API 호출 실패 (${attempt + 1}/${MAX_RETRIES}):`,
                    lastError.message,
                );

                if (attempt < MAX_RETRIES - 1) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError ?? new Error('최대 재시도 횟수를 초과했습니다.');
    }

    /**
     * 재시도 로직이 포함된 Gemini API 호출.
     * 최대 3회 재시도 (exponential backoff: 1s, 2s, 4s).
     */
    private async callWithRetry(prompt: string): Promise<GenerateContentResult> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const result = await this.model!.generateContent(prompt);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(
                    `[AIInsightsService] API 호출 실패 (${attempt + 1}/${MAX_RETRIES}):`,
                    lastError.message,
                );

                // 마지막 시도가 아니면 대기 후 재시도
                if (attempt < MAX_RETRIES - 1) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError ?? new Error('최대 재시도 횟수를 초과했습니다.');
    }

    /**
     * 시뮬레이션 결과 기반 대안 추천 프롬프트를 구성한다.
     */
    private buildRecommendationPrompt(simulationResult: SimulationResult, graphContext: GraphContext): string {
        const { nodes, edges } = graphContext;

        // 영향 받은 노드 파악
        const affectedNodeIds = new Set<string>();
        for (const path of simulationResult.propagationPaths) {
            for (const nodeId of path.nodes) {
                affectedNodeIds.add(nodeId);
            }
        }

        // 영향 받은 노드 정보
        const affectedNodes = nodes.filter(n => affectedNodeIds.has(n.id));
        const unaffectedNodes = nodes.filter(n => !affectedNodeIds.has(n.id));

        // 공급 결손 정보
        const deficitSummary = simulationResult.deficits
            .map(d => {
                const node = nodes.find(n => n.id === d.nodeId);
                return `- ${node?.name ?? d.nodeId}: 원래 공급 ${d.originalSupply} → 교란 후 ${d.disruptedSupply} (결손 ${d.deficitPercentage.toFixed(1)}%)`;
            })
            .join('\n');

        // 전파 경로 정보
        const pathSummary = simulationResult.propagationPaths
            .map((p, i) => {
                const nodeNames = p.nodes.map(id => nodes.find(n => n.id === id)?.name ?? id);
                return `경로 ${i + 1}: ${nodeNames.join(' → ')}`;
            })
            .join('\n');

        // 대안 후보 노드 목록
        const alternativeNodesSummary = unaffectedNodes
            .map(n => `- ${n.name} (${n.id}): ${n.country}, 유형: ${n.type}, 생산능력: ${n.metadata.productionCapacity} ${n.metadata.capacityUnit}`)
            .join('\n');

        // 기존 연결 관계
        const edgeSummary = edges.slice(0, 30)
            .map(e => {
                const src = nodes.find(n => n.id === e.sourceNodeId);
                const tgt = nodes.find(n => n.id === e.targetNodeId);
                const volume = e.attributes.volume ? ` (${e.attributes.volume} kg)` : '';
                return `- ${src?.name ?? e.sourceNodeId} → ${tgt?.name ?? e.targetNodeId}${volume}`;
            })
            .join('\n');

        return `당신은 리튬 공급망 리스크 관리 전문가입니다. 아래 시뮬레이션 결과를 분석하고 대체 공급 경로를 추천하세요.

## 시뮬레이션 결과 (시나리오: ${simulationResult.scenarioId})

### 전파 경로
${pathSummary || '전파 경로 없음'}

### 공급 결손
${deficitSummary || '결손 없음'}

### 영향 받은 노드 (${affectedNodes.length}개)
${affectedNodes.map(n => `- ${n.name} (${n.id}): ${n.country}`).join('\n') || '없음'}

## 대안 후보 (영향 없는 노드)
${alternativeNodesSummary || '없음'}

## 기존 공급 관계
${edgeSummary}

## 답변 형식
아래 JSON 형식으로 대체 공급 경로를 3개 이내로 추천하세요. 반드시 아래 JSON 블록을 응답에 포함하세요:

\`\`\`json
[
  {
    "description": "대안 경로 설명",
    "path": ["노드ID1", "노드ID2", "노드ID3"],
    "feasibilityScore": 75,
    "rationale": "추천 근거"
  }
]
\`\`\`

추천 시 다음을 고려하세요:
1. 영향 받지 않은 노드를 활용한 우회 경로
2. 각 대안의 생산 능력 대비 수요 충족 가능성
3. 지리적 다양성과 공급원 분산 효과
4. 기존 인프라(엣지)를 최대한 활용하는 현실적 대안

JSON 블록 아래에 각 대안에 대한 상세 분석도 포함하세요.`;
    }

    /**
     * LLM 응답에서 대안 경로를 파싱한다.
     * JSON 블록에서 구조화된 대안 정보를 추출한다.
     */
    private parseAlternatives(responseText: string, graphContext: GraphContext): AiAlternativeRoute[] {
        try {
            // JSON 코드 블록에서 배열 추출
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                // 코드 블록 없이 JSON 배열이 직접 포함된 경우
                const arrayMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
                if (!arrayMatch) {
                    return this.generateFallbackAlternatives(graphContext);
                }
                return this.validateAlternatives(JSON.parse(arrayMatch[0]));
            }

            const parsed = JSON.parse(jsonMatch[1]);
            return this.validateAlternatives(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (error) {
            console.warn('[AIInsightsService] 대안 경로 파싱 실패, 폴백 생성:', error);
            return this.generateFallbackAlternatives(graphContext);
        }
    }

    /**
     * 파싱된 대안 데이터를 검증하고 정규화한다.
     */
    private validateAlternatives(raw: unknown[]): AiAlternativeRoute[] {
        return raw
            .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
            .map(item => ({
                description: typeof item.description === 'string' ? item.description : '대안 경로',
                path: Array.isArray(item.path) ? item.path.filter((p): p is string => typeof p === 'string') : [],
                feasibilityScore: typeof item.feasibilityScore === 'number'
                    ? Math.max(0, Math.min(100, item.feasibilityScore))
                    : 50,
                rationale: typeof item.rationale === 'string' ? item.rationale : '',
            }))
            .slice(0, 5); // 최대 5개까지만 반환
    }

    /**
     * LLM 응답 파싱 실패 시 그래프 데이터 기반 폴백 대안을 생성한다.
     */
    private generateFallbackAlternatives(graphContext: GraphContext): AiAlternativeRoute[] {
        const { nodes } = graphContext;

        // 가용한 노드 중 생산능력이 있는 노드를 대안으로 제시
        const producers = nodes.filter(n =>
            n.type === 'Mine' || n.type === 'Refinery' || n.type === 'Factory'
        );

        if (producers.length === 0) return [];

        return producers.slice(0, 2).map(node => ({
            description: `${node.name}을(를) 통한 대체 공급 경로`,
            path: [node.id],
            feasibilityScore: 50,
            rationale: `${node.country} 소재 ${node.type} 노드로 대체 공급 가능성 검토 필요`,
        }));
    }

    /**
     * 그래프 토폴로지 요약 문자열을 생성한다.
     */
    private buildGraphSummary(graphContext: GraphContext): string {
        const { nodes, edges } = graphContext;

        if (nodes.length === 0) {
            return '그래프 데이터가 없습니다.';
        }

        // 노드 유형별 그룹핑
        const nodesByType = new Map<string, SupplyChainNode[]>();
        for (const node of nodes) {
            const group = nodesByType.get(node.type) ?? [];
            group.push(node);
            nodesByType.set(node.type, group);
        }

        let summary = `총 ${nodes.length}개 노드, ${edges.length}개 엣지\n\n`;

        for (const [type, typeNodes] of nodesByType) {
            summary += `### ${type} 노드 (${typeNodes.length}개)\n`;
            for (const node of typeNodes) {
                summary += `- ${node.name} (${node.id}): ${node.country}, 생산능력 ${node.metadata.productionCapacity} ${node.metadata.capacityUnit}\n`;
            }
            summary += '\n';
        }

        // 엣지(공급 관계) 요약
        summary += `### 공급 관계\n`;
        for (const edge of edges.slice(0, 20)) { // 최대 20개까지만 포함
            const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
            const targetNode = nodes.find(n => n.id === edge.targetNodeId);
            const volume = edge.attributes.volume ? ` (${edge.attributes.volume} kg)` : '';
            summary += `- ${sourceNode?.name ?? edge.sourceNodeId} → ${targetNode?.name ?? edge.targetNodeId}${volume}\n`;
        }

        if (edges.length > 20) {
            summary += `- ... 외 ${edges.length - 20}개 관계\n`;
        }

        return summary;
    }

    /**
     * 문서 컨텍스트 문자열을 생성한다.
     */
    private buildDocumentContext(documentChunks: DocumentChunk[]): string {
        if (documentChunks.length === 0) {
            return '관련 문서가 없습니다.';
        }

        let context = '';
        for (let i = 0; i < documentChunks.length; i++) {
            const chunk = documentChunks[i];
            context += `[${i + 1}] 출처: ${chunk.metadata.source}, 유형: ${chunk.metadata.documentType}\n`;
            context += `${chunk.content}\n\n`;
        }

        return context;
    }

    /**
     * LLM 응답에서 출처 인용을 추출하고, 본문의 인용 번호([N])를 실제 인용된 문서 순서([1], [2], ...)로 정규화한다.
     * 1) [문서 1], [1] 등의 문서 인덱스 번호 기반 동적 매핑
     * 2) [출처: ...] 명칭 및 본문 내 문서명/출처명 출현 기반 동적 매핑
     * 3) 실제 인용된 문서들만 모아 [1], [2], [3]... 순차 번호로 본문 텍스트와 citation.docIndex를 1:1 동기화
     */
    private extractCitations(
        responseText: string,
        documentChunks: DocumentChunk[],
        graphContext: GraphContext,
    ): { citations: Citation[]; normalizedResponseText: string } {
        // 1. [문서 1], [문서 2], [1], [2] 인덱스 패턴 추출
        const docIndexMatches = [...responseText.matchAll(/\[(?:문서\s*)?(\d+)\]/g)];
        const citedRawIndices = new Set<number>();
        for (const match of docIndexMatches) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num >= 1 && num <= documentChunks.length) {
                citedRawIndices.add(num); // 1-based (주입 당시 번호)
            }
        }

        // 2. [출처: ...] 명시적 대괄호 패턴 추출
        const citationPattern = /\[(?:출처:\s*)?([^\]]+)\]/g;
        const citedNames: string[] = [];
        let nameMatch: RegExpExecArray | null;

        while ((nameMatch = citationPattern.exec(responseText)) !== null) {
            const text = nameMatch[1].trim().toLowerCase();
            if (text && !text.startsWith('문서') && !/^\d+$/.test(text)) {
                citedNames.push(text);
            }
        }

        // 3. DocumentChunk 순회하며 인용된 청크 식별
        const matchedChunks: { chunk: DocumentChunk; originalIndex: number }[] = [];
        const addedSources = new Set<string>();

        for (let i = 0; i < documentChunks.length; i++) {
            const chunk = documentChunks[i];
            const originalIndex = i + 1;
            const source = chunk.metadata.source;
            const docType = chunk.metadata.documentType;

            // 파일명에서 확장자를 뗀 순수 이름 및 단어 토큰 분리
            const baseFilename = source.split('/').pop()?.replace(/\.[^/.]+$/, '').toLowerCase() || '';
            const sourceTokens = baseFilename.split(/[-_\s.]+/).filter(t => t.length >= 2);

            // A. 번호 기반 인용 매칭 ([문서 1], [1])
            const isIndexMatched = citedRawIndices.has(originalIndex);

            // B. 명시적 출처명 매칭
            const isNameMatched = citedNames.some(cited => {
                return cited.includes(baseFilename) || 
                    baseFilename.includes(cited) ||
                    sourceTokens.some(token => cited.includes(token));
            });

            // C. 본문 텍스트 내 원본 파일명 직접 언급 여부
            const isContentMentioned = responseText.includes(source) || 
                (docType && responseText.includes(docType));

            if ((isIndexMatched || isNameMatched || isContentMentioned) && !addedSources.has(source)) {
                addedSources.add(source);
                matchedChunks.push({ chunk, originalIndex });
            }
        }

        // 4. 인용된 문서들을 citations 목록에 추가 (원래 주입된 번호 originalIndex를 docIndex로 유지)
        const citations: Citation[] = [];

        matchedChunks.forEach((item) => {
            citations.push({
                source: item.chunk.metadata.source,
                content: item.chunk.content.substring(0, 200), // 요약용 200자
                relevance: 1.0,
                docIndex: item.originalIndex,
            });
        });

        // 5. 그래프 데이터 인용 (명시적으로 [공급망...] 등을 인용했거나, 본문에 [공급망 토폴로지] 또는 노드/생산능력 분석이 포함된 경우)
        const isGraphMentioned = citedNames.some(name => 
            name.includes('공급망') || name.includes('그래프') || name.includes('토폴로지') || name.includes('네트워크')
        ) || responseText.includes('공급망 토폴로지') || responseText.includes('공급망') || responseText.includes('생산능력');

        if (graphContext.nodes.length > 0 && isGraphMentioned) {
            citations.push({
                source: '공급망 그래프 토폴로지',
                content: `${graphContext.nodes.length}개 노드, ${graphContext.edges.length}개 엣지 실시간 연결망 분석`,
                relevance: 1.0,
            });
        }

        // docIndex가 있는 항목들을 번호 순으로 정렬 (번호 없는 그래프 등은 마지막에 위치)
        citations.sort((a, b) => {
            if (a.docIndex !== undefined && b.docIndex !== undefined) return a.docIndex - b.docIndex;
            if (a.docIndex !== undefined) return -1;
            if (b.docIndex !== undefined) return 1;
            return 0;
        });

        return { citations, normalizedResponseText: responseText };
    }

    /**
     * 지정된 시간(ms) 동안 대기한다.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
