import React from 'react';
import { createPortal } from 'react-dom';
import type { ReroutingOption } from '@navigator/shared';
import { X, Truck, DollarSign, Clock, Layers, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';

interface SupplyDetailModalProps {
    option: ReroutingOption | null;
    open: boolean;
    onClose: () => void;
}

export const SupplyDetailModal: React.FC<SupplyDetailModalProps> = ({
    option,
    open,
    onClose,
}) => {
    React.useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open || !option) return null;

    const breakdown = option.targetBreakdown || [
        {
            targetNodeId: option.targetNodeId,
            targetName: option.targetName,
            allocatedVolumeTons: option.allocatedVolumeTons,
            unitExtraCostUsd: option.costImpact.unitExtraCostUsd,
            additionalLeadTimeDays: option.leadTimeImpact.additionalDays,
            totalLeadTimeDays: option.leadTimeImpact.totalDays,
        },
    ];

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 pointer-events-auto"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-4xl bg-accent border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-foreground"
                role="dialog"
                aria-modal="true"
                aria-labelledby="supply-detail-modal-title"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 모달 상단 헤더 */}
                <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                            {option.rank}차
                        </div>
                        <div>
                            <h2 id="supply-detail-modal-title" className="text-sm font-bold text-foreground flex items-center gap-2">
                                {option.sourceName}
                                <span className="text-[9px] font-normal text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border/30 leading-tight">
                                    대체 공급처
                                </span>
                            </h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                전역 통합 시나리오 기반 노드간 세부 물량 수급 관계 및 조건
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={onClose}
                        className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                        aria-label="모달 닫기"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* 모달 본문 바디 (스크롤) */}
                <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
                    {/* 상단 핵심 메트릭 3종 카세트 */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-[4px] border border-border/50 bg-muted/30 flex flex-col space-y-1">
                            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                                <Layers className="w-3 h-3 text-primary" /> 총 공급 물량
                            </span>
                            <span className="text-sm font-extrabold text-foreground">
                                {option.allocatedVolumeTons.toLocaleString()} <span className="text-xs font-normal">톤</span>
                            </span>
                            <span className="text-[10px] text-primary font-medium">
                                전체 부족분의 +{option.coveredDeficitPercentage}%p 해소
                            </span>
                        </div>

                        <div className="p-3 rounded-[4px] border border-border/50 bg-muted/30 flex flex-col space-y-1">
                            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                                <DollarSign className="w-3 h-3 text-emerald-400" /> 추가 단가
                            </span>
                            <span className="text-sm font-extrabold text-emerald-400">
                                +${option.costImpact.unitExtraCostUsd.toLocaleString()} <span className="text-xs font-normal">/톤</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                총 추가 비용 +${option.costImpact.totalExtraCostUsd.toLocaleString()}
                            </span>
                        </div>

                        <div className="p-3 rounded-[4px] border border-border/50 bg-muted/30 flex flex-col space-y-1">
                            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3 text-emerald-400" /> 평균 리드타임
                            </span>
                            <span className="text-sm font-extrabold text-emerald-400">
                                +{option.leadTimeImpact.additionalDays}일 <span className="text-xs font-normal text-muted-foreground">추가</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                총 운송 소요시간 {option.leadTimeImpact.totalDays}일
                            </span>
                        </div>
                    </div>

                    {/* 노드간 세부 수급 배분 내역 테이블 */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-foreground">
                            <span className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-primary" />
                                노드 간 세부 물량 수급 내역 (전체 5개 차질 공장 중 {breakdown.length}개 공장 배분)
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                                운송 모드: {option.transportType === 'Road' ? '육상 운송' : '해상 운송'}
                            </span>
                        </div>

                        <div className="border border-border/60 rounded-[4px] overflow-hidden bg-accent shadow-xs">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-muted/70 border-b border-border/60 text-muted-foreground font-medium text-[11px]">
                                        <th className="text-left py-2 px-3">수급 대상 노드 (Target Node)</th>
                                        <th className="text-right py-2 px-3">할당 배분 물량</th>
                                        <th className="text-right py-2 px-3">단가 인상분</th>
                                        <th className="text-right py-2 px-3">리드타임</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {breakdown.map((item, idx) => {
                                        const sharePercent = option.allocatedVolumeTons > 0
                                            ? ((item.allocatedVolumeTons / option.allocatedVolumeTons) * 100).toFixed(1)
                                            : '0.0';
                                        return (
                                            <tr
                                                key={`${item.targetNodeId}-${idx}`}
                                                className="border-b border-border/40 last:border-b-0 text-foreground hover:bg-muted/40 transition-colors"
                                            >
                                                <td className="py-2.5 px-3 font-medium">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-muted-foreground">{option.sourceName}</span>
                                                        <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                                                        <span className="font-bold text-foreground">{item.targetName}</span>
                                                    </div>
                                                </td>
                                                <td className="text-right py-2.5 px-3">
                                                    <span className="font-bold text-primary">
                                                        {item.allocatedVolumeTons.toLocaleString()}톤
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground ml-1 font-normal">
                                                        ({sharePercent}%)
                                                    </span>
                                                </td>
                                                <td className="text-right py-2.5 px-3 font-semibold text-emerald-400">
                                                    +${item.unitExtraCostUsd}/톤
                                                </td>
                                                <td className="text-right py-2.5 px-3">
                                                    <span className="font-semibold text-emerald-400">+{item.additionalLeadTimeDays}일</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                        (총 {item.totalLeadTimeDays}일)
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 모달 푸터 */}
                <div className="px-5 py-3 border-t border-border/60 bg-muted/30 flex items-center justify-end shrink-0 text-[11px] text-muted-foreground">
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={onClose}
                        className="px-3 py-1 font-semibold text-xs cursor-pointer"
                    >
                        닫기
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
