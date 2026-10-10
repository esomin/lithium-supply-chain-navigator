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
    return (
        <aside
            id="tour-node-detail-panel"
            className="absolute top-0 right-0 w-[360px] h-full bg-card border-l border-border p-4 overflow-y-auto shadow-2xl z-20 flex flex-col font-sans text-foreground transition-all duration-300"
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
                    <div className="p-3 bg-muted/30 border border-border rounded-[4px] shadow-xs space-y-1">
                        <h3 className="text-sm font-bold text-foreground tracking-tight">{node.name}</h3>
                        {node.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {node.description}
                            </p>
                        )}
                    </div>

                    {/* 노드 속성 테이블 (보더 라운드 축소 및 내부 보더 수 축소로 미니멀화) */}
                    <div className="border border-border/70 rounded-[4px] overflow-hidden bg-card shadow-xs">
                        <table className="w-full text-xs border-collapse">
                            <tbody className="divide-y divide-border/40">
                                <tr className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 px-3 text-muted-foreground font-medium w-28">ID</td>
                                    <td className="py-2 px-3 font-mono font-semibold text-foreground">{node.id}</td>
                                </tr>
                                <tr className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 px-3 text-muted-foreground font-medium">타입</td>
                                    <td className="py-2 px-3 font-medium text-foreground">
                                        {node.type} ({getNodeTypeLabel(node.type)})
                                    </td>
                                </tr>
                                <tr className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 px-3 text-muted-foreground font-medium">국가</td>
                                    <td className="py-2 px-3 font-medium text-foreground">
                                        {getCountryDisplayName(node.country)}
                                    </td>
                                </tr>
                                <tr className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 px-3 text-muted-foreground font-medium">생산능력</td>
                                    <td className="py-2 px-3 font-semibold text-primary">
                                        {node.metadata.productionCapacity.toLocaleString()}{' '}
                                        {node.metadata.capacityUnit}
                                    </td>
                                </tr>
                                {node.metadata.hsCodeCategory && (
                                    <tr className="hover:bg-muted/20 transition-colors">
                                        <td className="py-2 px-3 text-muted-foreground font-medium">HS 코드 분류</td>
                                        <td className="py-2 px-3 text-foreground">
                                            {getHsCodeCategoryLabel(node.metadata.hsCodeCategory)}
                                        </td>
                                    </tr>
                                )}
                                <tr className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 px-3 text-muted-foreground font-medium">리스크 점수</td>
                                    <td className="py-2 px-3 font-bold font-mono">
                                        {riskScore !== undefined ? (
                                            <span className={
                                                riskScore > 0.6 ? 'text-destructive' :
                                                riskScore > 0.3 ? 'text-amber-400' :
                                                'text-emerald-400'
                                            }>
                                                {riskScore.toFixed(1)}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">N/A</span>
                                        )}
                                    </td>
                                </tr>
                                <tr className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 px-3 text-muted-foreground font-medium">좌표</td>
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
                                className="w-full py-2 px-3 bg-primary text-primary-foreground hover:bg-primary-hover border-none rounded-[4px] cursor-pointer text-xs font-bold shadow-xs transition-all duration-150 flex items-center justify-center gap-1.5 group relative overflow-hidden"
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
    );
}
