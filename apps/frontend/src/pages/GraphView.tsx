import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSupplyChainStore } from '../store/supply-chain-store';
import { useSimulationStore } from '../store/simulation-store';
import { GraphRenderer } from '../components/views/GraphRenderer';
import { FilterBar } from '../components/common/FilterBar';
import { NodeDetailPanel } from '../components/panels/NodeDetailPanel';
import { TraceabilityPanel } from '../components/panels/TraceabilityPanel';
import { SimulationPanel } from '../components/simulation/SimulationPanel';
import { AIInsightPanel } from '../components/panels/AIInsightPanel';
import { Play, Pause, Cuboid } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { AppHeader } from '../components/common/AppHeader';
// 공급망 그래프 시각화 페이지 (Phase 1 메인 뷰)
export function GraphView() {
    const { nodes, edges, selectedNodeId, filters, riskScores, setNodes, setEdges, setRiskScores, selectNode, setLoading, isLoading } =
        useSupplyChainStore();

    // 시뮬레이션 결과 및 실행 상태 가져오기
    const { highlightedPath, isRunning, isRerouteApplied, activeRerouteOptions } = useSimulationStore((state) => ({
        highlightedPath: state.highlightedPath,
        isRunning: state.isRunning,
        isRerouteApplied: state.isRerouteApplied,
        activeRerouteOptions: state.activeRerouteOptions,
    }));

    const [error, setError] = useState<string | null>(null);
    // ESG 역추적 패널 표시 상태
    const [showTraceability, setShowTraceability] = useState(false);
    // AI 인사이트 패널 표시 상태
    const [showAIPanel, setShowAIPanel] = useState(false);
    // 시뮬레이션 패널 표시 상태
    const [showSimulation, setShowSimulation] = useState(false);

    // 시뮬레이션 패널이 열릴 때 토스트 메시지 표시
    useEffect(() => {
        if (showSimulation) {
            toast('시뮬레이션 모드 활성화됨', {
                description: '영향 경로의 누락 없는 시각화를 위해 모든 국가 및 품목 필터가 자동으로 전체 활성화되었습니다.',
            });
        }
    }, [showSimulation]);

    // 백엔드 API에서 그래프 데이터 로딩 (이미 로드된 경우 건너뛰기 - 뷰 전환 시 재요청 방지)
    useEffect(() => {
        if (nodes.length > 0) return;

        const fetchGraphData = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch('/api/graph');
                if (!response.ok) throw new Error(`API 에러: ${response.status}`);
                const data = await response.json();

                // Date 문자열을 Date 객체로 변환
                const parsedNodes = (data.nodes || []).map((n: Record<string, unknown>) => ({
                    ...n,
                    createdAt: new Date(n.createdAt as string),
                    updatedAt: new Date(n.updatedAt as string),
                }));
                const parsedEdges = (data.edges || []).map((e: Record<string, unknown>) => ({
                    ...e,
                    createdAt: new Date(e.createdAt as string),
                    updatedAt: new Date(e.updatedAt as string),
                }));

                setNodes(parsedNodes);
                setEdges(parsedEdges);
            } catch (err) {
                setError(err instanceof Error ? err.message : '데이터 로딩 실패');
            } finally {
                setLoading(false);
            }
        };

        fetchGraphData();
    }, [nodes.length, setNodes, setEdges, setLoading]);

    // 리스크 점수 로딩 (그래프 데이터 로딩 후, 이미 로드된 경우 건너뛰기)
    useEffect(() => {
        if (nodes.length === 0) return;
        if (riskScores.length > 0) return;

        const fetchRiskScores = async () => {
            try {
                const response = await fetch('/api/risk/recalculate', { method: 'POST' });
                if (!response.ok) return;
                const scores = await response.json();
                setRiskScores(scores);
            } catch {
                // 리스크 점수 실패 시 기본값(0)으로 렌더링
                console.warn('리스크 점수 로딩 실패 - 기본값 사용');
            }
        };

        fetchRiskScores();
    }, [nodes, riskScores.length, setRiskScores]);

    // 리스크 점수를 nodeId → score Map으로 변환
    const riskScoreMap = useMemo(() => {
        const map = new Map<string, number>();
        riskScores
            .filter((rs) => rs.entityType === 'node')
            .forEach((rs) => map.set(rs.entityId, rs.score));
        return map;
    }, [riskScores]);

    // HS 코드 필터 적용 시 해당 엣지에 연결된 노드 ID 집합 계산
    const hsCodeFilteredNodeIds = useMemo(() => {
        const nodeIds = new Set<string>();
        for (const edge of edges) {
            const hsCode = edge.attributes?.hsCode;
            if (!hsCode || filters.hsCode.includes(hsCode) || filters.hsCode.length === 0) {
                nodeIds.add(edge.sourceNodeId);
                nodeIds.add(edge.targetNodeId);
            }
        }
        return nodeIds;
    }, [edges, filters.hsCode]);

    // 필터링된 노드 계산 (200ms 이내 업데이트를 위해 useMemo 활용)
    const filteredNodes = useMemo(() => {
        const hasHsCodeFilter = filters.hsCode.length > 0;
        const hasCountryFilter = filters.countries.length > 0;
        const hasHsCodeMatch = hasHsCodeFilter && hsCodeFilteredNodeIds && hsCodeFilteredNodeIds.size > 0;

        return nodes.filter((node) => {
            // 우회 수급 시각화 적용 시: 관련 노드는 필터에 구애받지 않고 항상 노출 보장
            if (isRerouteApplied && activeRerouteOptions) {
                const isInReroute = activeRerouteOptions.some((r) =>
                    r.targetNodeId === node.id ||
                    r.plans?.some((p) => p.options.some((o) => o.sourceNodeId === node.id || o.targetNodeId === node.id))
                );
                if (isInReroute) return true;
            }

            // HS 코드 필터 적용
            if (hasHsCodeMatch && !hsCodeFilteredNodeIds.has(node.id)) {
                return false;
            }
            // 국가 필터 적용
            if (hasCountryFilter && !filters.countries.includes(node.country)) {
                return false;
            }
            return true;
        });
    }, [nodes, hsCodeFilteredNodeIds, filters.countries, filters.hsCode, isRerouteApplied, activeRerouteOptions]);

    // 필터링된 노드에 연결된 엣지만 포함 + HS 코드 필터 적용
    const filteredEdges = useMemo(() => {
        const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
        return edges.filter((edge) => {
            // 양쪽 노드가 모두 표시되는 경우만 포함
            if (!filteredNodeIds.has(edge.sourceNodeId) || !filteredNodeIds.has(edge.targetNodeId)) {
                return false;
            }
            // HS 코드 필터 적용 (hsCode 속성이 있는 경우에만 선택된 HS 코드 비교)
            const hsCode = edge.attributes?.hsCode;
            if (hsCode && filters.hsCode.length > 0 && !filters.hsCode.includes(hsCode)) {
                return false;
            }
            return true;
        });
    }, [edges, filteredNodes, filters.hsCode]);

    // 노드 클릭 핸들러
    const handleNodeClick = useCallback(
        (nodeId: string | null) => {
            selectNode(nodeId === selectedNodeId ? null : nodeId);
            // 다른 노드 선택 시 역추적 패널 닫기
            setShowTraceability(false);
        },
        [selectNode, selectedNodeId],
    );

    // 패널 닫기 핸들러
    const handleClosePanel = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // ESG 역추적 패널 열기 핸들러
    const handleOpenTraceability = useCallback(() => {
        setShowTraceability(true);
    }, []);

    // ESG 역추적 패널 닫기 핸들러
    const handleCloseTraceability = useCallback(() => {
        setShowTraceability(false);
    }, []);

    // 선택된 노드 정보
    const selectedNode = useMemo(
        () => nodes.find((n) => n.id === selectedNodeId),
        [nodes, selectedNodeId],
    );

    // 선택된 노드에 연결된 엣지 (필터가 적용된 엣지 목록을 바탕으로 매핑)
    const connectedEdges = useMemo(
        () =>
            selectedNodeId
                ? filteredEdges.filter(
                    (e) =>
                        e.sourceNodeId === selectedNodeId ||
                        e.targetNodeId === selectedNodeId,
                )
                : [],
        [filteredEdges, selectedNodeId],
    );

    return (
        <div className="w-screen h-screen flex flex-col bg-background text-foreground">
            <AppHeader
                currentView="graph"
                actions={
                    <Button
                        id="tour-sim-button"
                        onClick={() => setShowSimulation(!showSimulation)}
                        variant={showSimulation ? "outline" : "default"}
                        className={`font-semibold shadow-md flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer rounded-md px-3.5 py-1.5 text-xs h-[32px] ${
                            showSimulation
                                ? 'bg-muted text-foreground border border-border hover:bg-muted/80'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                        aria-label={showSimulation ? "충격 시뮬레이션 패널 닫기" : "충격 시뮬레이션 패널 열기"}
                        aria-pressed={showSimulation}
                    >
                        {showSimulation ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        충격 시뮬레이션
                    </Button>
                }
            />

            {/* 필터 컨트롤 바 (상시 렌더링으로 레이아웃 시프트 방지, 시뮬레이션 중에는 disabled 처리) */}
            <FilterBar
                nodeCount={filteredNodes.length}
                totalNodeCount={nodes.length}
                disabled={showSimulation}
            />

            <main className="flex-1 relative overflow-hidden bg-background">
                {/* 로딩 상태 */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 text-muted-foreground">
                        <p>그래프 데이터 로딩 중...</p>
                    </div>
                )}

                {/* 에러 상태 */}
                {error && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-destructive/10 border border-destructive rounded-lg z-10">
                        <span className="text-destructive font-medium">⚠ {error}</span>
                    </div>
                )}

                {/* 그래프 렌더러 — 필터링된 노드/엣지 및 시뮬레이션 토글 핸들러 전달 */}
                {filteredNodes.length > 0 && (
                    <GraphRenderer
                        nodes={filteredNodes}
                        edges={filteredEdges}
                        riskScores={riskScoreMap}
                        onNodeClick={handleNodeClick}
                        highlightedPath={highlightedPath}
                        isSimulationOpen={showSimulation}
                        onToggleSimulation={() => setShowSimulation(!showSimulation)}
                    />
                )}

                {/* 필터 결과 없음 표시 */}
                {!isLoading && nodes.length > 0 && filteredNodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">
                            필터 조건에 맞는 노드가 없습니다.
                        </p>
                    </div>
                )}

                {/* 노드 상세 패널 */}
                {selectedNode && !showTraceability && (
                    <NodeDetailPanel
                        node={selectedNode}
                        connectedEdges={connectedEdges}
                        riskScore={riskScoreMap.get(selectedNode.id)}
                        onClose={handleClosePanel}
                        onOpenTraceability={selectedNode.type === 'Factory' ? handleOpenTraceability : undefined}
                    />
                )}

                {/* ESG 역추적 패널 */}
                {selectedNode && showTraceability && selectedNode.type === 'Factory' && (
                    <TraceabilityPanel
                        factoryNodeId={selectedNode.id}
                        factoryName={selectedNode.name}
                        onClose={handleCloseTraceability}
                    />
                )}

                {/* AI 인사이트 패널 — 항상 렌더링, CSS로 표시/숨김 (채팅 기록 유지) */}
                <div className={showAIPanel ? '' : 'hidden'}>
                    <AIInsightPanel onClose={() => setShowAIPanel(false)} />
                </div>

                {/* 시뮬레이션 제어 패널 */}
                {showSimulation && <SimulationPanel />}

                {/* 범례 */}
                <div
                    className="absolute bottom-4 left-4 bg-muted/80 border border-border text-foreground rounded-lg p-3 text-xs shadow-lg z-[5] pointer-events-auto backdrop-blur-md"
                    aria-label="그래프 범례"
                >
                    <div className="font-bold mb-1 text-foreground">국가</div>
                    <div className="flex gap-2 flex-wrap mb-2 text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(0,188,212,0.8)]" />{' '}
                            한국
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(93,52,14,0.8)]" />{' '}
                            중국
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(0,57,166,0.8)]" />{' '}
                            칠레
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(123,104,238,0.8)]" />{' '}
                            미국
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(255,105,180,0.8)]" />{' '}
                            일본
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(117,190,233,0.8)]" />{' '}
                            아르헨티나
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[rgba(255,193,7,0.8)]" />{' '}
                            호주
                        </span>
                    </div>
                    <div className="font-bold mb-1 text-foreground">노드 타입</div>
                    <div className="flex gap-2 flex-wrap mb-2 text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/30 text-[9px] font-bold text-foreground">M</span>{' '}
                            광산
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/30 text-[9px] font-bold text-foreground">R</span>{' '}
                            제련소
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/30 text-[9px] font-bold text-foreground">F</span>{' '}
                            공장
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-flex items-center justify-center px-1 h-4 rounded-full bg-muted-foreground/30 text-[8px] font-bold text-foreground">RES</span>{' '}
                            자원
                        </span>
                    </div>
                    <div className="font-bold mb-1 text-foreground">리스크</div>
                    <div className="flex gap-2 text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[#b7eb8f]" />{' '}
                            저위험
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[#ffc95e]" />{' '}
                            중위험
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-full bg-[#ffa39e]" />{' '}
                            고위험
                        </span>
                    </div>
                </div>
            </main>
        </div>
    );
}
