import { useEffect, useState } from 'react';
import type { TraceabilityReport, EsgStatus } from '@navigator/shared';
import { ArrowLeft } from 'lucide-react';

export interface TraceabilityPanelProps {
    factoryNodeId: string;
    factoryName: string;
    onClose: () => void;
}

/** ESG 상태 배지 컴포넌트 */
function EsgStatusBadge({ status }: { status: EsgStatus }) {
    switch (status) {
        case 'compliant':
            return (
                <span className="px-1.5 py-0 rounded-[3px] text-[10px] font-bold shrink-0 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    준수
                </span>
            );
        case 'non_compliant':
            return (
                <span className="px-1.5 py-0 rounded-[3px] text-[10px] font-bold shrink-0 bg-destructive/10 text-destructive border border-destructive/30">
                    미준수
                </span>
            );
        case 'unverified':
            return (
                <span className="px-1.5 py-0 rounded-[3px] text-[10px] font-bold shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    미검증
                </span>
            );
        case 'unknown':
        default:
            return (
                <span className="px-1.5 py-0 rounded-[3px] text-[10px] font-medium shrink-0 bg-muted/20 text-muted-foreground border border-border/80 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/90 shrink-0" />
                    <span>알 수 없음</span>
                </span>
            );
    }
}

/**
 * ESG 역추적 사이드 패널.
 * Factory 노드의 원재료 출처, 처리 단계, 인증 정보, 미검증 경로 경고를 표시한다.
 * Requirements 11.1~11.4 구현.
 */
export function TraceabilityPanel({ factoryNodeId, factoryName, onClose }: TraceabilityPanelProps) {
    const [report, setReport] = useState<TraceabilityReport | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 역추적 보고서 로딩
    useEffect(() => {
        const fetchTrace = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/trace/${factoryNodeId}`);
                if (!response.ok) {
                    throw new Error(`역추적 데이터를 불러올 수 없습니다 (${response.status})`);
                }
                const data = await response.json();
                setReport(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : '역추적 데이터 로딩 실패');
            } finally {
                setIsLoading(false);
            }
        };

        fetchTrace();
    }, [factoryNodeId]);

    return (
        <aside
            className="absolute top-0 right-0 w-[380px] h-full bg-card border-l border-border p-4 overflow-y-auto shadow-2xl z-20 flex flex-col font-sans text-foreground"
            aria-label="ESG 역추적 패널"
        >
            {/* 헤더 영역 */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                <h2 className="text-base font-bold text-foreground tracking-tight">ESG 역추적 분석</h2>
                <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-[4px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    aria-label="뒤로가기"
                    title="뒤로가기"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
            </div>

            {/* Factory 이름 카드 */}
            <div className="p-3 bg-muted/30 border border-border rounded-[4px] shadow-xs mb-4">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">대상 시설 (Factory)</span>
                <h3 className="text-sm font-bold text-foreground tracking-tight">{factoryName}</h3>
            </div>

            {/* 로딩 상태 */}
            {isLoading && (
                <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
                    ESG 역추적 데이터 로딩 중...
                </div>
            )}

            {/* 에러 상태 */}
            {error && (
                <div className="p-3 bg-destructive/10 border border-destructive rounded-[4px] text-destructive text-xs font-medium flex items-center gap-1.5 mb-4">
                    ⚠ {error}
                </div>
            )}

            {/* 보고서 내용 */}
            {report && !isLoading && (
                <div className="space-y-5 flex-1">
                    {/* 원산지(광산) 섹션 */}
                    <section>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2.5 flex items-center justify-between">
                            <span>원산지 (광산)</span>
                            <span className="text-muted-foreground font-normal">({report.sourceOrigins.length}개)</span>
                        </h4>
                        {report.sourceOrigins.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-[4px] border border-dashed border-border text-center">원산지 정보 없음</p>
                        ) : (
                            <ul className="space-y-2 m-0 p-0 list-none">
                                {report.sourceOrigins.map((origin) => (
                                    <li
                                        key={origin.mineNodeId}
                                        className="p-3 bg-muted/30 rounded-[4px] border border-border/70 text-xs shadow-xs space-y-2"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="font-semibold text-foreground truncate">{origin.mineName}</div>
                                            <EsgStatusBadge status={origin.esgStatus} />
                                        </div>
                                        <div className="space-y-1.5 pt-1.5 border-t border-border/40 text-[11px]">
                                            <div className="text-muted-foreground font-medium">{origin.country}</div>
                                            {origin.certifications && origin.certifications.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {origin.certifications.map((cert) => (
                                                        <span
                                                            key={cert}
                                                            className="px-1.5 py-0 rounded-[2px] text-[9px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/80"
                                                        >
                                                            {cert}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-[9px] text-muted-foreground/60 italic">인증 미등록</div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* 처리 단계 섹션 */}
                    <section>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2.5 flex items-center justify-between">
                            <span>공급망 처리 단계</span>
                            <span className="text-muted-foreground font-normal">({report.processingStages.length}단계)</span>
                        </h4>
                        {report.processingStages.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-[4px] border border-dashed border-border text-center">처리 단계 정보 없음</p>
                        ) : (
                            <ol className="space-y-2 m-0 p-0 list-none">
                                {report.processingStages.map((stage, idx) => (
                                    <li key={stage.nodeId} className="p-3 bg-muted/30 rounded-[4px] border border-border/70 text-xs shadow-xs space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5 font-semibold text-foreground min-w-0">
                                                <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                                                <span className="truncate">{stage.nodeName}</span>
                                                <span className="font-normal text-muted-foreground text-[11px] shrink-0">
                                                    ({stage.nodeType})
                                                </span>
                                            </div>
                                            <EsgStatusBadge status={stage.esgStatus} />
                                        </div>
                                        <div className="space-y-1.5 pl-5 pt-1.5 border-t border-border/40 text-[11px]">
                                            <div className="text-muted-foreground">{stage.country}</div>
                                            {stage.certifications && stage.certifications.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {stage.certifications.map((cert) => (
                                                        <span
                                                            key={cert}
                                                            className="px-1.5 py-0 rounded-[2px] text-[9px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/80"
                                                        >
                                                            {cert}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-[9px] text-muted-foreground/60 italic">인증 미등록</div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>

                    {/* 미검증 경로 경고 섹션 */}
                    {report.flaggedPaths.length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="text-amber-400/90 text-xs">⚠</span>
                                <span>미검증 경로 경고</span>
                                <span className="text-muted-foreground/80 font-normal">({report.flaggedPaths.length})</span>
                            </h4>
                            <ul className="space-y-2 m-0 p-0 list-none">
                                {report.flaggedPaths.map((flagged) => (
                                    <li
                                        key={flagged.pathIndex}
                                        className="p-3 bg-muted/20 border border-border/60 rounded-[4px] text-xs space-y-1.5 shadow-xs"
                                    >
                                        <div className="text-foreground/90 font-medium flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" />
                                            <span>{flagged.reason}</span>
                                        </div>
                                        <div className="text-muted-foreground text-[11px] pl-3">
                                            미검증 노드: {flagged.unverifiedNodes.map((n) => n.nodeName).join(', ')}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* 미검증 경로 없음 표시 */}
                    {!report.hasUnverifiedPaths && report.sourceOrigins.length > 0 && (
                        <div className="py-2.5 px-3 bg-muted/20 rounded-[4px] text-xs font-medium text-muted-foreground text-center flex items-center justify-center gap-1.5">
                            <span className="text-emerald-400/90">✓</span>
                            <span>모든 경로가 ESG 검증 완료되었습니다.</span>
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
}
