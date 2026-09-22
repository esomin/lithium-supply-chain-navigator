import { useState } from 'react';
import type { SupplyChainNode, SupplyChainEdge, HsCodeCategory } from '@navigator/shared';
import { getCountryDisplayName, getNodeTypeLabel } from '../../utils/graph-helpers';
import { ConnectedEdgesList } from './ConnectEdgeList';
import { ArrowRight } from 'lucide-react';

// HS 코드 카테고리 한글 라벨 매핑
const HS_CODE_CATEGORY_LABELS: Record<HsCodeCategory, string> = {
    raw_material: '원자재 (HS 2530.90)',
    lithium_carbonate: '탄산리튬 (HS 2836.91)',
    lithium_hydroxide: '수산화리튬 (HS 2825.20)',
};

/** HS 코드 카테고리를 한글 라벨로 변환 */
function getHsCodeCategoryLabel(category: string): string {
    return HS_CODE_CATEGORY_LABELS[category as HsCodeCategory] ?? category;
}

export interface NodeDetailPanelProps {
    node: SupplyChainNode;
    connectedEdges: SupplyChainEdge[];
    riskScore: number | undefined;
    onClose: () => void;
    /** Factory 노드에서 역추적 패널을 열기 위한 콜백 (옵션) */
    onOpenTraceability?: () => void;
}

/**
 * 노드 상세 정보 패널.
 * 선택된 노드의 속성, description, 연결 엣지, 리스크 점수를 표시한다.
 * Requirements 4.4 구현.
 */
export function NodeDetailPanel({ node, connectedEdges, riskScore, onClose, onOpenTraceability }: NodeDetailPanelProps) {
    const [showEsgTooltip, setShowEsgTooltip] = useState(true);

    return (
        <>
            {/* 패널 좌측 바깥에 뜨는 플로팅 안내 말풍선 (Coach Mark Popover) */}
            {showEsgTooltip && node.type === 'Factory' && onOpenTraceability && (
                <div
                    className="absolute right-[375px] bottom-6 w-[310px] bg-card/95 backdrop-blur-md border border-primary text-card-foreground rounded-xl shadow-[0_0_16px_rgba(59,130,246,0.25)] p-3.5 z-30 animate-in fade-in slide-in-from-right-3 duration-300 pointer-events-auto select-none group hover:border-2 hover:border-primary hover:shadow-[0_0_24px_rgba(59,130,246,0.45)] transition-all cursor-pointer"
                    onClick={onOpenTraceability}
                >
                    {/* 패널을 가리키는 우측 화살표 말풍선 꼬리 */}
                    <div className="absolute -right-1.5 bottom-6 w-3 h-3 bg-card rotate-45 border-r border-t border-primary group-hover:border-r-2 group-hover:border-t-2 transition-all" />

                    <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full border border-primary/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                            심층 공급망 분석
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowEsgTooltip(false)}
                            className="text-muted-foreground hover:text-foreground text-[11px] px-1 py-0.5 rounded hover:bg-muted/60 transition-colors cursor-pointer"
                            title="안내 닫기"
                            aria-label="안내 닫기"
                        >
                            ✕
                        </button>
                    </div>

                    <h4 className="text-xs font-bold text-foreground mb-1">
                        ESG 역추적 검증 가능
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-2.5">
                        원산지 광산부터의 공급 경로와 ESG 인증 준수 현황을 확인하려면 아래 버튼을 클릭하세요.
                    </p>

                    <button
                        type="button"
                        onClick={onOpenTraceability}
                        className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:underline cursor-pointer transition-all"
                    >
                        <span>ESG 역추적 지금 실행하기</span>
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            )}

            <aside
                id="tour-node-detail-panel"
                className={`absolute top-0 right-0 w-[360px] h-full bg-card border-l border-border p-4 overflow-y-auto shadow-2xl z-20 flex flex-col font-sans text-foreground transition-all duration-300 ${
                    showEsgTooltip && node.type === 'Factory'
                        ? 'ring-2 ring-primary/60 shadow-[0_0_35px_rgba(59,130,246,0.35)]'
                        : ''
                }`}
                aria-label="노드 상세 정보 패널"
            >
                {/* 헤더 영역: 제목 + 닫기 버튼 */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                    <h2 className="text-base font-bold text-foreground tracking-tight">노드 상세 정보</h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer text-base"
                        aria-label="패널 닫기"
                    >
                        ✕
                    </button>
                </div>

                <div className="space-y-4 flex-1">
                    {/* 노드 이름 및 설명 카드 */}
                    <div className="p-3 bg-muted/40 border border-border rounded-lg shadow-xs space-y-1">
                        <h3 className="text-sm font-bold text-foreground tracking-tight">{node.name}</h3>
                        {node.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {node.description}
                            </p>
                        )}
                    </div>

                    {/* 노드 속성 테이블 */}
                    <div className="border border-border rounded-lg overflow-hidden bg-card shadow-xs">
                        <table className="w-full text-xs border-collapse">
                            <tbody className="divide-y divide-border/60">
                                <tr className="hover:bg-muted/30">
                                    <td className="py-2 px-3 text-muted-foreground font-medium w-28 bg-muted/20">ID</td>
                                    <td className="py-2 px-3 font-mono font-semibold text-foreground">{node.id}</td>
                                </tr>
                                <tr className="hover:bg-muted/30">
                                    <td className="py-2 px-3 text-muted-foreground font-medium bg-muted/20">타입</td>
                                    <td className="py-2 px-3 font-medium text-foreground">
                                        {node.type} ({getNodeTypeLabel(node.type)})
                                    </td>
                                </tr>
                                <tr className="hover:bg-muted/30">
                                    <td className="py-2 px-3 text-muted-foreground font-medium bg-muted/20">국가</td>
                                    <td className="py-2 px-3 font-medium text-foreground">
                                        {getCountryDisplayName(node.country)}
                                    </td>
                                </tr>
                                <tr className="hover:bg-muted/30">
                                    <td className="py-2 px-3 text-muted-foreground font-medium bg-muted/20">생산능력</td>
                                    <td className="py-2 px-3 font-semibold text-primary">
                                        {node.metadata.productionCapacity.toLocaleString()}{' '}
                                        {node.metadata.capacityUnit}
                                    </td>
                                </tr>
                                {node.metadata.hsCodeCategory && (
                                    <tr className="hover:bg-muted/30">
                                        <td className="py-2 px-3 text-muted-foreground font-medium bg-muted/20">HS 코드 분류</td>
                                        <td className="py-2 px-3 text-foreground">
                                            {getHsCodeCategoryLabel(node.metadata.hsCodeCategory)}
                                        </td>
                                    </tr>
                                )}
                                <tr className="hover:bg-muted/30">
                                    <td className="py-2 px-3 text-muted-foreground font-medium bg-muted/20">리스크 점수</td>
                                    <td className="py-2 px-3 font-bold text-foreground">
                                        {riskScore !== undefined ? (
                                            <span className={`px-2 py-0.5 rounded text-[11px] ${
                                                riskScore > 0.6 ? 'bg-destructive/20 text-destructive border border-destructive/30' :
                                                riskScore > 0.3 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            }`}>
                                                {riskScore.toFixed(1)}
                                            </span>
                                        ) : 'N/A'}
                                    </td>
                                </tr>
                                <tr className="hover:bg-muted/30">
                                    <td className="py-2 px-3 text-muted-foreground font-medium bg-muted/20">좌표</td>
                                    <td className="py-2 px-3 font-mono text-muted-foreground">
                                        {node.coordinates.latitude.toFixed(2)},{' '}
                                        {node.coordinates.longitude.toFixed(2)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* 연결된 엣지 목록 컴포넌트 */}
                    <ConnectedEdgesList connectedEdges={connectedEdges} />

                    {/* Factory 노드일 때 ESG 역추적 버튼 */}
                    {node.type === 'Factory' && onOpenTraceability && (
                        <div className="pt-2">
                            <button
                                id="tour-esg-trace-button"
                                onClick={onOpenTraceability}
                                className="w-full py-2.5 px-3 bg-primary text-primary-foreground hover:bg-primary-hover border-none rounded-lg cursor-pointer text-xs font-bold shadow-md transition-all duration-150 flex items-center justify-center gap-1.5 group relative overflow-hidden ring-2 ring-primary/30 hover:ring-primary/60"
                                aria-label="ESG 역추적 보기"
                            >
                                {/* 반짝이는 펄스 점 비콘 아이콘 */}
                                <span className="relative flex h-2 w-2 mr-0.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                                </span>
                                <span>ESG 역추적 분석 보기</span>
                                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
