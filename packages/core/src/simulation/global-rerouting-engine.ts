/**
 * 전역 통합 대체 우회 공급망 시나리오 엔진 (Global Combined Rerouting Engine)
 */

import type {
    SimulationResult,
    ReroutingResult,
    ReroutingOption,
    ReroutingProposalPlan,
    OptimizationCriterion,
} from '@navigator/shared';

/**
 * 개별 노드 시나리오 결과를 바탕으로 전역 통합 시나리오(GLOBAL_TOTAL)를 병합 및 합성한다.
 */
export function computeGlobalReroutingOption(
    individualResults: ReroutingResult[],
    simulationResult: SimulationResult,
    defaultCriterion: OptimizationCriterion = 'balanced',
): ReroutingResult | null {
    if (!individualResults || individualResults.length === 0) {
        return null;
    }

    const totalDisruptedTons = simulationResult.totalNetDeficitTons ?? individualResults.reduce((sum, r) => sum + r.defectQuantityTons, 0);
    const avgOriginalDeficit = simulationResult.averageDeficitPercentage ?? (
        Math.round(
            (individualResults.reduce((sum, r) => sum + r.originalDeficitPercentage, 0) / individualResults.length) * 10,
        ) / 10
    );

    const criteria: OptimizationCriterion[] = ['cost', 'leadTime', 'balanced'];
    const planTitles: Record<OptimizationCriterion, string> = {
        cost: '1안: 비용 우선',
        leadTime: '2안: 운송시간 우선',
        balanced: '3안: 밸런스',
    };

    const globalPlans: ReroutingProposalPlan[] = criteria.map((crit, critIndex) => {
        const planNum = (critIndex + 1) as 1 | 2 | 3;
        let globalTotalExtraCost = 0;
        let weightedLeadTimeSum = 0;
        let globalRemainingDeficitSum = 0;

        const supplierMap = new Map<string, ReroutingOption>();

        individualResults.forEach((nodeResult) => {
            const plan = nodeResult.plans?.find((p) => p.planNumber === planNum) || nodeResult.plans?.[0];
            if (!plan) return;

            globalTotalExtraCost += plan.totalExtraCostUsd;
            weightedLeadTimeSum += plan.averageExtraLeadTimeDays * (nodeResult.defectQuantityTons || 1);
            globalRemainingDeficitSum += plan.remainingDeficitPercentage;

            plan.options.forEach((opt) => {
                const existing = supplierMap.get(opt.sourceNodeId);
                const breakdownItem = {
                    targetNodeId: nodeResult.targetNodeId,
                    targetName: nodeResult.targetNodeName,
                    allocatedVolumeTons: opt.allocatedVolumeTons,
                    unitExtraCostUsd: opt.costImpact.unitExtraCostUsd,
                    additionalLeadTimeDays: opt.leadTimeImpact.additionalDays,
                    totalLeadTimeDays: opt.leadTimeImpact.totalDays,
                };

                if (existing) {
                    existing.allocatedVolumeTons += opt.allocatedVolumeTons;
                    existing.costImpact.totalExtraCostUsd += opt.costImpact.totalExtraCostUsd;
                    existing.targetBreakdown = existing.targetBreakdown || [];
                    existing.targetBreakdown.push(breakdownItem);
                } else {
                    supplierMap.set(opt.sourceNodeId, {
                        ...opt,
                        targetNodeId: opt.targetNodeId,
                        costImpact: { ...opt.costImpact },
                        leadTimeImpact: { ...opt.leadTimeImpact },
                        targetBreakdown: [breakdownItem],
                    });
                }
            });
        });

        const mergedOptions = Array.from(supplierMap.values());
        mergedOptions.sort((a, b) => b.allocatedVolumeTons - a.allocatedVolumeTons);

        const avgRemainingDeficit = Math.round((globalRemainingDeficitSum / individualResults.length) * 10) / 10;
        const totalCoveredDeficit = Math.max(0, Math.round((avgOriginalDeficit - avgRemainingDeficit) * 10) / 10);
        const totalAllocatedVolume = mergedOptions.reduce((sum, o) => sum + o.allocatedVolumeTons, 0);

        mergedOptions.forEach((opt, idx) => {
            opt.rank = idx + 1;
            // 통합 시나리오에서 각 수급처가 전체 해소된 부족률(64%p) 중 기여한 비중(%p) 계산
            opt.coveredDeficitPercentage = totalAllocatedVolume > 0
                ? Math.round((opt.allocatedVolumeTons / totalAllocatedVolume) * totalCoveredDeficit * 10) / 10
                : 0;
        });

        // 반올림 오차 보정 (합계가 totalCoveredDeficit과 정확히 일치하도록 1위에 보정)
        const currentSum = Math.round(mergedOptions.reduce((sum, o) => sum + (o.coveredDeficitPercentage || 0), 0) * 10) / 10;
        const diff = Math.round((totalCoveredDeficit - currentSum) * 10) / 10;
        if (mergedOptions.length > 0 && Math.abs(diff) > 0 && Math.abs(diff) < 2) {
            mergedOptions[0].coveredDeficitPercentage = Math.round(((mergedOptions[0].coveredDeficitPercentage || 0) + diff) * 10) / 10;
        }

        const avgGlobalLeadTime = totalAllocatedVolume > 0
            ? Math.round((weightedLeadTimeSum / totalAllocatedVolume) * 10) / 10
            : 0;

        return {
            planNumber: planNum,
            title: planTitles[crit],
            criterion: crit,
            coveredDeficitPercentage: totalCoveredDeficit,
            remainingDeficitPercentage: avgRemainingDeficit,
            totalExtraCostUsd: globalTotalExtraCost,
            averageExtraLeadTimeDays: avgGlobalLeadTime,
            options: mergedOptions,
        };
    });

    const defaultGlobalPlan = globalPlans.find((p) => p.criterion === defaultCriterion) || globalPlans[0];

    return {
        simulationId: simulationResult.scenarioId,
        targetNodeId: 'GLOBAL_TOTAL',
        targetNodeName: `전체 통합 (${individualResults.length}개 노드)`,
        isGlobalCombined: true,
        defectQuantityTons: totalDisruptedTons,
        originalDeficitPercentage: avgOriginalDeficit,
        remainingDeficitPercentage: defaultGlobalPlan.remainingDeficitPercentage,
        totalExtraCostUsd: defaultGlobalPlan.totalExtraCostUsd,
        averageExtraLeadTimeDays: defaultGlobalPlan.averageExtraLeadTimeDays,
        criterion: defaultCriterion,
        plans: globalPlans,
    };
}
