import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSupplyChainStore } from '../store/supply-chain-store';
import { MapView } from '../components/views/MapView';
import { FilterBar } from '../components/common/FilterBar';
import { NodeDetailPanel } from '../components/panels/NodeDetailPanel';
import { AIInsightPanel } from '../components/panels/AIInsightPanel';
import { AppHeader } from '../components/common/AppHeader';
import { RiskScore } from '@navigator/shared/src/types/risk';

/**
 * 2D GIS 지도 뷰 페이지.
 * Deck.gl + MapLibre 기반 세계 지도에 공급망 노드와 물류 경로를 시각화한다.
 * GraphView와 동일한 Zustand 스토어를 공유하여 필터, 선택 노드, 리스크 점수 상태를 동기화한다.
 */
export function MapViewPage() {
    const {
        nodes,
        edges,
        selectedNodeId,
        filters,
        riskScores,
        setNodes,
        setEdges,
        setRiskScores,
        selectNode,
        setLoading,
        isLoading,
        showAIPanel,
        setShowAIPanel,
    } = useSupplyChainStore();

    const [error, setError] = useState<string | null>(null);

    // 백엔드 API에서 그래프 데이터 로딩
    useEffect(() => {
        // 이미 데이터가 로드되어 있으면 재요청 방지
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

    // 리스크 점수 로딩
    useEffect(() => {
        if (nodes.length === 0 || riskScores.length > 0) return;

        const fetchRiskScores = async () => {
            try {
                const response = await fetch('/api/risk/recalculate', { method: 'POST' });
                if (!response.ok) return;
                const scores: RiskScore[] = await response.json();
                setRiskScores(scores);
            } catch {
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

    // 필터링된 노드 계산
    const filteredNodes = useMemo(() => {
        const hasHsCodeFilter = filters.hsCode.length > 0;
        const hasCountryFilter = filters.countries.length > 0;
        const hasHsCodeMatch = hasHsCodeFilter && hsCodeFilteredNodeIds && hsCodeFilteredNodeIds.size > 0;

        return nodes.filter((node) => {
            if (hasHsCodeMatch && !hsCodeFilteredNodeIds.has(node.id)) {
                return false;
            }
            if (hasCountryFilter && !filters.countries.includes(node.country)) {
                return false;
            }
            return true;
        });
    }, [nodes, hsCodeFilteredNodeIds, filters.countries, filters.hsCode]);

    // 필터링된 엣지 (HS 코드 필터 + 양쪽 노드 표시 조건)
    const filteredEdges = useMemo(() => {
        const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
        return edges.filter((edge) => {
            if (!filteredNodeIds.has(edge.sourceNodeId) || !filteredNodeIds.has(edge.targetNodeId)) {
                return false;
            }
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
        },
        [selectNode, selectedNodeId],
    );

    // 패널 닫기 핸들러
    const handleClosePanel = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // 선택된 노드 정보
    const selectedNode = useMemo(
        () => nodes.find((n) => n.id === selectedNodeId),
        [nodes, selectedNodeId],
    );

    // 선택된 노드에 연결된 엣지
    const connectedEdges = useMemo(
        () =>
            selectedNodeId
                ? edges.filter(
                    (e) =>
                        e.sourceNodeId === selectedNodeId ||
                        e.targetNodeId === selectedNodeId,
                )
                : [],
        [edges, selectedNodeId],
    );

    return (
        <div className="w-screen h-screen flex flex-col bg-background text-foreground">
            <AppHeader currentView="map" />

            {/* 필터 컨트롤 바 */}
            <FilterBar
                nodeCount={filteredNodes.length}
                totalNodeCount={nodes.length}
            />

            <main className="flex-1 relative overflow-hidden bg-background">
                {/* 로딩 상태 */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 text-muted-foreground">
                        <p>지도 데이터 로딩 중...</p>
                    </div>
                )}

                {/* 에러 상태 */}
                {error && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-destructive/10 border border-destructive rounded-lg z-10">
                        <span className="text-destructive font-medium">⚠ {error}</span>
                    </div>
                )}

                {/* 2D GIS 지도 렌더러 */}
                {filteredNodes.length > 0 && (
                    <MapView
                        nodes={filteredNodes}
                        edges={filteredEdges}
                        riskScores={riskScoreMap}
                        onNodeClick={handleNodeClick}
                    />
                )}

                {/* 필터 결과 없음 */}
                {!isLoading && nodes.length > 0 && filteredNodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">
                            필터 조건에 맞는 노드가 없습니다.
                        </p>
                    </div>
                )}

                {/* 노드 상세 패널 */}
                {selectedNode && (
                    <NodeDetailPanel
                        node={selectedNode}
                        connectedEdges={connectedEdges}
                        riskScore={riskScoreMap.get(selectedNode.id)}
                        onClose={handleClosePanel}
                    />
                )}

                {/* AI 인사이트 패널 — 항상 렌더링, CSS로 표시/숨김 (채팅 기록 유지) */}
                <div className={showAIPanel ? '' : 'hidden'}>
                    <AIInsightPanel onClose={() => setShowAIPanel(false)} />
                </div>
            </main>
        </div>
    );
}
