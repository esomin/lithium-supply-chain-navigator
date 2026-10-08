import React, { useState } from 'react';
import type { ReroutingResult, ReroutingOption, ReroutingProposalPlan } from '@navigator/shared';
import { useSimulationStore } from '../../store/simulation-store';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Route, Loader2, Info } from 'lucide-react';
import { GiDiamonds } from 'react-icons/gi';
import { SupplyDetailModal } from './SupplyDetailModal';

interface ReRoutingPanelProps {
    reroutingResults: ReroutingResult[];
}

export const ReRoutingPanel: React.FC<ReRoutingPanelProps> = ({
    reroutingResults,
}) => {
    const {
        isRerouteLoading,
        isRerouteApplied,
        selectedPlanNumber,
        setSelectedPlanNumber,
    } = useSimulationStore();

    const [modalOption, setModalOption] = useState<ReroutingOption | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    if (isRerouteLoading) {
        const maxDeficit = reroutingResults.length > 0 ? reroutingResults[0].originalDeficitPercentage : 50;
        return (
            <Card className="border border-border bg-muted/40 shadow-sm shrink-0 min-h-[330px] flex flex-col justify-center items-center text-center p-4">
                <Loader2 className="w-5 h-5 text-primary animate-spin mb-2" />
                <div className="space-y-1">
                    <p className="text-xs font-bold text-foreground">대체 공급망 최적화 계산 중</p>
                    <p className="text-[11px] text-muted-foreground">
                        부족률 {maxDeficit}% 해소를 위한 대체 정제소 및 우회 물류 경로를 계산 중입니다...
                    </p>
                </div>
            </Card>
        );
    }

    if (!isRerouteApplied || !reroutingResults || reroutingResults.length === 0) {
        return null;
    }

    // 항상 전체 통합 시나리오(isGlobalCombined)를 최우선 결과로 선택
    const activeResult = reroutingResults.find((r) => r.isGlobalCombined || r.targetNodeId === 'GLOBAL_TOTAL') || reroutingResults[0];
    const plans: ReroutingProposalPlan[] = activeResult.plans || [];

    // 1안과 2안의 추가 비용 및 리드타임이 동일한지 판단
    const plan1 = plans.find((p) => p.planNumber === 1);
    const plan2 = plans.find((p) => p.planNumber === 2);
    const isIdenticalPlan = plan1 && plan2 &&
        plan1.totalExtraCostUsd === plan2.totalExtraCostUsd &&
        plan1.averageExtraLeadTimeDays === plan2.averageExtraLeadTimeDays;

    const defaultOptions: ReroutingOption[] = plans[0] ? plans[0].options : [];

    const currentPlan: ReroutingProposalPlan = plans.find((p) => p.planNumber === selectedPlanNumber) || plans[0] || {
        planNumber: 1,
        title: '비용 우선',
        criterion: 'cost',
        coveredDeficitPercentage: activeResult.originalDeficitPercentage - activeResult.remainingDeficitPercentage,
        remainingDeficitPercentage: activeResult.remainingDeficitPercentage,
        totalExtraCostUsd: activeResult.totalExtraCostUsd,
        averageExtraLeadTimeDays: activeResult.averageExtraLeadTimeDays,
        options: defaultOptions,
    };

    return (
        <>
            <div
                className="border border-border/40 bg-muted/20 rounded-lg shadow-xs shrink-0 min-h-[360px] flex flex-col overflow-hidden text-foreground"
                aria-label="대체 공급망 최적화 추천 결과"
                role="region"
            >
                <div className="p-3 pb-2 flex flex-col space-y-2 shrink-0 border-b border-border/40">
                    {/* 상단 타이틀 영역 */}
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Route className="w-3.5 h-3.5 text-muted-foreground" />
                            전역 통합 대체 공급망 시나리오
                        </div>
                    </div>
                </div>

                <div className="p-3 pt-2.5 flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar space-y-2.5">
                    {/* 2. 세그먼트 컨트롤 탭 (1안/2안 결과 동일 시 단일 최적안 통합 표시) */}
                    {plans.length > 0 && (
                        <div className="flex bg-muted/40 p-0.5 rounded-lg border border-border/40 text-[11px] shrink-0">
                            {isIdenticalPlan ? (
                                <div className="flex-1 py-1 rounded-md text-center bg-card text-foreground font-semibold shadow-2xs border border-border/40">
                                    비용·시간 단일 최적안
                                </div>
                            ) : (
                                plans
                                    .filter((p) => p.planNumber !== 3 /* 3안(밸런스) 탭 숨김 처리 */)
                                    .map((p) => {
                                        const isSelected = p.planNumber === selectedPlanNumber;
                                        const label = p.criterion === 'cost' ? '비용 우선' : p.criterion === 'leadTime' ? '시간 우선' : '밸런스';
                                        return (
                                            <button
                                                key={p.planNumber}
                                                type="button"
                                                onClick={() => setSelectedPlanNumber(p.planNumber)}
                                                className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${isSelected
                                                    ? 'bg-card text-foreground font-semibold shadow-2xs border border-border/40'
                                                    : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                            >
                                                {p.planNumber}안 ({label})
                                            </button>
                                        );
                                    })
                            )}
                        </div>
                    )}

                    {/* 3. 플랫 리스트 구조 (내용 과다 시 카드 내부 스크롤) */}
                    <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {currentPlan.options.map((opt) => (
                            <div
                                key={`${opt.rank}-${opt.sourceNodeId}`}
                                onClick={() => {
                                    setModalOption(opt);
                                    setIsModalOpen(true);
                                }}
                                className="p-2.5 rounded-lg border border-border/40 bg-card/70 space-y-1 transition-all cursor-pointer hover:border-primary/60 hover:bg-card group shadow-2xs"
                                title="클릭하여 노드간 세부 물량 수급 관계 보기"
                            >
                                <div className="flex items-center justify-between font-medium text-[11px] text-foreground">
                                    <span className="truncate font-semibold group-hover:text-primary transition-colors flex items-center gap-1">
                                        {opt.rank}차 수급: {opt.sourceName}
                                        <Info className="w-3 h-3 text-muted-foreground group-hover:text-primary opacity-60 transition-opacity" />
                                    </span>
                                    <span className="font-semibold text-sky-400 shrink-0">
                                        {opt.allocatedVolumeTons.toLocaleString()}톤 ({opt.coveredDeficitPercentage}%p)
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                                    <div>추가 단가 <strong className="text-emerald-400 font-medium">+${opt.costImpact.unitExtraCostUsd}/톤</strong></div>
                                    <div>리드타임 <strong className="text-emerald-400 font-medium">+{opt.leadTimeImpact.additionalDays}일</strong> (총 {opt.leadTimeImpact.totalDays}일)</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 4. 하단 요약 인라인 레이아웃 */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <span className="text-emerald-400">+${currentPlan.totalExtraCostUsd.toLocaleString()}</span>
                            <span>•</span>
                            <span className="text-emerald-400">+{currentPlan.averageExtraLeadTimeDays}일</span>
                        </div>
                        <div>
                            {activeResult.isGlobalCombined ? '평균 부족률' : '부족률'} <strong className="text-foreground">{activeResult.originalDeficitPercentage}%</strong> ➔ <strong className="text-foreground font-semibold">{currentPlan.remainingDeficitPercentage}%</strong>
                        </div>
                    </div>

                    {/* 5. AI 인사이트 정밀 규제 검증 & 대안 심층 분석 버튼 */}
                    <Button
                        type="button"
                        onClick={() => {
                            const query = `현재 시뮬레이션에서 발생한 리튬 공급 결손(원래 부족률 ${activeResult.originalDeficitPercentage}%)에 대해 ${currentPlan.title} (${currentPlan.options.map(o => o.sourceName).join(', ')}) 우회 경로가 제안되었습니다. 이 우회 경로의 IRA Section 30D / FEOC 규제 적격성과 IEA/USGS 수급 타당성을 종합 분석해 줘.`;
                            useSupplyChainStore.getState().triggerAIQuery(query);
                        }}
                        className="w-full shrink-0 mt-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs py-2 rounded-md shadow-sm border border-violet-500/30 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                        <GiDiamonds className="w-3.5 h-3.5 text-violet-200" />
                        대체 공급망 AI 규제 분석
                    </Button>
                </div>
            </div>

            {/* 수급 세부 내역 상세 모달 */}
            <SupplyDetailModal
                option={modalOption}
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </>
    );
};
