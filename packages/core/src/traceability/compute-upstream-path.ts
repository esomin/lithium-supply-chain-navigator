import type {
    SupplyChainNode,
    SupplyChainEdge,
    TraceabilityNode,
    TraceabilityEdge,
    UpstreamPath,
    TraceabilityResult,
    EsgStatus,
} from '@navigator/shared';

/**
 * 노드의 ESG 상태를 추출한다.
 * metadata에 esgStatus 필드가 있으면 사용하고, 없으면 'unknown'을 반환한다.
 */
export function getNodeEsgStatus(node: SupplyChainNode): EsgStatus {
    const status = node.metadata['esgStatus'] as string | undefined;
    if (
        status === 'compliant' ||
        status === 'non_compliant' ||
        status === 'unverified' ||
        status === 'unknown'
    ) {
        return status;
    }
    return 'unknown';
}

/**
 * 노드의 인증 정보를 추출한다.
 */
export function getNodeCertifications(node: SupplyChainNode): string[] {
    const certs = node.metadata['certifications'];
    if (Array.isArray(certs)) {
        return certs.filter((c): c is string => typeof c === 'string');
    }
    return [];
}

/**
 * SupplyChainNode를 TraceabilityNode로 변환한다.
 */
function toTraceabilityNode(node: SupplyChainNode): TraceabilityNode {
    return {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        country: node.country,
        esgStatus: getNodeEsgStatus(node),
        certifications: getNodeCertifications(node),
    };
}

/**
 * SupplyChainEdge를 TraceabilityEdge로 변환한다.
 */
function toTraceabilityEdge(edge: SupplyChainEdge): TraceabilityEdge {
    return {
        edgeId: edge.id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        volume: edge.attributes.volume,
        price: edge.attributes.price,
    };
}

/**
 * 경로에 미검증 또는 unknown ESG 상태의 노드가 포함되어 있는지 확인한다.
 */
function hasUnverifiedNode(nodes: TraceabilityNode[]): boolean {
    return nodes.some(
        (n) => n.esgStatus === 'unverified' || n.esgStatus === 'unknown',
    );
}

/**
 * Factory 노드에서 Mine 노드까지의 모든 업스트림 경로를 역방향 DFS로 계산한다.
 *
 * 역방향 DFS: targetNodeId가 현재 노드인 엣지(인바운드)를 따라 상류로 이동한다.
 * 스택 기반으로 모든 가능한 경로를 전수 탐색하며, Mine 노드에 도달하면 경로를 완성한다.
 * Resource 노드에 도달하면 해당 분기는 종료한다(결과에 포함하지 않음).
 *
 * @param factoryNodeId - 역추적 시작 Factory 노드 ID
 * @param allNodes - 전체 노드 목록
 * @param allEdges - 전체 엣지 목록
 * @returns TraceabilityResult - 역추적 결과
 */
export function computeUpstreamPaths(
    factoryNodeId: string,
    allNodes: SupplyChainNode[],
    allEdges: SupplyChainEdge[],
): TraceabilityResult {
    const startNode = allNodes.find((n) => n.id === factoryNodeId);

    // 시작 노드가 없거나 Plant/Factory 타입이 아닌 경우 빈 결과 반환
    if (!startNode || (startNode.type !== 'Plant' && startNode.type !== 'Factory')) {
        return {
            factoryNodeId,
            factoryName: startNode?.name ?? '',
            upstreamPaths: [],
            sourceMinIds: [],
            intermediateRefineryIds: [],
            hasUnverifiedPaths: false,
            computedAt: new Date(),
        };
    }

    // 노드 맵 생성 (빠른 조회용)
    const nodeMap = new Map<string, SupplyChainNode>();
    for (const node of allNodes) {
        nodeMap.set(node.id, node);
    }

    // 인바운드 엣지 인덱스 생성 (targetNodeId → edges[])
    const inboundEdgeIndex = new Map<string, SupplyChainEdge[]>();
    for (const edge of allEdges) {
        const existing = inboundEdgeIndex.get(edge.targetNodeId) ?? [];
        existing.push(edge);
        inboundEdgeIndex.set(edge.targetNodeId, existing);
    }

    // DFS를 사용하여 모든 경로 탐색
    const completedPaths: UpstreamPath[] = [];
    const sourceMinIds = new Set<string>();
    const intermediateRefineryIds = new Set<string>();

    // DFS 스택: [현재 노드 ID, 지금까지의 경로 노드 ID 목록, 지금까지의 경로 엣지 목록]
    interface DfsState {
        currentNodeId: string;
        pathNodeIds: string[];
        pathEdges: SupplyChainEdge[];
    }

    const stack: DfsState[] = [
        {
            currentNodeId: factoryNodeId,
            pathNodeIds: [factoryNodeId],
            pathEdges: [],
        },
    ];

    // 전체 방문 한도 (무한루프 방지)
    const MAX_ITERATIONS = 10000;
    let iterations = 0;

    while (stack.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const { currentNodeId, pathNodeIds, pathEdges } = stack.pop()!;
        const currentNode = nodeMap.get(currentNodeId);

        if (!currentNode) {
            continue;
        }

        // 종료 조건: Mine 또는 Resource 노드에 도달
        if (
            currentNode.type === 'Mine' ||
            currentNode.type === 'Resource'
        ) {
            // 경로 완성 — 종료 노드가 Mine인 경우만 유효한 역추적 경로
            if (currentNode.type === 'Mine') {
                const traceNodes = pathNodeIds.map((id) => {
                    const node = nodeMap.get(id)!;
                    return toTraceabilityNode(node);
                });
                const traceEdges = pathEdges.map(toTraceabilityEdge);

                const path: UpstreamPath = {
                    nodes: traceNodes,
                    edges: traceEdges,
                    hasUnverifiedSegment: hasUnverifiedNode(traceNodes),
                };

                completedPaths.push(path);
                sourceMinIds.add(currentNodeId);

                // 중간 Refinery 노드 수집
                for (const id of pathNodeIds) {
                    const node = nodeMap.get(id);
                    if (node && node.type === 'Refinery') {
                        intermediateRefineryIds.add(id);
                    }
                }
            }
            continue;
        }

        // 현재 노드의 인바운드 엣지를 따라 상류로 이동
        const inboundEdges = inboundEdgeIndex.get(currentNodeId) ?? [];

        if (inboundEdges.length === 0) {
            // 더 이상 상류 노드가 없으면 경로 종료 (Mine에 도달하지 못한 불완전 경로)
            continue;
        }

        for (const edge of inboundEdges) {
            const upstreamNodeId = edge.sourceNodeId;

            // 순환 방지: 이미 경로에 포함된 노드는 건너뜀
            if (pathNodeIds.includes(upstreamNodeId)) {
                continue;
            }

            stack.push({
                currentNodeId: upstreamNodeId,
                pathNodeIds: [...pathNodeIds, upstreamNodeId],
                pathEdges: [...pathEdges, edge],
            });
        }
    }

    return {
        factoryNodeId,
        factoryName: startNode.name,
        upstreamPaths: completedPaths,
        sourceMinIds: Array.from(sourceMinIds),
        intermediateRefineryIds: Array.from(intermediateRefineryIds),
        hasUnverifiedPaths: completedPaths.some((p) => p.hasUnverifiedSegment),
        computedAt: new Date(),
    };
}
