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
    const maxDeficit = sortedDeficits.length > 0 ? sortedDeficits[0].deficitPercentage : 0;
    const deficitCount = sortedDeficits.filter((d) => d.deficitPercentage > 0).length;

    return (
        <div
            className="border border-border/40 bg-muted/20 rounded-lg shadow-xs shrink-0 h-[400px] max-h-[400px] flex flex-col overflow-hidden"
            aria-label="시뮬레이션 결과"
            role="region"
        >
            <div className="p-3 flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-xs text-foreground bg-card/80 border border-border/40 rounded-lg p-2.5 shadow-2xs shrink-0">
                    <div className="text-center border-r border-border/40">
                        <div className="text-[10px] text-muted-foreground">영향 노드</div>
                        <div className="font-semibold text-foreground mt-0.5">{result.deficits.length}개</div>
                    </div>
                    <div className="text-center border-r border-border/40">
                        <div className="text-[10px] text-muted-foreground">최대 부족률</div>
                        <div className="font-semibold text-red-400 mt-0.5">{maxDeficit.toFixed(1)}%</div>
                    </div>
                    <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">실행 시간</div>
                        <div className="font-mono text-muted-foreground mt-0.5">{formatExecutionTime(result.executionTimeMs)}</div>
                    </div>
                </div>

                {sortedDeficits.length > 0 && (
                    <div className="border border-border/40 rounded-lg bg-card/60 shadow-2xs flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs border-collapse" aria-label="부족률 테이블">
                            <thead>
                                <tr className="bg-muted/40 border-b border-border/40 text-muted-foreground sticky top-0">
                                    <th className="text-left py-1.5 px-2.5 font-medium">노드</th>
                                    <th className="text-right py-1.5 px-2.5 font-medium">부족률</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDeficits.map((d, index) => {
                                    const node = nodes.find((n) => n.id === d.nodeId);
                                    const nameStr = node
                                        ? `${node.name} (${node.country === 'NA' ? '' : getCountryDisplayName(node.country) + ', '}${getNodeTypeLabel(node.type)})`
                                        : d.nodeId;
                                    const hasDeficit = d.deficitPercentage > 0;
                                    return (
                                        <tr key={`${d.nodeId}-${index}`} className="border-b border-border/30 last:border-b-0 text-foreground hover:bg-muted/40">
                                            <td className="py-1.5 px-2.5 font-normal text-[11px] truncate max-w-[190px]" title={nameStr}>
                                                {nameStr}
                                            </td>
                                            <td className="text-right py-1.5 px-2.5">
                                                {hasDeficit ? (
                                                    <span className="inline-block text-[10px] font-semibold text-red-400 bg-red-950/30 border border-red-800/30 px-1.5 py-0.5 rounded">
                                                        {d.deficitPercentage.toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="inline-block text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded">
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
                        className="w-full shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-2 rounded-lg shadow-sm cursor-pointer transition-all flex items-center justify-center gap-2"
                    >
                        <Route className="w-3.5 h-3.5" />
                        대체 공급망 최적화 시나리오 추천 ({deficitCount}개 노드 해소)
                    </Button>
                )}
            </div>
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
        <Card className="border border-border bg-muted/40 flex-1 min-h-0 flex flex-col shadow-xs">
            <CardHeader className="p-3.5 pb-0">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    시뮬레이션 이력 ({entries.length})
                </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 pt-3 flex-1 min-h-0 flex flex-col">
                {isLoading && (
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
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
                                className="w-full flex flex-col items-start gap-1 p-2 bg-card hover:bg-muted border border-border rounded-md cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-left shadow-xs"
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
            </CardContent>
        </Card>
    );
}
