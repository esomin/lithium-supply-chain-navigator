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

    // 상하류 중복 방지 (순 결손 대상 노드 필터링)
    // 결손 노드들 중 하류에 다른 결손 소비 노드(예: Factory)가 연결된 중간 정제소/광산은
    // 개별 우회 할당에서 제외하고, 실제 원자재를 최종 소비하는 하류 말단 노드 위주로 대안을 도출합니다.
    const deficitNodeIdSet = new Set(deficitItems.map((d) => d.nodeId));

    // 특정 결손 노드가 다른 결손 노드의 상류(Upstream) 공급자인지 판별
    const isUpstreamOfAnotherDeficitNode = (nodeId: string): boolean => {
        return allEdges.some(
            (e) => e.sourceNodeId === nodeId && deficitNodeIdSet.has(e.targetNodeId),
        );
    };

    // 하류에 결손 소비 노드가 있는 경우 해당 상류 노드는 제외, 말단 노드가 있는 경우 말단 노드 우선 선택
    const targetDeficitItems = deficitItems.filter((d) => {
        // 단일 노드 결손이거나 하류에 연결된 결손 노드가 없으면 대상에 포함
        return !isUpstreamOfAnotherDeficitNode(d.nodeId);
    });

    // 만약 순환 구조 등으로 모든 노드가 상류로 판별되었다면 기존 전체 deficitItems 사용 (Fallback)
    const effectiveDeficitItems = targetDeficitItems.length > 0 ? targetDeficitItems : deficitItems;

    // 정제소/광산 후보의 명목 캐파 대비 비상 긴급 동원 가능한 여유 캐파 비율 (장기 오프테이크 허용오차 및 가동률 극대화 반영: 15%)
    const REFINERY_AVAILABLE_CAPACITY_RATIO = 0.15;

    // 각 기준(cost, leadTime, balanced)별로 공장 간 정제소 캐파 중복 할당을 방지하기 위한 함수
    const buildCriterionResults = (crit: OptimizationCriterion, planNum: 1 | 2 | 3, planTitle: string) => {
        // 정제소/광산 노드별 남은 가용 용량 풀 (Shared Pool) 초기화
        const remainingCapacityMap = new Map<string, number>();
        allNodes.forEach((node) => {
            if (node.type === 'Refinery' || node.type === 'Mine') {
                const nominalCap = Number(node.metadata?.productionCapacity) || 50000;
                remainingCapacityMap.set(node.id, Math.round(nominalCap * REFINERY_AVAILABLE_CAPACITY_RATIO));
            }
        });

        const perFactoryPlans = new Map<string, ReroutingProposalPlan>();

        for (const deficit of effectiveDeficitItems) {
            const targetNode = nodeMap.get(deficit.nodeId);
            if (!targetNode) continue;

            const incomingEdges = allEdges.filter((e) => e.targetNodeId === targetNode.id);
            const incomingHsCodes = new Set(incomingEdges.map((e) => e.attributes?.hsCode).filter(Boolean));

            const candidates = allNodes.filter((candidate) => {
                if (candidate.id === targetNode.id) return false;
                if (candidate.type === 'Resource') return false;

                if (targetNode.type === 'Plant' || targetNode.type === 'Factory') {
                    if (candidate.type !== 'Refinery') return false;
                } else if (targetNode.type === 'Refinery') {
                    if (candidate.type !== 'Mine') return false;
                } else if (targetNode.type === 'Mine') {
                    if (candidate.type !== 'Mine') return false;
                }

                const candidateDeficit = simulationResult.deficits.find((d) => d.nodeId === candidate.id);
                if (candidateDeficit && (candidateDeficit.deficitPercentage >= 30 || candidateDeficit.disruptedSupply === 0)) {
                    return false;
                }

                return true;
            });

            if (candidates.length === 0) continue;

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

                const hsCode = (existingEdge?.attributes?.hsCode as string) || Array.from(incomingHsCodes)[0] || ((targetNode.type === 'Plant' || targetNode.type === 'Factory') ? '2825.20' : '2530.90');
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
            if (topCandidates.length === 0) continue;

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
                const desiredTons = Math.round(requiredLithiumTons * ratio);
                const currentRemaining = remainingCapacityMap.get(item.candidateNode.id) ?? 0;

                // 공유 풀 잔여 캐파와 요청량 중 작은 값 할당
                const allocatedTons = Math.max(0, Math.min(desiredTons, currentRemaining));

                // 공유 풀에서 할당된 톤수만큼 차감
                remainingCapacityMap.set(item.candidateNode.id, Math.max(0, currentRemaining - allocatedTons));

                // 할당된 실제 톤수 기반의 실질 부족 해소율(%p) 계산
                const coveredDeficit = requiredLithiumTons > 0
                    ? Math.round(((allocatedTons / requiredLithiumTons) * totalDeficitPercentage) * 10) / 10
                    : 0;

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

            perFactoryPlans.set(deficit.nodeId, {
                planNumber: planNum,
                title: planTitle,
                criterion: crit,
                coveredDeficitPercentage: Math.round(totalCoveredPercentage * 10) / 10,
                remainingDeficitPercentage: remainingDeficit,
                totalExtraCostUsd: weightedCostSum,
                averageExtraLeadTimeDays: avgLeadTime,
                options,
            });
        }

        return perFactoryPlans;
    };

    const costPlansByFactory = buildCriterionResults('cost', 1, '1안: 비용 우선');
    const leadTimePlansByFactory = buildCriterionResults('leadTime', 2, '2안: 운송시간 우선');
    const balancedPlansByFactory = buildCriterionResults('balanced', 3, '3안: 밸런스');

    for (const deficit of effectiveDeficitItems) {
        const targetNode = nodeMap.get(deficit.nodeId);
        if (!targetNode) continue;

        const p1 = costPlansByFactory.get(deficit.nodeId);
        const p2 = leadTimePlansByFactory.get(deficit.nodeId);
        const p3 = balancedPlansByFactory.get(deficit.nodeId);

        const plans = [p1, p2, p3].filter((p): p is ReroutingProposalPlan => p !== undefined);
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

