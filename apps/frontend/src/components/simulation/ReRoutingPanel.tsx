import React, { useState } from 'react';
import type { ReroutingResult, ReroutingOption, ReroutingProposalPlan } from '@navigator/shared';
import { useSimulationStore } from '../../store/simulation-store';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Route, Loader2, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
            <Card className="border border-border bg-muted/40 shadow-sm shrink-0 min-h-[330px] flex flex-col justify-center items-center text-center p-4 rounded-[4px]">
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
                className="border-t border-border/40 pt-3 flex flex-col space-y-2.5 shrink-0 text-foreground"
                aria-label="대체 공급망 최적화 추천 결과"
                role="region"
            >
                {/* 상단 타이틀 영역 */}
                <div className="flex items-center justify-between px-0.5">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Route className="w-3.5 h-3.5 text-muted-foreground" />
                        통합 대체 공급망 시나리오
                    </div>
                    {isIdenticalPlan && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] text-primary border border-[#0EA5E9]/50 tracking-tight">
                            비용·시간 단일 최적안
                        </span>
                    )}
                </div>

                {/* 2. 언더바 형태 탭 (1안과 2안이 서로 다를 때만 탭 표시) */}
                {plans.length > 0 && !isIdenticalPlan && (
                    <div className="flex border-b border-border/40 text-xs shrink-0">
                        {plans
                            .filter((p) => p.planNumber !== 3 /* 3안(밸런스) 탭 숨김 처리 */)
                            .map((p) => {
                                const isSelected = p.planNumber === selectedPlanNumber;
                                const label = p.criterion === 'cost' ? '비용 우선' : p.criterion === 'leadTime' ? '시간 우선' : '밸런스';
                                return (
                                    <button
                                        key={p.planNumber}
                                        type="button"
                                        onClick={() => setSelectedPlanNumber(p.planNumber)}
                                        className={`flex-1 py-1.5 text-center transition-all cursor-pointer font-medium -mb-[1px] border-b-2 ${isSelected
                                            ? 'border-primary text-primary font-semibold'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {p.planNumber}안 ({label})
                                    </button>
                                );
                            })}
                    </div>
                )}

                {/* 비상 대응 상태 (2차원 지표 매트릭스: 잔여 부족률 > 30% && 해결률 < 40%) 상태 배너 */}
                {currentPlan.emergencyPackage && (
                    <div className="pt-1">
                        {currentPlan.emergencyPackage.statusLevel === 'CRITICAL' ? (
                            <div className="px-2.5 py-2 rounded-[4px] bg-muted/40 border border-border/70 flex flex-col gap-1 shadow-2xs">
                                <div className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-1.5 font-semibold text-foreground tracking-tight">
                                        <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />
                                        <span>구조적 수급 한계 경보 (CRITICAL)</span>
                                    </div>
                                    <span className="text-[9.5px] font-mono text-muted-foreground">
                                        해결률 {currentPlan.emergencyPackage.coverageRate}%
                                    </span>
                                </div>
                                <div className="text-[9.5px] text-muted-foreground leading-relaxed pl-5">
                                    비중국계 정제소 여유 캐파 한계로 스팟 우회만으로는 대부분 잔여합니다. 다단계 비상 대응 프로토콜 검토가 필요합니다.
                                </div>
                            </div>
                        ) : currentPlan.emergencyPackage.statusLevel === 'MODERATE' ? (
                            <div className="px-2.5 py-2 rounded-[4px] bg-muted/40 border border-border/70 flex flex-col gap-1 shadow-2xs">
                                <div className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-1.5 font-semibold text-foreground tracking-tight">
                                        <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />
                                        <span>부분 조달 주의 (MODERATE)</span>
                                    </div>
                                    <span className="text-[9.5px] font-mono text-muted-foreground">
                                        해결률 {currentPlan.emergencyPackage.coverageRate}%
                                    </span>
                                </div>
                                <div className="text-[9.5px] text-muted-foreground leading-relaxed pl-5">
                                    우회 조달을 통해 일부 결손을 충당하나 잔여 리스크가 존재합니다. 추가적인 공급망 다변화 및 전략 비축 검토를 권장합니다.
                                </div>
                            </div>
                        ) : (
                            <div className="px-2.5 py-2 rounded-[4px] bg-muted/40 border border-border/70 flex items-center justify-between text-[10px] shadow-2xs">
                                <div className="flex items-center gap-1.5 font-semibold text-foreground tracking-tight">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>대체 수급 안정 (RESOLVED)</span>
                                </div>
                                <span className="text-[9.5px] font-mono text-muted-foreground">
                                    해결률 {currentPlan.emergencyPackage.coverageRate}%
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. 플랫 리스트 구조 */}
                <div className="space-y-0.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {currentPlan.options.map((opt) => (
                        <div
                            key={`${opt.rank}-${opt.sourceNodeId}`}
                            onClick={() => {
                                setModalOption(opt);
                                setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-[4px] bg-transparent hover:bg-slate-700/40 space-y-0.5 transition-colors cursor-pointer group"
                            title="클릭하여 노드간 세부 물량 수급 관계 보기"
                        >
                            <div className="flex items-center justify-between gap-1 text-[10.5px] text-foreground">
                                <span className="truncate font-semibold group-hover:text-foreground transition-colors flex items-center gap-1 min-w-0 flex-1" title={`${opt.rank}차 수급: ${opt.sourceName}`}>
                                    <span className="shrink-0 text-muted-foreground font-normal">{opt.rank}차:</span>
                                    <span className="truncate">{opt.sourceName}</span>
                                    <Info className="w-2.5 h-2.5 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                                </span>
                                <span className="font-semibold text-foreground/90 shrink-0 text-[10.5px] ml-1">
                                    {opt.allocatedVolumeTons.toLocaleString()}톤 <span className="text-[10px] font-normal text-muted-foreground">({opt.coveredDeficitPercentage}%p)</span>
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[9.5px] text-muted-foreground/80 pt-0.5">
                                <div>추가 단가 <strong className="text-emerald-400 font-medium">+${opt.costImpact.unitExtraCostUsd}/톤</strong></div>
                                <div>리드타임 <strong className="text-emerald-400 font-medium">+{opt.leadTimeImpact.additionalDays}일</strong> (총 {opt.leadTimeImpact.totalDays}일)</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 4. 하단 요약 2줄 레이아웃 (비용/시간 & 총 조달량/평균 부족률) */}
                {(() => {
                    const totalAllocatedTons = currentPlan.options.reduce((sum, o) => sum + o.allocatedVolumeTons, 0);
                    const costFormatted = currentPlan.totalExtraCostUsd >= 1000000
                        ? `+$${(currentPlan.totalExtraCostUsd / 1000000).toFixed(1)}M`
                        : `+$${currentPlan.totalExtraCostUsd.toLocaleString()}`;

                    return (
                        <div className="pt-2 border-t border-border/40 flex flex-col gap-1.5 text-[11px] text-muted-foreground shrink-0 px-0.5">
                            {/* 1행: 추가비용, 총 조달량, 리드타임 */}
                            <div className="flex items-center justify-between whitespace-nowrap text-[10px]">
                                <span>
                                    추가비용 <strong className="text-emerald-400 font-semibold">{costFormatted}</strong>
                                </span>
                                <span>
                                    총 조달량: <strong className="font-semibold text-foreground">{totalAllocatedTons.toLocaleString()}톤</strong>
                                </span>
                                <span>
                                    리드타임 <strong className="text-emerald-400 font-semibold">+{currentPlan.averageExtraLeadTimeDays}일</strong>
                                </span>
                            </div>

                            {/* 2행: 최종 수요처 평균 부족률 */}
                            <div className="flex items-center justify-end whitespace-nowrap text-[10px]">
                                <span>
                                    {activeResult.isGlobalCombined ? '평균 부족률' : '부족률'}: <strong className="text-muted-foreground">{activeResult.originalDeficitPercentage.toFixed(1)}%</strong> <span className="text-emerald-400 font-bold mx-0.5">→</span> <strong className="text-emerald-400 font-semibold">{currentPlan.remainingDeficitPercentage.toFixed(1)}%</strong>
                                </span>
                            </div>
                        </div>
                    );
                })()}

                {/* 5. AI 인사이트 연계 버튼 (하단 고정 Sticky Footer) */}
                <div className="sticky bottom-0 z-10 pt-2 pb-0.5 bg-background/95 backdrop-blur-sm border-t border-border/40 shrink-0 mt-2">
                    <Button
                        type="button"
                        onClick={() => {
                            const pkg = currentPlan.emergencyPackage;
                            let query = '';

                            if (pkg && pkg.statusLevel === 'CRITICAL') {
                                // 현재 시뮬레이션에서 실제로 결손이 발생한 말단 노드 목록 추출
                                const simResult = useSimulationStore.getState().result;
                                const allNodes = useSupplyChainStore.getState().nodes;
                                const nodeMap = new Map(allNodes.map(n => [n.id, n]));

                                const deficitNodes = (simResult?.deficits || [])
                                    .filter(d => d.deficitPercentage > 0 && d.nodeId !== 'GLOBAL_TOTAL')
                                    .map(d => {
                                        const node = nodeMap.get(d.nodeId);
                                        return node ? `${node.name}(${node.country}, ${node.type})` : d.nodeId;
                                    });
                                const deficitNodesText = deficitNodes.length > 0 ? deficitNodes.join(', ') : '영향 노드';

                                query = `[비상대응 전략 보고서 요청] 핵심광물 공급 차질로 LCE 결손량 ${pkg.totalRequiredLithiumTons.toLocaleString()}톤(부족률 ${activeResult.originalDeficitPercentage}%)이 발생하였으나, 스팟 우회 조달은 ${pkg.spotAllocatedTons.toLocaleString()}톤(해결률 ${pkg.coverageRate}%)에 그쳤습니다.
현재 결손이 발생한 대상 노드[${deficitNodesText}]의 소재 국가(국내 vs 해외) 및 공정·화학조성 특성을 종합 분석하여, 정부와 글로벌 완성차/배터리 제조사가 실행해야 할 [다단계 비상 대응 프로토콜] 종합 의사결정 전략 보고서를 아래 3개 대제목 구조로 작성해 줘:

1. 결손 대상 노드 특성 분석
2. 다단계 비상 대응 프로토콜 (2.1 스팟 우회 / 2.2 정부 비축 / 2.3 폐배터리 리사이클링 / 2.4 수요 관리·감산 / 2.5 통상 외교 예외 대응)
3. 결론: 단계별 결손 해소 및 평균 부족률 감축 로드맵 (초기 부족률 ${activeResult.originalDeficitPercentage}% ➔ 스팟 우회 ${currentPlan.remainingDeficitPercentage.toFixed(1)}% ➔ 정부 비축 ➔ 리사이클링 ➔ 감산/제품 전환 적용 시, 최종 수요처 평균 부족률 단계별 종합 요약표 및 핵심 대응 방안)`;
                            } else {
                                query = `현재 시뮬레이션에서 발생한 리튬 공급 결손(원래 부족률 ${activeResult.originalDeficitPercentage}%)에 대해 ${currentPlan.title} (${currentPlan.options.map(o => o.sourceName).join(', ')}) 대체 공급망이 제안되었습니다. 이 대체 공급망의 IRA Section 30D / FEOC 규제 적격성과 IEA/USGS 수급 타당성을 종합 분석해 줘.`;
                            }

                            useSupplyChainStore.getState().setDraftAIQuery(query);
                            useSupplyChainStore.getState().setShowAIPanel(true);
                        }}
                        className={`w-full h-8 font-semibold text-xs py-2 rounded-[4px] shadow-sm border cursor-pointer transition-all duration-200 flex items-center justify-center gap-1.5 group ${currentPlan.emergencyPackage?.statusLevel === 'CRITICAL'
                            ? 'bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 text-[#fef3c7] border-[#fbbf24]/40 hover:border-[#fbbf24]/70'
                            : 'bg-white/10 hover:bg-white/20 text-white border-white/25 hover:border-white/45'
                            }`}
                        title={currentPlan.emergencyPackage?.statusLevel === 'CRITICAL' ? '구조적 결손 극복을 위한 비상 대응 종합 전략 보고서를 AI에게 요청합니다.' : '선택된 대체 공급망의 규제 검증 질의를 AI 입력창에 자동으로 입력합니다.'}
                    >
                        <GiDiamonds className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110 ${currentPlan.emergencyPackage?.statusLevel === 'CRITICAL'
                            ? 'text-[#fbbf24] drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                            : 'text-primary drop-shadow-[0_0_4px_rgba(59,130,246,0.6)]'
                            }`} />
                        <span className="tracking-tight text-[11px]">
                            {currentPlan.emergencyPackage?.statusLevel === 'CRITICAL'
                                ? 'AI 비상 대응 전략 보고서 생성'
                                : 'AI 타당성 검증'}
                        </span>
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
