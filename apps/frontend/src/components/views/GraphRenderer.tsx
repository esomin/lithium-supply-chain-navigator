import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Graph } from '@antv/g6';
import type { SupplyChainNode, SupplyChainEdge } from '@navigator/shared';
import { getNodeRadius, getCountryColor, getNodeTypeColor, getRiskColor } from '../../utils/graph-helpers';
import { useLODClustering } from '../../hooks/useLODClustering';
import type { ClusterResult } from '../../utils/clustering';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { useSimulationStore } from '../../store/simulation-store';
import { Play, Pause } from 'lucide-react';
import { Button } from '../ui/button';

export type ColorMode = 'country' | 'nodeType' | 'risk';

export interface GraphRendererProps {
    nodes: SupplyChainNode[];
    edges: SupplyChainEdge[];
    riskScores: Map<string, number>;
    onNodeClick?: (nodeId: string | null) => void;
    highlightedPath?: {
        nodeIds: string[];
        edgeIds: string[];
    } | null;
    isSimulationOpen?: boolean;
    onToggleSimulation?: () => void;
}

export function GraphRenderer({
    nodes,
    edges,
    riskScores,
    onNodeClick,
    highlightedPath,
    isSimulationOpen,
    onToggleSimulation,
}: GraphRendererProps) {
    // 보기 기준 (색상 표현 기준) 선택 상태 ('country' | 'nodeType' | 'risk') - 디폴트: 'nodeType'
    const [colorMode, setColorMode] = useState<ColorMode>('nodeType');

    // 복잡도 감소를 위해 'Resource' 노드 및 관련 엣지 필터링
    const filteredNodes = useMemo(() => nodes.filter((n) => n.type !== 'Resource'), [nodes]);
    const filteredEdges = useMemo(() => {
        const resourceNodeIds = new Set(nodes.filter((n) => n.type === 'Resource').map((n) => n.id));
        return edges.filter((e) => !resourceNodeIds.has(e.sourceNodeId) && !resourceNodeIds.has(e.targetNodeId));
    }, [nodes, edges]);

    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<Graph | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1.2);
    // 클러스터링 토글 버튼 상태 — 버튼으로만 제어
    const [clusteringEnabled, setClusteringEnabled] = useState(false);
    // 그래프의 비동기 render가 완료되었는지 여부
    const [isGraphReady, setIsGraphReady] = useState(false);

    // 스토어에서 선택된 노드 및 우회 경로 상태 조회
    const { selectedNodeId } = useSupplyChainStore();
    const { activeRerouteOptions, isRerouteApplied, selectedPlanNumber } = useSimulationStore((state) => ({
        activeRerouteOptions: state.activeRerouteOptions,
        isRerouteApplied: state.isRerouteApplied,
        selectedPlanNumber: state.selectedPlanNumber,
    }));

    // 노드 클릭 핸들러를 ref로 보관 (리렌더링 방지)
    const onNodeClickRef = useRef(onNodeClick);
    onNodeClickRef.current = onNodeClick;

    // LOD 클러스터링 (Web Worker 기반) — enabled = 버튼 state 및 시뮬레이션 상태 기준 제어
    const { lodResult, isClustered } = useLODClustering({
        nodes: filteredNodes,
        riskScores,
        enabled: isSimulationOpen ? false : clusteringEnabled,
    });

    // G6 데이터 형식으로 변환 (LOD 클러스터링 및 보기 기준 적용)
    const buildGraphData = useCallback(() => {
        // 클러스터링이 활성화된 경우: 클러스터 + 개별 노드 혼합
        if (isClustered && lodResult) {
            const g6Nodes = [];

            // 클러스터 노드 생성
            for (const cluster of lodResult.clusters) {
                g6Nodes.push(buildClusterNode(cluster, colorMode));
            }

            // 개별 표시 노드
            for (const nodeId of lodResult.visibleNodes) {
                const node = filteredNodes.find((n) => n.id === nodeId);
                if (node) {
                    g6Nodes.push(buildRegularNode(node, riskScores, colorMode));
                }
            }

            // 클러스터 간 및 클러스터-노드 간 엣지 생성
            const g6Edges = buildClusteredEdges(filteredEdges, lodResult, filteredNodes);

            return { nodes: g6Nodes, edges: g6Edges };
        }

        // 클러스터링 비활성: 모든 노드 개별 렌더링
        let g6Nodes = filteredNodes.map((node) => buildRegularNode(node, riskScores, colorMode));

        const g6Edges = filteredEdges.map((edge) => ({
            id: edge.id,
            source: edge.sourceNodeId,
            target: edge.targetNodeId,
            data: {
                edgeType: edge.type,
                volume: edge.attributes?.volume,
            },
        }));

        // 우회 경로 시각화 적용 시 초록색 점선 엣지 및 타겟 노드 테두리 상태 갱신 (선택된 1/2/3안 반영)
        if (isRerouteApplied && activeRerouteOptions && activeRerouteOptions.length > 0) {
            const realNodeResults = activeRerouteOptions.filter((r) => !r.isGlobalCombined);
            const targetsToProcess = realNodeResults.length > 0 ? realNodeResults : activeRerouteOptions;

            const resolvedTargetNodeIds = new Set<string>();

            targetsToProcess.forEach((nodeResult) => {
                const plans = nodeResult.plans || [];
                const planIndex = (selectedPlanNumber >= 1 && selectedPlanNumber <= plans.length) ? selectedPlanNumber - 1 : 0;
                const currentPlanOptions = plans[planIndex]?.options || plans[0]?.options || [];

                currentPlanOptions.forEach((opt) => {
                    if (opt.sourceNodeId && opt.targetNodeId && opt.targetNodeId !== 'GLOBAL_TOTAL') {
                        const sourceExists = g6Nodes.some((n) => n.id === opt.sourceNodeId);
                        const targetExists = g6Nodes.some((n) => n.id === opt.targetNodeId);

                        if (sourceExists && targetExists) {
                            const rerouteEdgeId = opt.suggestedEdgeId || `REROUTE-${opt.sourceNodeId}-${opt.targetNodeId}`;
                            if (!g6Edges.some((e) => e.id === rerouteEdgeId)) {
                                g6Edges.push({
                                    id: rerouteEdgeId,
                                    source: opt.sourceNodeId,
                                    target: opt.targetNodeId,
                                    style: {
                                        stroke: '#52c41a',
                                        lineWidth: 3,
                                        lineDash: [6, 4],
                                        endArrow: true,
                                        endArrowSize: 8,
                                    },
                                    data: {
                                        isRerouteEdge: true,
                                        rank: opt.rank,
                                    },
                                } as any);
                            }
                        }
                    }
                });

                const remainingDeficit = plans[planIndex]?.remainingDeficitPercentage ?? nodeResult.remainingDeficitPercentage;
                if (remainingDeficit === 0 && nodeResult.targetNodeId !== 'GLOBAL_TOTAL') {
                    resolvedTargetNodeIds.add(nodeResult.targetNodeId);
                }
            });

            // 결손 해소 시 타겟 노드 테두리 색상 정상화 (#52c41a)
            if (resolvedTargetNodeIds.size > 0) {
                g6Nodes = g6Nodes.map((n) => {
                    if (resolvedTargetNodeIds.has(n.id)) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                stroke: '#52c41a',
                                strokeWidth: 4,
                            },
                        };
                    }
                    return n;
                });
            }
        }

        return { nodes: g6Nodes, edges: g6Edges };
    }, [filteredNodes, filteredEdges, riskScores, isClustered, lodResult, colorMode, isRerouteApplied, activeRerouteOptions, selectedPlanNumber]);

    // 초기 렌더 완료 여부 — afterrender에서 불필요한 재렌더 방지
    const isInitialRenderRef = useRef(true);

    // G6 그래프 인스턴스 초기화 (노드/엣지 원본 데이터 변경 시만 재생성)
    useEffect(() => {
        if (!containerRef.current || filteredNodes.length === 0) return;

        // 기존 그래프 정리
        if (graphRef.current) {
            graphRef.current.destroy();
            graphRef.current = null;
        }

        isInitialRenderRef.current = true;
        setIsGraphReady(false);
        const container = containerRef.current;
        const data = buildGraphData();

        const graph = new Graph({
            container,
            autoResize: true,
            // Force-directed 레이아웃 (고립 노드 튕김 방지 구심력 적용)
            layout: {
                type: 'd3-force',
                preventOverlap: true,
                linkDistance: 180,
                nodeStrength: -1600,
                x: {
                    strength: 0.1,
                },
                y: {
                    strength: 0.1,
                },
                collide: {
                    strength: 1.0,
                    radius: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        const size = (nodeData?.size as number) || 30;
                        return size / 2 + 35; // 노드 반지름 + 텍스트 여백 35px 충돌 방지
                    },
                },
            },
            // 노드 스타일 매핑 — data 속성 기반 동적 스타일
            // 클러스터 노드: 원(circle), 일반 노드: 원(circle)
            node: {
                type: 'circle',
                style: {
                    size: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.size as number) || 30;
                    },
                    fill: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.color as string) || '#91d5ff';
                    },
                    stroke: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.stroke as string) || '#096dd9';
                    },
                    lineWidth: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.strokeWidth as number) || 2;
                    },
                    // 클러스터 정사각형: 실선 테두리, 일반 노드: 점선 없음
                    lineDash: () => [0, 0],
                    // 기본 불투명도 명시 (채우기색 은은한 투명도 0.85)
                    opacity: 1.0,
                    fillOpacity: 0.85,
                    strokeOpacity: 0.9,
                    labelText: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.label as string) || '';
                    },
                    labelFontSize: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.isCluster as boolean) ? 12 : 10;
                    },
                    labelFontWeight: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        return (nodeData?.isCluster as boolean) ? 'bold' : 'normal';
                    },
                    labelFill: '#F9FAFB',
                    labelPlacement: 'bottom',
                    labelOffsetY: 6,
                    labelBackground: true,
                    labelBackgroundFill: 'rgba(17, 24, 39, 0.75)',
                    labelBackgroundRadius: 3,
                    labelBackgroundPadding: [2, 4],
                    iconText: (d: Record<string, unknown>) => {
                        const nodeData = d?.data as Record<string, unknown> | undefined;
                        if (nodeData?.isCluster) return `${nodeData?.memberCount ?? ''}`;
                        const type = nodeData?.nodeType as string;
                        if (type === 'Mine') return 'M';
                        if (type === 'Refinery') return 'R';
                        if (type === 'Factory') return 'F';
                        if (type === 'Resource') return 'RES';
                        return '';
                    },
                    iconFontSize: 11,
                    iconFontWeight: 'bold',
                    iconFill: '#FFFFFF',
                },
                // 상태별 스타일 (호버, 선택, 전파경로, 비선택)
                state: {
                    selected: {
                        stroke: '#1890ff',
                        lineWidth: 4,
                        shadowColor: 'rgba(24, 144, 255, 0.4)',
                        shadowBlur: 10,
                    },
                    hover: {
                        lineWidth: 3,
                        shadowColor: 'rgba(0, 0, 0, 0.15)',
                        shadowBlur: 6,
                    },
                    highlight: {
                        stroke: '#1890ff',
                        lineWidth: 3.5,
                        shadowColor: 'rgba(24, 144, 255, 0.25)',
                        shadowBlur: 6,
                    },
                    inactive: {
                        fillOpacity: 0.35,
                        strokeOpacity: 0.35,
                        labelOpacity: 0.85,
                        labelFill: '#E5E7EB',
                        labelBackgroundOpacity: 0.85,
                    },
                    propagation: {
                        stroke: '#ff4d4f',
                        lineWidth: 4,
                        shadowColor: 'rgba(255, 77, 79, 0.6)',
                        shadowBlur: 12,
                    },
                },
            },
            // 엣지 기본 스타일 — 방향성 화살표 포함
            edge: {
                type: 'line',
                style: {
                    stroke: '#bfbfbf',
                    lineWidth: 1.5,
                    endArrow: true,
                    endArrowSize: 6,
                    // 기본 불투명도 명시 (state 해제 시 정상 복원되도록 보장)
                    opacity: 1.0,
                },
                state: {
                    highlight: {
                        stroke: '#1890ff',
                        lineWidth: 2.5,
                    },
                    inactive: {
                        opacity: 0.2,
                    },
                    propagation: {
                        stroke: '#ff4d4f',
                        lineWidth: 3,
                        lineDash: [6, 3],
                    },
                },
            },
            // 상호작용 동작
            behaviors: [
                'drag-canvas',
                'zoom-canvas',
                'drag-element',
            ],
            // 줌 범위 제한 (최소 0.5, 최대 3.0)
            zoomRange: [0.5, 3.0],
            // 자동 뷰핏
            autoFit: 'view',
            // 데이터 설정
            data,
        });

        graphRef.current = graph;

        // 그래프 클릭 이벤트 통합 바인딩 (노드 클릭 선택 및 빈 바탕 클릭 해제)
        graph.on('click', (event: any) => {
            const targetType = event?.targetType;
            if (targetType === 'node') {
                const targetId = event?.target?.id;
                if (onNodeClickRef.current && targetId) {
                    onNodeClickRef.current(targetId);
                }
            } else if (targetType === 'canvas') {
                if (onNodeClickRef.current) {
                    onNodeClickRef.current(null);
                }
            }
        });

        // 줌 변경 시 LOD 업데이트 (사용자 휠 인터랙션에 의한 줌만 처리)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graph.on('canvas:wheel' as any, () => {
            try {
                const currentZoom = graph.getZoom?.() ?? 1.0;
                setZoomLevel(currentZoom);
            } catch {
                // zoom 변경 감지 실패 시 무시
            }
        });

        // 비동기 렌더링 실행
        let active = true;
        graph.render()
            .then(() => {
                if (active && !graph.destroyed) {
                    setIsGraphReady(true);
                }
            })
            .catch((err) => {
                console.warn('G6 render failed or was interrupted:', err);
            });

        return () => {
            active = false;
            setIsGraphReady(false);
            if (graphRef.current) {
                graphRef.current.destroy();
                graphRef.current = null;
            }
        };
        // 의존성: 원본 데이터(nodes, edges, riskScores)가 변경될 때만 그래프 재생성
        // buildGraphData를 의존성에서 제거하여 LOD 상태 변경으로 인한 불필요한 재생성 방지
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredNodes, filteredEdges, riskScores]);

    // LOD 클러스터링 및 우회 경로(Re-Routing) 시각화 변경 시 그래프 데이터 업데이트
    useEffect(() => {
        if (!graphRef.current || graphRef.current.destroyed || !isGraphReady || filteredNodes.length === 0) return;
        // 초기 렌더 중에는 무시 (위 effect에서 이미 데이터 설정됨)
        if (isInitialRenderRef.current) {
            isInitialRenderRef.current = false;
            return;
        }

        const graph = graphRef.current;
        // 실행 중인 레이아웃 계산 중단 (force-layout 무한 틱 및 데이터 충돌 방지)
        graph.stopLayout?.();
        const data = buildGraphData();

        try {
            graph.setData(data);
            graph.render().catch(() => { });
        } catch {
            // 그래프 인스턴스 파괴 중 호출되면 무시
        }
    }, [isClustered, lodResult, buildGraphData, filteredNodes.length, isGraphReady, isRerouteApplied, activeRerouteOptions, selectedPlanNumber]);

    // 그래프 요소 비주얼 상태(하이라이트, 선택, 전파 경로) 통합 업데이트 (G6 공식 State 시스템 활용)
    useEffect(() => {
        if (!graphRef.current || graphRef.current.destroyed || !isGraphReady) return;
        const graph = graphRef.current;

        // G6 렌더링 엔진 안정화 및 레이아웃 틱과의 동기화를 위해 50ms 지연 실행
        const timer = setTimeout(() => {
            if (graph.destroyed) return;

            try {
                const data = graph.getData();

                // 1. 선택 노드 및 이웃 노드 판단을 위한 도우미 세트
                const isHighlightedNode = (id: string) => {
                    if (highlightedPath) {
                        return highlightedPath.nodeIds.includes(id);
                    }
                    if (selectedNodeId) {
                        if (id === selectedNodeId) return true;
                        return filteredEdges.some((e) =>
                            (e.sourceNodeId === selectedNodeId && e.targetNodeId === id) ||
                            (e.targetNodeId === selectedNodeId && e.sourceNodeId === id)
                        );
                    }
                    return false;
                };

                const isHighlightedEdge = (edgeId: string, sourceId: string, targetId: string) => {
                    if (highlightedPath) {
                        return highlightedPath.edgeIds.includes(edgeId);
                    }
                    if (selectedNodeId) {
                        return sourceId === selectedNodeId || targetId === selectedNodeId;
                    }
                    return false;
                };

                const hasActiveSelection = !!selectedNodeId || !!highlightedPath;

                // 우회 수급 적용 시 해소된 노드 세트 계산
                const resolvedTargetNodeIds = new Set<string>();
                if (isRerouteApplied && activeRerouteOptions && activeRerouteOptions.length > 0) {
                    const realNodeResults = activeRerouteOptions.filter((r) => !r.isGlobalCombined);
                    const targetsToProcess = realNodeResults.length > 0 ? realNodeResults : activeRerouteOptions;
                    targetsToProcess.forEach((nodeResult) => {
                        const plans = nodeResult.plans || [];
                        const planIndex = (selectedPlanNumber >= 1 && selectedPlanNumber <= plans.length) ? selectedPlanNumber - 1 : 0;
                        const remainingDeficit = plans[planIndex]?.remainingDeficitPercentage ?? nodeResult.remainingDeficitPercentage;
                        if (remainingDeficit === 0 && nodeResult.targetNodeId !== 'GLOBAL_TOTAL') {
                            resolvedTargetNodeIds.add(nodeResult.targetNodeId);
                        }
                    });
                }

                // 2. 모든 노드/엣지 상태 배치 맵 구성
                const nodeStatesMap: Record<string, string[]> = {};
                const edgeStatesMap: Record<string, string[]> = {};

                // 모든 노드 상태 계산
                for (const node of data.nodes || []) {
                    const nodeId = node.id as string;
                    if (!nodeId) continue;

                    const states: string[] = [];
                    const isResolvedNode = isRerouteApplied && resolvedTargetNodeIds.has(nodeId);

                    if (hasActiveSelection) {
                        if (highlightedPath && highlightedPath.nodeIds.includes(nodeId) && !isResolvedNode) {
                            states.push('propagation');
                        } else if (selectedNodeId === nodeId) {
                            states.push('selected');
                        } else {
                            if (isHighlightedNode(nodeId)) {
                                states.push('highlight');
                            } else {
                                states.push('inactive');
                            }
                        }
                    }

                    nodeStatesMap[nodeId] = states;
                }

                // 모든 엣지 상태 계산
                for (const edge of data.edges || []) {
                    const edgeId = edge.id as string;
                    const sourceId = edge.source as string;
                    const targetId = edge.target as string;
                    if (!edgeId) continue;

                    const states: string[] = [];
                    const isRerouteEdge = (edge.data as any)?.isRerouteEdge;

                    if (hasActiveSelection && !isRerouteEdge) {
                        if (highlightedPath && highlightedPath.edgeIds.includes(edgeId)) {
                            states.push('propagation');
                        } else {
                            if (isHighlightedEdge(edgeId, sourceId, targetId)) {
                                states.push('highlight');
                            } else {
                                states.push('inactive');
                            }
                        }
                    }

                    edgeStatesMap[edgeId] = states;
                }

                // 3. G6 공식 일괄 배치 업데이트 호출
                graph.setElementState(nodeStatesMap);
                graph.setElementState(edgeStatesMap);

                // G6 엔진에 즉시 다시 그리기 요청
                graph.draw();
            } catch (err) {
                console.warn('G6 visual state update failed:', err);
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [selectedNodeId, highlightedPath, filteredEdges, isGraphReady, isRerouteApplied, activeRerouteOptions, selectedPlanNumber]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
            }}
            aria-label="리튬 공급망 그래프 시각화"
            role="img"
        >
            {/* 우상단 컨트롤 & 액션 버튼 영역 (가로 2컬럼 배치) */}
            <div
                style={{
                    position: 'absolute',
                    top: '0.65rem',
                    right: '1.0rem',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    zIndex: 10,
                }}
            >
                {/* 좌측 버튼 컬럼: 국가 클러스터링 */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '0.35rem',
                    }}
                >
                    {/* 국가 클러스터링 토글 스위치 (좌측 스위치 + 우측 텍스트) */}
                    <div
                        role="switch"
                        aria-checked={clusteringEnabled}
                        tabIndex={isSimulationOpen || !isGraphReady ? -1 : 0}
                        onClick={() => {
                            if (!isSimulationOpen && isGraphReady) {
                                setClusteringEnabled((prev) => !prev);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (!isSimulationOpen && isGraphReady) {
                                    setClusteringEnabled((prev) => !prev);
                                }
                            }
                        }}
                        title={
                            !isGraphReady
                                ? '그래프 렌더링 중...'
                                : isSimulationOpen
                                    ? '시뮬레이션 모드에서는 국가 클러스터링을 사용할 수 없습니다'
                                    : clusteringEnabled
                                        ? '국가 클러스터링 해제'
                                        : '국가 클러스터링 활성화'
                        }
                        className={`font-semibold shadow-xs flex items-center justify-start gap-2 transition-all duration-200 rounded px-2.5 py-1.5 text-xs h-[30px] select-none border ${
                            isSimulationOpen
                                ? 'bg-card/40 border-border/40 text-muted-foreground cursor-not-allowed opacity-50'
                                : 'bg-card text-foreground border-border hover:bg-accent/80 cursor-pointer shadow-xs'
                        }`}
                    >
                        {/* 좌측 토글 스위치 UI */}
                        <div
                            className={`w-7 h-3.5 flex items-center rounded-full p-0.5 transition-colors duration-200 shrink-0 ${
                                clusteringEnabled
                                    ? 'bg-primary justify-end'
                                    : 'bg-zinc-600 dark:bg-zinc-600 border border-zinc-500/50 justify-start'
                            }`}
                        >
                            <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
                        </div>
                        <span className="text-[0.75rem] font-semibold">국가 클러스터링</span>
                    </div>
                </div>

                {/* 우측 플로팅 컨트롤: 줌 표시 + 시각화 모드 (세로) */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '0.35rem',
                        minWidth: '110px',
                    }}
                >
                    {/* 1. 줌 레벨 표시 */}
                    <div className="bg-muted border border-border rounded px-2 py-1 text-[0.7rem] text-foreground text-center h-[30px] flex items-center justify-center">
                        Zoom: {zoomLevel.toFixed(2)}
                    </div>

                    {/* 2. 시각화 모드 라디오 버튼 그룹 */}
                    <div className="bg-muted border border-border rounded p-2 shadow-md flex flex-col gap-1.5">
                    <span className="text-[0.7rem] font-bold text-foreground text-center block">시각화 모드</span>
                    <div className="flex flex-col gap-0.5">
                        <label
                            onClick={() => setColorMode('nodeType')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-[0.7rem] font-medium cursor-pointer transition-all ${colorMode === 'nodeType'
                                ? 'bg-primary/20 text-primary font-bold'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                }`}
                        >
                            <input
                                type="radio"
                                name="visualizationMode"
                                value="nodeType"
                                checked={colorMode === 'nodeType'}
                                onChange={() => setColorMode('nodeType')}
                                className="w-3.5 h-3.5 accent-primary cursor-pointer"
                            />
                            <span>노드 타입별</span>
                        </label>

                        <label
                            onClick={() => setColorMode('country')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-[0.7rem] font-medium cursor-pointer transition-all ${colorMode === 'country'
                                ? 'bg-primary/20 text-primary font-bold'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                }`}
                        >
                            <input
                                type="radio"
                                name="visualizationMode"
                                value="country"
                                checked={colorMode === 'country'}
                                onChange={() => setColorMode('country')}
                                className="w-3.5 h-3.5 accent-primary cursor-pointer"
                            />
                            <span>국가별</span>
                        </label>

                        <label
                            onClick={() => setColorMode('risk')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-[0.7rem] font-medium cursor-pointer transition-all ${colorMode === 'risk'
                                ? 'bg-primary/20 text-primary font-bold'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                }`}
                        >
                            <input
                                type="radio"
                                name="visualizationMode"
                                value="risk"
                                checked={colorMode === 'risk'}
                                onChange={() => setColorMode('risk')}
                                className="w-3.5 h-3.5 accent-primary cursor-pointer"
                            />
                            <span>리스크별</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </div>
    );
}

/** 노드 타입 영-한 매핑 */
const NODE_TYPE_LABEL_KO: Record<string, string> = {
    Resource: '자원',
    Mine: '광산',
    Refinery: '정제소',
    Factory: '공장',
};

/** 국가 영-한 매핑 */
const COUNTRY_LABEL_KO: Record<string, string> = {
    SouthKorea: '한국',
    Japan: '일본',
    China: '중국',
    Chile: '칠레',
    UnitedStates: '미국',
    Argentina: '아르헨티나',
    Australia: '호주',
    Poland: '폴란드',
    NA: '기타',
};

/**
 * 일반 노드를 G6 데이터 형식으로 변환.
 */
function buildRegularNode(
    node: SupplyChainNode,
    riskScores: Map<string, number>,
    colorMode: ColorMode,
) {
    const riskScore = riskScores.get(node.id) ?? 0;
    const radius = getNodeRadius(node.metadata.productionCapacity, node.metadata.capacityUnit);

    // 보기 기준(colorMode)에 따른 노드 색상 지정
    let fillColor = getCountryColor(node.country);
    if (colorMode === 'nodeType') {
        fillColor = getNodeTypeColor(node.type);
    } else if (colorMode === 'risk') {
        fillColor = getRiskColor(riskScore);
    }

    return {
        id: node.id,
        data: {
            nodeType: node.type,
            country: node.country,
            riskScore,
            label: node.country === 'NA'
                ? `${node.name}\n(${NODE_TYPE_LABEL_KO[node.type] ?? node.type})`
                : `${node.name}\n(${COUNTRY_LABEL_KO[node.country] ?? node.country}, ${NODE_TYPE_LABEL_KO[node.type] ?? node.type})`,
            size: radius * 2,
            color: fillColor,
            stroke: 'rgba(255, 255, 255, 0.4)', // 단색 은은한 테두리 고정
            strokeWidth: 1.5,
            isCluster: false,
        },
    };
}

/**
 * 클러스터 노드를 G6 데이터 형식으로 변환.
 */
function buildClusterNode(cluster: ClusterResult, colorMode: ColorMode) {
    let fillColor = getCountryColor(cluster.country);
    if (colorMode === 'risk') {
        fillColor = getRiskColor(cluster.averageRiskScore);
    }

    // 클러스터 크기: 멤버 수에 비례 (최소 60px, 최대 120px)
    const clusterSize = Math.min(120, Math.max(60, 40 + cluster.memberCount * 15));

    return {
        id: cluster.id,
        data: {
            nodeType: 'cluster',
            country: cluster.country,
            riskScore: cluster.averageRiskScore,
            label: cluster.label,
            size: clusterSize,
            color: fillColor,
            stroke: '#FFFFFF',
            strokeWidth: 2.5,
            isCluster: true,
            memberCount: cluster.memberCount,
            memberNodeIds: cluster.memberNodeIds,
        },
    };
}

/**
 * 클러스터링 상태에서 엣지를 재매핑.
 * 클러스터에 포함된 노드 간 엣지는 클러스터 간 엣지로 병합한다.
 */
function buildClusteredEdges(
    originalEdges: SupplyChainEdge[],
    lodResult: { clusters: ClusterResult[]; visibleNodes: string[] },
    _nodes: SupplyChainNode[],
) {
    // 노드ID → 소속 클러스터ID 매핑
    const nodeToCluster = new Map<string, string>();
    for (const cluster of lodResult.clusters) {
        for (const memberId of cluster.memberNodeIds) {
            nodeToCluster.set(memberId, cluster.id);
        }
    }

    // 중복 엣지 제거를 위한 세트
    const edgeSet = new Set<string>();
    const g6Edges: Array<{
        id: string;
        source: string;
        target: string;
        data: { edgeType: string; volume?: number; isMerged: boolean };
    }> = [];

    for (const edge of originalEdges) {
        // 소스/타겟을 클러스터 또는 개별 노드로 매핑
        const source = nodeToCluster.get(edge.sourceNodeId) || edge.sourceNodeId;
        const target = nodeToCluster.get(edge.targetNodeId) || edge.targetNodeId;

        // 같은 클러스터 내부 엣지는 생략
        if (source === target) continue;

        // 소스/타겟이 실제 존재하는 노드/클러스터인지 확인
        const visibleSet = new Set([
            ...lodResult.visibleNodes,
            ...lodResult.clusters.map((c) => c.id),
        ]);
        if (!visibleSet.has(source) || !visibleSet.has(target)) continue;

        // 중복 엣지 방지
        const edgeKey = `${source}->${target}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        g6Edges.push({
            id: `clustered-${edge.id}`,
            source,
            target,
            data: {
                edgeType: edge.type,
                volume: edge.attributes.volume,
                isMerged: source !== edge.sourceNodeId || target !== edge.targetNodeId,
            },
        });
    }

    return g6Edges;
}
