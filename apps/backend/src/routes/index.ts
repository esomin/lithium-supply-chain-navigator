// API 라우트 정의
import { Router } from 'express';
import type { Request, Response } from 'express';
import { RiskController } from '../controllers/risk-controller.js';
import { GraphController } from '../controllers/graph-controller.js';
import { SimulationController } from '../controllers/simulation-controller.js';
import { DocumentController } from '../controllers/document-controller.js';
import { TraceabilityController } from '../controllers/traceability-controller.js';
import { AIInsightsController } from '../controllers/ai-insights-controller.js';
import { store, vectorStore, embeddingProvider } from '../store.js';

const router = Router();
const riskController = new RiskController(store);
const graphController = new GraphController(store);
const simulationController = new SimulationController(store);
const traceabilityController = new TraceabilityController(store);

// 문서 인덱싱 컨트롤러 초기화 (싱글톤 공유)
const documentController = new DocumentController(vectorStore, embeddingProvider);

// AI 인사이트 컨트롤러 초기화 (싱글톤 공유)
const aiInsightsController = new AIInsightsController(store, vectorStore, embeddingProvider);

// === 리스크 라우트 ===

/** GET /api/risk/node/:nodeId - 특정 노드의 리스크 점수 조회 */
router.get('/risk/node/:nodeId', (req: Request, res: Response) => {
    const { nodeId } = req.params;
    const result = riskController.getNodeRisk(nodeId);

    if (!result) {
        res.status(404).json({ error: `노드를 찾을 수 없습니다: ${nodeId}`, statusCode: 404 });
        return;
    }

    res.json(result);
});

/** GET /api/risk/edge/:edgeId - 특정 엣지의 리스크 점수 조회 */
router.get('/risk/edge/:edgeId', (req: Request, res: Response) => {
    const { edgeId } = req.params;
    const result = riskController.getEdgeRisk(edgeId);

    if (!result) {
        res.status(404).json({ error: `엣지를 찾을 수 없습니다: ${edgeId}`, statusCode: 404 });
        return;
    }

    res.json(result);
});

/** POST /api/risk/recalculate - 모든 리스크 점수 재계산 */
router.post('/risk/recalculate', (_req: Request, res: Response) => {
    const results = riskController.recalculateAll();
    res.json(results);
});

// === 그래프 라우트 ===

/** GET /api/graph/nodes - 모든 노드 조회 */
router.get('/graph/nodes', (_req: Request, res: Response) => {
    const nodes = graphController.getNodes();
    res.json(nodes);
});

/** GET /api/graph/edges - 모든 엣지 조회 */
router.get('/graph/edges', (_req: Request, res: Response) => {
    const edges = graphController.getEdges();
    res.json(edges);
});

/** GET /api/graph - 전체 그래프 데이터(노드 + 엣지) 조회 */
router.get('/graph', (_req: Request, res: Response) => {
    const graph = graphController.getGraph();
    res.json(graph);
});

// === 시뮬레이션 라우트 ===

/** POST /api/simulation/run - 시뮬레이션 실행 */
router.post('/simulation/run', async (req: Request, res: Response) => {
    const { scenario, criterion } = req.body;

    if (!scenario || !scenario.id || !scenario.disruptions) {
        res.status(400).json({ error: '유효한 시나리오를 제공해야 합니다.', statusCode: 400 });
        return;
    }

    try {
        const result = await simulationController.runSimulation(scenario, criterion);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: '시뮬레이션 실행 중 오류가 발생했습니다.', statusCode: 500 });
    }
});

/** POST /api/simulation/reroute - 대체 경로 최적화 재계산 */
router.post('/simulation/reroute', (req: Request, res: Response) => {
    const { scenarioId, criterion } = req.body;

    if (!scenarioId) {
        res.status(400).json({ error: 'scenarioId가 필요합니다.', statusCode: 400 });
        return;
    }

    const rerouteResults = simulationController.computeReroute(scenarioId, criterion);
    res.json(rerouteResults);
});

/** GET /api/simulation/:id - 시뮬레이션 결과 조회 */
router.get('/simulation/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const result = simulationController.getSimulationResult(id);

    if (!result) {
        res.status(404).json({ error: `시뮬레이션 결과를 찾을 수 없습니다: ${id}`, statusCode: 404 });
        return;
    }

    res.json(result);
});

// === 문서 인덱싱 라우트 (Phase 2) ===

/** POST /api/documents/index - 문서 인덱싱 */
router.post('/documents/index', async (req: Request, res: Response) => {
    const doc = req.body;

    if (!doc || !doc.title || !doc.content || !doc.source || !doc.documentType) {
        res.status(400).json({
            error: '유효한 문서를 제공해야 합니다 (title, content, source, date, documentType 필수).',
            statusCode: 400,
        });
        return;
    }

    try {
        const result = await documentController.indexDocument(doc);
        if (!result.success) {
            res.status(400).json({
                error: '문서 인덱싱에 실패했습니다.',
                statusCode: 400,
                details: result.errors,
            });
            return;
        }
        res.json(result);
    } catch (err) {
        console.error('[documents/index] 예상치 못한 오류:', err);
        res.status(500).json({
            error: '문서 인덱싱 중 오류가 발생했습니다.',
            statusCode: 500,
        });
    }
});

/** POST /api/documents/associate - 청크를 노드와 연관시킨다 */
router.post('/documents/associate', (req: Request, res: Response) => {
    const { chunkIds, nodeId } = req.body;

    if (!chunkIds || !Array.isArray(chunkIds) || chunkIds.length === 0) {
        res.status(400).json({
            error: 'chunkIds는 필수이며 비어있지 않은 문자열 배열이어야 합니다.',
            statusCode: 400,
        });
        return;
    }

    if (!nodeId || typeof nodeId !== 'string' || nodeId.trim().length === 0) {
        res.status(400).json({
            error: 'nodeId는 필수이며 비어있지 않은 문자열이어야 합니다.',
            statusCode: 400,
        });
        return;
    }

    try {
        documentController.associateWithNode(chunkIds, nodeId);
        res.json({ success: true, chunkIds, nodeId });
    } catch (err) {
        console.error('[documents/associate] 예상치 못한 오류:', err);
        res.status(500).json({
            error: '청크-노드 연관 처리 중 오류가 발생했습니다.',
            statusCode: 500,
        });
    }
});

/** POST /api/documents/search - 의미 검색 */
router.post('/documents/search', async (req: Request, res: Response) => {
    const { query, topK } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({
            error: 'query는 필수이며 비어있지 않은 문자열이어야 합니다.',
            statusCode: 400,
        });
        return;
    }

    try {
        const results = await documentController.search(query, topK ?? 5);
        res.json({ results, count: results.length });
    } catch (err) {
        console.error('[documents/search] 예상치 못한 오류:', err);
        res.status(500).json({
            error: '문서 검색 중 오류가 발생했습니다.',
            statusCode: 500,
        });
    }
});

/** GET /api/documents/content - 특정 출처의 전체 문서 원문 조회 */
router.get('/documents/content', async (req: Request, res: Response) => {
    const { source } = req.query;

    if (!source || typeof source !== 'string') {
        res.status(400).json({ error: 'source 쿼리 파라미터가 필요합니다.', statusCode: 400 });
        return;
    }

    try {
        const { resolve, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const { readFileSync, existsSync } = await import('fs');

        const currentDir = dirname(fileURLToPath(import.meta.url));
        const cleanSource = source.replace(/^[./\\]+/, '');
        
        // 탐색 후보 경로 (개발 tsx 환경 및 빌드 dist 환경 대응)
        const candidates = [
            resolve(currentDir, '../../../packages/database/src', cleanSource),
            resolve(currentDir, '../../../../packages/database/src', cleanSource),
            resolve(process.cwd(), 'packages/database/src', cleanSource),
            resolve(process.cwd(), '../../packages/database/src', cleanSource),
        ];

        let targetPath = '';
        for (const cand of candidates) {
            if (existsSync(cand)) {
                targetPath = cand;
                break;
            }
        }

        if (!targetPath) {
            console.warn(`[documents/content] 파일을 찾을 수 없음: ${cleanSource}`, candidates);
            res.status(404).json({ error: `문서 파일을 찾을 수 없습니다: ${cleanSource}`, statusCode: 404 });
            return;
        }

        const content = readFileSync(targetPath, 'utf-8');
        res.json({ source, content });
    } catch (err) {
        console.error('[documents/content] 오류:', err);
        res.status(500).json({ error: '문서 내용을 불러오는 중 오류가 발생했습니다.', statusCode: 500 });
    }
});

// === ESG 역추적 라우트 (Phase 2) ===

/** GET /api/trace/:factoryNodeId - Factory 노드의 ESG 역추적 보고서 조회 */
router.get('/trace/:factoryNodeId', (req: Request, res: Response) => {
    const { factoryNodeId } = req.params;
    const report = traceabilityController.getUpstreamTrace(factoryNodeId);

    if (!report) {
        res.status(404).json({
            error: `Factory 노드를 찾을 수 없습니다: ${factoryNodeId}`,
            statusCode: 404,
        });
        return;
    }

    res.json(report);
});

// === AI 인사이트 라우트 (Phase 2) ===

/** POST /api/insights/query - AI 질의 */
router.post('/insights/query', async (req: Request, res: Response) => {
    const { sessionId, query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({
            error: 'query는 필수이며 비어있지 않은 문자열이어야 합니다.',
            statusCode: 400,
        });
        return;
    }

    // 세션 ID가 없으면 새로 생성
    const resolvedSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
        const result = await aiInsightsController.query(resolvedSessionId, query.trim());
        res.json(result);
    } catch (err) {
        console.error('[insights/query] 예상치 못한 오류:', err);
        res.status(500).json({
            error: '인사이트 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            statusCode: 500,
        });
    }
});

/** POST /api/insights/recommend - 시뮬레이션 결과 기반 대안 추천 */
router.post('/insights/recommend', async (req: Request, res: Response) => {
    const { sessionId, simulationId } = req.body;

    if (!simulationId || typeof simulationId !== 'string' || simulationId.trim().length === 0) {
        res.status(400).json({
            error: 'simulationId는 필수이며 비어있지 않은 문자열이어야 합니다.',
            statusCode: 400,
        });
        return;
    }

    // 시뮬레이션 결과 조회
    const simulationResult = simulationController.getSimulationResult(simulationId.trim());
    if (!simulationResult) {
        res.status(404).json({
            error: `시뮬레이션 결과를 찾을 수 없습니다: ${simulationId}`,
            statusCode: 404,
        });
        return;
    }

    // 세션 ID가 없으면 새로 생성
    const resolvedSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
        const result = await aiInsightsController.recommend(resolvedSessionId, simulationResult);
        res.json(result);
    } catch (err) {
        console.error('[insights/recommend] 예상치 못한 오류:', err);
        res.status(500).json({
            error: '대안 추천 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            statusCode: 500,
        });
    }
});

/** GET /api/insights/session/:id - 세션 내 대화 이력 조회 */
router.get('/insights/session/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    if (!aiInsightsController.hasSession(id)) {
        res.status(404).json({
            error: `세션을 찾을 수 없습니다: ${id}`,
            statusCode: 404,
        });
        return;
    }

    const history = aiInsightsController.getSessionHistory(id);
    res.json({ sessionId: id, messages: history });
});

export { router };
