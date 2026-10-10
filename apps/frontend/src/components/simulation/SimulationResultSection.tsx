import type { SimulationResult } from '@navigator/shared';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { useSimulationStore, type HistoryEntry } from '../../store/simulation-store';
import { getCountryDisplayName, getNodeTypeLabel } from '../../utils/graph-helpers';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { X, Route } from 'lucide-react';

export function formatExecutionTime(ms: number): string {
    if (ms < 1) {
        return `${ms.toFixed(2)}ms`;
    }
    if (ms < 10) {
        return `${ms.toFixed(1)}ms`;
    }
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 시뮬레이션 결과 요약 및 부족률 테이블 컴포넌트.
 * Requirements 7.6 구현: 영향받은 노드 수, 최대 부족률, 부족률 내림차순 테이블.
 */
export function SimulationResultSection({
    result,
    onClear,
}: {
    result: SimulationResult;
    onClear?: () => void;
}) {
    const { nodes } = useSupplyChainStore();
    const { triggerRerouteCalculation, isRerouteLoading } = useSimulationStore();

    // 부족률 내림차순 정렬
    const sortedDeficits = [...result.deficits].sort(
        (a, b) => b.deficitPercentage - a.deficitPercentage,
    );
    const deficitCount = sortedDeficits.filter((d) => d.deficitPercentage > 0).length;

    // 총 부족량(톤) 및 평균 부족률(%) 계산
    let totalDeficitTons = 0;
    let sumDeficitPercentage = 0;

    sortedDeficits.forEach((d) => {
        sumDeficitPercentage += d.deficitPercentage;
        const node = nodes.find((n) => n.id === d.nodeId);
        const capacity = Number(node?.metadata?.productionCapacity) || 50000;
        const capacityUnit = (node?.metadata?.capacityUnit as string) || '';
        const lithiumRatio = (node?.type === 'Factory' || capacityUnit === 'tons_cathode') ? 0.48 : 1.0;
        totalDeficitTons += Math.round((capacity * (d.deficitPercentage / 100)) * lithiumRatio);
    });

    const avgDeficit = sortedDeficits.length > 0 ? sumDeficitPercentage / sortedDeficits.length : 0;

    const formatTonsHeader = (tons: number) => {
        return `${tons.toLocaleString()}톤`;
    };

    return (
        <div
            className="flex flex-col space-y-3 shrink-0"
            aria-label="시뮬레이션 결과"
            role="region"
        >
            {/* 상단 핵심 메트릭 3종 (영향 노드, 총 부족량, 평균 부족률) - 흰색 투명 배경 */}
            <div className="grid grid-cols-3 text-xs text-foreground bg-white/5 dark:bg-white/5 rounded-[4px] p-1 shadow-none shrink-0">
                <div className="text-center py-1.5 px-1 flex flex-col justify-center">
                    <div className="text-[10px] text-muted-foreground">영향 노드</div>
                    <div className="font-semibold text-foreground mt-0.5">{result.deficits.length}개</div>
                </div>
                <div className="text-center py-1.5 px-1 flex flex-col justify-center">
                    <div className="text-[10px] text-muted-foreground">총 부족량</div>
                    <div className="font-semibold text-foreground/90 mt-0.5" title={`${totalDeficitTons.toLocaleString()}톤`}>
                        {formatTonsHeader(totalDeficitTons)}
                    </div>
                </div>
                <div className="text-center py-1.5 px-1 flex flex-col justify-center">
                    <div className="text-[10px] text-muted-foreground">평균 부족률</div>
                    <div className="font-semibold text-red-400 mt-0.5">{avgDeficit.toFixed(1)}%</div>
                </div>
            </div>

            {/* 부족량/부족률 테이블 (3컬럼) */}
            {sortedDeficits.length > 0 && (
                <div className="max-h-[170px] overflow-y-auto custom-scrollbar shrink-0 px-0.5">
                    <table className="w-full text-xs border-collapse" aria-label="부족량 및 부족률 테이블">
                        <thead>
                            <tr className="border-b border-border/30 text-muted-foreground sticky top-0 bg-card">
                                <th className="text-left py-1.5 px-2 font-medium text-[11px]">노드</th>
                                <th className="text-right py-1.5 px-2 font-medium text-[11px]">부족량</th>
                                <th className="text-right py-1.5 px-2 font-medium text-[11px]">부족률</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {sortedDeficits.map((d, index) => {
                                const node = nodes.find((n) => n.id === d.nodeId);
                                const displayName = node ? node.name : d.nodeId;
                                const hasDeficit = d.deficitPercentage > 0;

                                // 결손량 톤수 계산 (양극재 공장의 경우 LCE 리튬 투입비 0.48 적용)
                                const capacity = Number(node?.metadata?.productionCapacity) || 50000;
                                const capacityUnit = (node?.metadata?.capacityUnit as string) || '';
                                const lithiumRatio = (node?.type === 'Factory' || capacityUnit === 'tons_cathode') ? 0.48 : 1.0;
                                const deficitTons = Math.round((capacity * (d.deficitPercentage / 100)) * lithiumRatio);

                                const formatTons = (tons: number) => {
                                    return `${tons.toLocaleString()}톤`;
                                };

                                return (
                                    <tr key={`${d.nodeId}-${index}`} className="text-foreground hover:bg-slate-700/30 transition-colors rounded-[3px]">
                                        <td className="py-1.5 px-2 font-normal text-[11px] truncate max-w-[140px]" title={displayName}>
                                            {displayName}
                                        </td>
                                        <td className="text-right py-1.5 px-2 text-[11px] font-normal text-foreground/90 whitespace-nowrap">
                                            {hasDeficit ? formatTons(deficitTons) : '-'}
                                        </td>
                                        <td className="text-right py-1.5 px-2 whitespace-nowrap">
                                            {hasDeficit ? (
                                                <span className="inline-block text-[10px] font-semibold text-red-400 bg-red-950/20 px-1.5 py-0.5 rounded-[3px]">
                                                    {d.deficitPercentage.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="inline-block text-[10px] text-muted-foreground/70 px-1.5 py-0.5">
                                                    0.0%
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Step 2: 대안 탐색 메인 CTA 버튼 */}
            {deficitCount > 0 && (
                <Button
                    onClick={triggerRerouteCalculation}
                    disabled={isRerouteLoading}
                    variant="default"
                    className="w-full shrink-0 h-8 shadow-xs text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover cursor-pointer transition-colors rounded-[4px] flex items-center justify-center gap-1.5"
                >
                    <Route className="w-3.5 h-3.5" />
                    <span>대체 공급망 최적안 추천</span>
                    <span className="text-[10px] font-normal opacity-85">({deficitCount}개 노드 해소)</span>
                </Button>
            )}
        </div>
    );
}

/**
 * 시뮬레이션 이력 섹션 컴포넌트.
 * 실행된 시뮬레이션 이력 목록을 표시하고, 클릭 시 결과를 재로드한다.
 */
export function SimulationHistorySection({
    entries,
    isLoading,
    onEntryClick,
}: {
    entries: HistoryEntry[];
    isLoading: boolean;
    onEntryClick: (scenarioId: string) => void;
}) {
    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="text-[11px] font-semibold text-muted-foreground px-0.5 mb-2">
                시뮬레이션 이력 ({entries.length})
            </div>

            {isLoading && (
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 px-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                    이력 로드 중...
                </div>
            )}

            <ul
                className="m-0 p-0 list-none flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1"
                aria-label="시뮬레이션 이력 목록"
                role="list"
            >
                {entries.map((entry, index) => (
                    <li key={`${entry.scenarioId}-${index}`}>
                        <button
                            onClick={() => onEntryClick(entry.scenarioId)}
                            disabled={isLoading}
                            className="w-full flex flex-col items-start gap-1 p-2 bg-transparent hover:bg-slate-700/40 rounded-[4px] cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-left"
                            aria-label={`이력: ${entry.name}, 실행 시간 ${formatExecutionTime(entry.result.executionTimeMs)}`}
                        >
                            <span className="text-xs font-semibold text-foreground">
                                {entry.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {entry.executedAt.toLocaleString('ko-KR')} • {formatExecutionTime(entry.result.executionTimeMs)}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
