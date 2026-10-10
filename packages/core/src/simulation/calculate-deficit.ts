import type {
    SupplyChainNode,
    SupplyChainEdge,
    PropagationPath,
    DeficitResult,
} from '@navigator/shared';

/**
 * 각 다운스트림 노드의 공급 부족 비율을 계산한다.
 *
 * 전파 경로 내 각 노드에 대해:
 * - originalSupply: 해당 노드로 들어오는 모든 인바운드 엣지의 volume 합계
 * - disruptedSupply: originalSupply * (1 - attenuationFactor)
 * - deficitPercentage: attenuationFactor * 100, [0, 100] 범위로 클램핑
 *
 * 소스 노드(index 0)는 severity 기반으로 부족률을 계산한다.
 * 인바운드 엣지가 없는 노드는 originalSupply = 0, deficitPercentage = 0.
 */
export function calculateSupplyDeficit(
    path: PropagationPath,
    allNodes: SupplyChainNode[],
    allEdges: SupplyChainEdge[],
): DeficitResult[] {
    const results: DeficitResult[] = [];

    for (let i = 0; i < path.nodes.length; i++) {
        const nodeId = path.nodes[i];
        const attenuationFactor = path.attenuationFactors[i];

        // 해당 노드로 들어오는 인바운드 엣지 확인
        const inboundEdges = allEdges.filter((e) => e.targetNodeId === nodeId);

        // 인바운드 엣지가 없는 소스 노드는 원래 공급량 0, 부족률 0
        if (inboundEdges.length === 0) {
            results.push({
                nodeId,
                originalSupply: 0,
                disruptedSupply: 0,
                deficitPercentage: 0,
            });
            continue;
        }

        let rawSupplySum = 0;
        let hasExplicitVolume = false;
        for (const edge of inboundEdges) {
            if (typeof edge.attributes?.volume === 'number' && edge.attributes.volume > 0) {
                rawSupplySum += edge.attributes.volume;
                hasExplicitVolume = true;
            }
        }

        const node = allNodes.find((n) => n.id === nodeId);
        const nodeCapacity = Number(node?.metadata?.productionCapacity) || 0;

        let originalSupply = 0;
        if (hasExplicitVolume) {
            originalSupply = rawSupplySum;
        } else {
            // 인바운드 엣지는 존재하나 volume이 미정의된 경우 노드 생산 용량(productionCapacity)으로 대체
            originalSupply = nodeCapacity > 0 ? nodeCapacity : 100;
        }

        // 교란된 공급량 = 원래 공급량 * (1 - 감쇄 계수)
        const disruptedSupply = Math.round(originalSupply * (1 - attenuationFactor));

        // 부족률 = 감쇄 계수 * 100, [0, 100] 범위로 클램핑
        const deficitPercentage = Math.min(100, Math.max(0, Math.round(attenuationFactor * 100 * 10) / 10));

        // 화학양론비(LCE)가 반영된 물리적 결손 톤수 계산
        const capacityUnit = (node?.metadata?.capacityUnit as string) || '';
        const lithiumRatio = (node?.type === 'Factory' || capacityUnit === 'tons_cathode') ? 0.48 : 1.0;
        const baseCapacity = nodeCapacity > 0 ? nodeCapacity : originalSupply;
        const defectQuantityTons = Math.round((baseCapacity * (deficitPercentage / 100)) * lithiumRatio);

        // 하류로 물량을 전달하는 아웃바운드 엣지가 있는지 여부 확인 (없으면 최종 소비처)
        const hasOutboundSupply = allEdges.some((e) => e.sourceNodeId === nodeId);
        const isTerminalConsumer = !hasOutboundSupply || node?.type === 'Factory';

        results.push({
            nodeId,
            originalSupply,
            disruptedSupply,
            deficitPercentage,
            defectQuantityTons,
            isTerminalConsumer,
        });
    }

    return results;
}
