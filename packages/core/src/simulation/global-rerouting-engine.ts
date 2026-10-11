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
            // 실제 할당된 물량에 비례하여 통합 리드타임 가중합 누적
            weightedLeadTimeSum += opt.leadTimeImpact.additionalDays * opt.allocatedVolumeTons;
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

        // 2차원 복합 지표 매트릭스 (잔여 부족률 × 결손 해결 비율) 기반 비상 대응 패키지 생성
        const coverageRate = avgOriginalDeficit > 0
            ? Math.round(((totalCoveredDeficit / avgOriginalDeficit) * 100) * 10) / 10
            : 100;

        let statusLevel: 'CRITICAL' | 'MODERATE' | 'RESOLVED' = 'MODERATE';
        if (avgRemainingDeficit <= 10 || coverageRate >= 75) {
            statusLevel = 'RESOLVED';
        } else if (avgRemainingDeficit > 30 && coverageRate < 40) {
            statusLevel = 'CRITICAL';
        }

        // 전체 LCE 원료 필요 결손량 (화학양론비 0.48 반영)
        const totalRequiredLithiumTons = Math.round(totalDisruptedTons * 0.48);

        // 다단계 비상 대응 프로토콜 (Emergency Protocol Steps) 모델링
        const step1Tons = totalAllocatedVolume;
        const step1Relief = totalCoveredDeficit;

        // 2단계: 국가 전략 비축 방출 (KOMIR 군산 비축기지 리튬 비축분 긴급 대여)
        const step2Tons = statusLevel === 'CRITICAL'
            ? Math.min(30000, Math.round(totalRequiredLithiumTons * 0.20))
            : (statusLevel === 'MODERATE' ? Math.round(totalRequiredLithiumTons * 0.10) : 0);
        const step2Relief = totalRequiredLithiumTons > 0
            ? Math.round(((step2Tons / totalRequiredLithiumTons) * avgOriginalDeficit) * 10) / 10
            : 0;

        // 3단계: 폐배터리 리사이클링 긴급 회수 (성일하이텍 등 블랙매스 추출 원료 우선 배정)
        const step3Tons = statusLevel === 'CRITICAL'
            ? Math.min(20000, Math.round(totalRequiredLithiumTons * 0.12))
            : (statusLevel === 'MODERATE' ? Math.round(totalRequiredLithiumTons * 0.08) : 0);
        const step3Relief = totalRequiredLithiumTons > 0
            ? Math.round(((step3Tons / totalRequiredLithiumTons) * avgOriginalDeficit) * 10) / 10
            : 0;

        // 4단계: 수요/가동률 임시 조정 (하이니켈 감산 및 LFP/HEV 제품 믹스 전환)
        const remainingDeficitAfterSteps = Math.max(0, Math.round((avgRemainingDeficit - step2Relief - step3Relief) * 10) / 10);
        const step4Relief = remainingDeficitAfterSteps;
        const step4Tons = totalRequiredLithiumTons > 0
            ? Math.round((step4Relief / avgOriginalDeficit) * totalRequiredLithiumTons)
            : 0;

        const cumulativeReliefPercentage = Math.min(100, Math.round((step1Relief + step2Relief + step3Relief + step4Relief) * 10) / 10);

        const emergencyPackage = {
            statusLevel,
            coverageRate,
            residualDeficitPercentage: avgRemainingDeficit,
            totalRequiredLithiumTons,
            spotAllocatedTons: totalAllocatedVolume,
            cumulativeReliefPercentage,
            steps: [
                {
                    stepNumber: 1,
                    name: '스팟 우회 조달',
                    category: 'SPOT_REROUTE' as const,
                    allocatedVolumeTons: step1Tons,
                    reliefPercentage: step1Relief,
                    description: `비중국계 정제소(Umicore, POSCO 등 15% 여유 캐파) 긴급 스팟 계약`,
                    leadTimeDays: avgGlobalLeadTime,
                    agencyOrSource: mergedOptions.map((o) => o.sourceName).join(', ') || '대체 정제소',
                },
                {
                    stepNumber: 2,
                    name: '국가 전략 비축물량 긴급 방출',
                    category: 'STRATEGIC_STOCKPILE' as const,
                    allocatedVolumeTons: step2Tons,
                    reliefPercentage: step2Relief,
                    description: '한국광해광업공단(KOMIR) 군산 비축기지 핵심광물 60일분 비축분 긴급 대여',
                    leadTimeDays: 3.0,
                    agencyOrSource: '산업통상자원부 / KOMIR',
                },
                {
                    stepNumber: 3,
                    name: '배터리 리사이클링 긴급 회수',
                    category: 'RECYCLING_LOOP' as const,
                    allocatedVolumeTons: step3Tons,
                    reliefPercentage: step3Relief,
                    description: '국내 폐배터리 리사이클러(성일하이텍, 포스코HY클린메탈) 블랙매스 추출 리튬 우선 배정',
                    leadTimeDays: 7.0,
                    agencyOrSource: '국내 폐배터리 리사이클링 얼라이언스',
                },
                {
                    stepNumber: 4,
                    name: '수요 관리 및 가동률 조정',
                    category: 'DEMAND_CURTAILMENT' as const,
                    allocatedVolumeTons: step4Tons,
                    reliefPercentage: step4Relief,
                    description: '고용량 하이니켈 라인 일시 감산 및 LFP·하이브리드(HEV) 제품 믹스 전환 (가동률 60% 방어선 구축)',
                    leadTimeDays: 14.0,
                    agencyOrSource: '완성차 OEM 협의체',
                },
            ],
        };

        return {
            planNumber: planNum,
            title: planTitles[crit],
            criterion: crit,
            coveredDeficitPercentage: totalCoveredDeficit,
            remainingDeficitPercentage: avgRemainingDeficit,
            totalExtraCostUsd: globalTotalExtraCost,
            averageExtraLeadTimeDays: avgGlobalLeadTime,
            options: mergedOptions,
            emergencyPackage,
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
        emergencyPackage: defaultGlobalPlan.emergencyPackage,
    };
}
