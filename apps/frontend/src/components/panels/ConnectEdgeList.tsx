import { useMemo } from 'react';
import type { SupplyChainEdge, SupplyChainNode } from '@navigator/shared';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { getCountryDisplayName, getCountryColor } from '../../utils/graph-helpers';

const NODE_TYPE_LABEL_KO: Record<string, string> = {
    Resource: '자원',
    Mine: '광산',
    Refinery: '정제소',
    Factory: '공장',
};

interface ConnectedEdgesListProps {
    connectedEdges: SupplyChainEdge[];
}

/**
 * 선택된 노드에 연결된 엣지(거래 정보)를 카드 형태로 보여주는 리스트 컴포넌트.
 */
export function ConnectedEdgesList({ connectedEdges }: ConnectedEdgesListProps) {
    const { nodes } = useSupplyChainStore();

    // 노드 ID -> SupplyChainNode 매핑 Map 생성
    const nodeMap = useMemo(() => {
        const map = new Map<string, SupplyChainNode>();
        for (const n of nodes) {
            map.set(n.id, n);
        }
        return map;
    }, [nodes]);

    if (connectedEdges.length === 0) return null;

    return (
        <div className="mt-4 space-y-2">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
                <span>연결 엣지</span>
                <span className="text-[11px] font-normal text-muted-foreground">({connectedEdges.length}개)</span>
            </h4>
            <div className="flex flex-col gap-2">
                {connectedEdges.map((edge) => {
                    const sourceNode = nodeMap.get(edge.sourceNodeId);
                    const targetNode = nodeMap.get(edge.targetNodeId);

                    const sourceName = sourceNode?.name || edge.sourceNodeId;
                    const sourceCountry = sourceNode ? getCountryDisplayName(sourceNode.country) : '기타';
                    const sourceCountryCode = sourceNode?.country || 'NA';
                    const sourceCountryColor = getCountryColor(sourceCountryCode);
                    const sourceTypeName = sourceNode ? (NODE_TYPE_LABEL_KO[sourceNode.type] || sourceNode.type) : '';

                    const targetName = targetNode?.name || edge.targetNodeId;
                    const targetCountry = targetNode ? getCountryDisplayName(targetNode.country) : '기타';
                    const targetCountryCode = targetNode?.country || 'NA';
                    const targetCountryColor = getCountryColor(targetCountryCode);
                    const targetTypeName = targetNode ? (NODE_TYPE_LABEL_KO[targetNode.type] || targetNode.type) : '';

                    const isSupply = edge.type === 'Supply';

                    return (
                        <div
                            key={edge.id}
                            className="bg-muted/30 border border-border/70 rounded-[4px] p-2.5 flex flex-col gap-2 shadow-xs transition-colors hover:bg-muted/50"
                        >
                            <div className="flex justify-between items-center">
                                <span
                                    className={`text-[10px] font-bold px-1.5 py-0 rounded-[3px] border ${
                                        isSupply
                                            ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                            : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    }`}
                                >
                                    {isSupply ? '공급' : '납품'}
                                </span>
                                {edge.attributes.volume && (
                                    <span className="text-xs font-bold text-primary font-mono">
                                        {edge.attributes.volume.toLocaleString()} kg
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5 text-xs pt-1.5 border-t border-border/40">
                                {/* From 노드 */}
                                <div className="flex items-start gap-2">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase w-8 shrink-0 pt-0.5">From</span>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-semibold text-foreground truncate text-xs">{sourceName}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span
                                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                                style={{ background: sourceCountryColor }}
                                            />
                                            <span className="text-[10px] text-muted-foreground truncate">
                                                {sourceCountry} · {sourceTypeName}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* To 노드 */}
                                <div className="flex items-start gap-2">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase w-8 shrink-0 pt-0.5">To</span>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-semibold text-foreground truncate text-xs">{targetName}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span
                                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                                style={{ background: targetCountryColor }}
                                            />
                                            <span className="text-[10px] text-muted-foreground truncate">
                                                {targetCountry} · {targetTypeName}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
