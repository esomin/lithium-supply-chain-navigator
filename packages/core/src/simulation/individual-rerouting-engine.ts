/**
 * 개별 차질 발생 노드 단위 대체 우회 공급망 시나리오 엔진 (Individual Rerouting Engine)
 */

import type {
    SupplyChainNode,
    SupplyChainEdge,
    SimulationResult,
    ReroutingResult,
    ReroutingOption,
    ReroutingProposalPlan,
    OptimizationCriterion,
    LogisticsInfo,
} from '@navigator/shared';

/** 두 지점 간의 하버사인(Haversine) 최단 거리(km) 계산 */
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // 지구 반지름 (km)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(10, Math.round(R * c));
}

/**
 * 차질이 발생한 개별 노드(Factory, Refinery, Mine) 단위의 1안(비용), 2안(시간), 3안(밸런스) 우회 경로 시나리오를 자동 산출한다.
 */
export function computeIndividualReroutingOptions(
    simulationResult: SimulationResult,
    allNodes: SupplyChainNode[],
    allEdges: SupplyChainEdge[],
    defaultCriterion: OptimizationCriterion = 'balanced',
): ReroutingResult[] {
    const results: ReroutingResult[] = [];
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

    // 차질이 발생한 노드 (deficitPercentage > 0) 감지
    const deficitItems = (simulationResult.deficits || []).filter((d) => d.deficitPercentage > 0);

    if (deficitItems.length === 0) {
        return results;
    }

    for (const deficit of deficitItems) {
        const targetNode = nodeMap.get(deficit.nodeId);
        if (!targetNode) continue;

        // 결손 노드로 들어오는 엣지들 및 HS 코드
        const incomingEdges = allEdges.filter((e) => e.targetNodeId === targetNode.id);
        const incomingHsCodes = new Set(incomingEdges.map((e) => e.attributes?.hsCode).filter(Boolean));

        // 대체 가능 후보 노드 스크리닝
        const candidates = allNodes.filter((candidate) => {
            if (candidate.id === targetNode.id) return false;
            if (candidate.type === 'Resource') return false;

            if (targetNode.type === 'Factory') {
                if (candidate.type !== 'Refinery') return false;
            } else if (targetNode.type === 'Refinery') {
                if (candidate.type !== 'Mine') return false;
            } else if (targetNode.type === 'Mine') {
                if (candidate.type !== 'Mine') return false;
            }

            // 시뮬레이션 차질(부족률 30% 이상 또는 공급 0) 노드는 제외
            const candidateDeficit = simulationResult.deficits.find((d) => d.nodeId === candidate.id);
            if (candidateDeficit && (candidateDeficit.deficitPercentage >= 30 || candidateDeficit.disruptedSupply === 0)) {
                return false;
            }

            return true;
        });

        if (candidates.length === 0) continue;

        // 기준(criterion)별 ReroutingProposalPlan 산출 함수
        const buildPlan = (
            crit: OptimizationCriterion,
            planNum: 1 | 2 | 3,
            title: string,
        ): ReroutingProposalPlan | null => {
            interface CandidateEvaluation {
                candidateNode: SupplyChainNode;
                hsCode: string;
                logistics: LogisticsInfo;
                costPerTon: number;
                leadTimeDays: number;
                transportType: string;
                score: number;
                existingEdgeId?: string;
            }

            const evaluated: CandidateEvaluation[] = [];

            for (const candidate of candidates) {
                const existingEdge = allEdges.find(
                    (e) => e.sourceNodeId === candidate.id && e.targetNodeId === targetNode.id,
                );

                const hsCode = (existingEdge?.attributes?.hsCode as string) || Array.from(incomingHsCodes)[0] || (targetNode.type === 'Factory' ? '2825.20' : '2530.90');
                const existingLogistics = existingEdge?.attributes?.logisticsInfo as LogisticsInfo | undefined;

                const isSameCountry = candidate.country === targetNode.country;
                const distKm = calculateDistanceKm(
                    candidate.coordinates.latitude, candidate.coordinates.longitude,
                    targetNode.coordinates.latitude, targetNode.coordinates.longitude,
                );

                const transportType = existingLogistics?.transportMode || (isSameCountry ? 'Road' : 'Maritime');
                const leadTimeDays = existingLogistics?.totalLeadTimeDays || (
                    isSameCountry
                        ? Math.max(0.4, Math.round((distKm / 350) * 10) / 10)
                        : Math.round((distKm / 700 + 2.5) * 10) / 10
                );

                const costPerTon = existingLogistics?.freightCostUsdPerTon || (
                    isSameCountry
                        ? Math.round(20 + distKm * 0.06)
                        : Math.round(45 + (distKm / 1000) * 5.2)
                );

                let wCost = 0.5;
                let wTime = 0.5;
                if (crit === 'cost') {
                    wCost = 0.85;
                    wTime = 0.15;
                } else if (crit === 'leadTime') {
                    wCost = 0.15;
                    wTime = 0.85;
                }

                const normCost = costPerTon / 200;
                const normTime = leadTimeDays / 30;
                const score = wCost * normCost + wTime * normTime;

                evaluated.push({
                    candidateNode: candidate,
                    hsCode,
                    logistics: existingLogistics || {
                        transportMode: transportType,
                        distanceKm: distKm,
                        leadTimeDays,
                        customsDelayDays: isSameCountry ? 0 : 2.0,
                        totalLeadTimeDays: leadTimeDays,
                        freightCostUsdPerTon: costPerTon,
                    },
                    costPerTon,
                    leadTimeDays,
                    transportType,
                    score,
                    existingEdgeId: existingEdge?.id,
                });
            }

            evaluated.sort((a, b) => a.score - b.score);
            const topCandidates = evaluated.slice(0, 2);
            if (topCandidates.length === 0) return null;

            const totalDeficitPercentage = deficit.deficitPercentage;
            const targetCapacity = Number(targetNode.metadata?.productionCapacity) || 50000;
            const targetCapacityUnit = (targetNode.metadata?.capacityUnit as string) || '';

            // 양극재 플랜트(Factory)의 경우 캐파는 'tons_cathode' 단위임.
            // 양극재 1톤 생산에는 화학양론적으로 약 0.45~0.50톤의 탄산리튬/수산화리튬(LCE)이 투입됨.
            // 따라서 상위 정제소(Refinery)로부터 필요한 LCE 원료 결손량은 cathode 캐파 * 0.48로 환산해야 함.
            const lithiumInputRatio = (targetNode.type === 'Factory' || targetCapacityUnit === 'tons_cathode') ? 0.48 : 1.0;
            const requiredLithiumTons = Math.round((targetCapacity * (totalDeficitPercentage / 100)) * lithiumInputRatio);

            const allocations = topCandidates.length > 1 ? [0.7, 0.3] : [1.0];
            const options: ReroutingOption[] = [];
            let totalCoveredPercentage = 0;
            let weightedCostSum = 0;
            let weightedLeadTimeSum = 0;

            topCandidates.forEach((item, index) => {
                const ratio = allocations[index];
                const coveredDeficit = Math.round(totalDeficitPercentage * ratio * 10) / 10;
                
                // 후보 정제소/광산의 생산 용량 한도
                const candidateCapacity = Number(item.candidateNode.metadata?.productionCapacity) || 100000;
                // 정제소는 여유 가용 캐파 범위(보통 연산의 20~30% 또는 결손량) 내에서 안전하게 공급
                const allocatedTons = Math.min(
                    Math.round(requiredLithiumTons * ratio),
                    Math.round(candidateCapacity * 0.5) // 단일 대안처가 캐파의 50%를 초과하여 과도하게 할당되지 않도록 안전 가드레일
                );

                totalCoveredPercentage += coveredDeficit;
                const totalExtraCost = Math.round(allocatedTons * item.costPerTon);

                weightedCostSum += totalExtraCost;
                weightedLeadTimeSum += item.leadTimeDays * ratio;

                options.push({
                    rank: index + 1,
                    sourceNodeId: item.candidateNode.id,
                    sourceName: item.candidateNode.name,
                    targetNodeId: targetNode.id,
                    targetName: targetNode.name,
                    allocatedVolumeTons: allocatedTons,
                    coveredDeficitPercentage: coveredDeficit,
                    costImpact: {
                        unitExtraCostUsd: item.costPerTon,
                        totalExtraCostUsd: totalExtraCost,
                    },
                    leadTimeImpact: {
                        baseDays: Math.round(item.leadTimeDays * 0.7),
                        additionalDays: Math.round(item.leadTimeDays * 0.3 * 10) / 10,
                        totalDays: item.leadTimeDays,
                    },
                    transportType: item.transportType,
                    hsCode: item.hsCode,
                    suggestedEdgeId: item.existingEdgeId || `REROUTE-${item.candidateNode.id}-${targetNode.id}`,
                });
            });

            const remainingDeficit = Math.max(0, Math.round((totalDeficitPercentage - totalCoveredPercentage) * 10) / 10);
            const avgLeadTime = Math.round(weightedLeadTimeSum * 10) / 10;

            return {
                planNumber: planNum,
                title,
                criterion: crit,
                coveredDeficitPercentage: Math.round(totalCoveredPercentage * 10) / 10,
                remainingDeficitPercentage: remainingDeficit,
                totalExtraCostUsd: weightedCostSum,
                averageExtraLeadTimeDays: avgLeadTime,
                options,
            };
        };

        const plan1 = buildPlan('cost', 1, '1안: 비용 우선');
        const plan2 = buildPlan('leadTime', 2, '2안: 운송시간 우선');
        const plan3 = buildPlan('balanced', 3, '3안: 밸런스');

        const plans: ReroutingProposalPlan[] = [plan1, plan2, plan3].filter(
            (p): p is ReroutingProposalPlan => p !== null,
        );

        if (plans.length === 0) continue;

        const defaultPlan = plans.find((p) => p.criterion === defaultCriterion) || plans[0];
        const targetCapacity = Number(targetNode.metadata?.productionCapacity) || 50000;
        const targetCapacityUnit = (targetNode.metadata?.capacityUnit as string) || '';
        const lithiumInputRatio = (targetNode.type === 'Factory' || targetCapacityUnit === 'tons_cathode') ? 0.48 : 1.0;
        const defectQuantityTons = Math.round((targetCapacity * (deficit.deficitPercentage / 100)) * lithiumInputRatio);

        results.push({
            simulationId: simulationResult.scenarioId,
            targetNodeId: targetNode.id,
            targetNodeName: targetNode.name,
            defectQuantityTons,
            originalDeficitPercentage: deficit.deficitPercentage,
            remainingDeficitPercentage: defaultPlan.remainingDeficitPercentage,
            totalExtraCostUsd: defaultPlan.totalExtraCostUsd,
            averageExtraLeadTimeDays: defaultPlan.averageExtraLeadTimeDays,
            criterion: defaultCriterion,
            plans,
        });
    }

    return results;
}
