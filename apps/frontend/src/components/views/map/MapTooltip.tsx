import { getCountryDisplayName } from '../../../utils/graph-helpers';
import type { LogisticsInfo } from '@navigator/shared';

// 노드 툴팁 데이터
interface NodeTooltipData {
    name: string;
    nodeType: string;
    country: string;
    productionCapacity: number;
    capacityUnit: string;
    riskScore: number;
}

// 엣지(경로) 툴팁 데이터
interface EdgeTooltipData {
    sourceName: string;
    targetName: string;
    hsCode?: string;
    description?: string;
    volume?: number;
    price?: number;
    logisticsInfo?: LogisticsInfo;
}

// 툴팁 정보 인터페이스
export type TooltipInfo =
    | { type: 'node'; x: number; y: number; data: NodeTooltipData }
    | { type: 'edge'; x: number; y: number; data: EdgeTooltipData };

// 노드 타입 한글 매핑
const NODE_TYPE_KO: Record<string, string> = {
    Resource: '자원',
    Mine: '광산',
    Refinery: '정제소',
    Factory: '양극재 플랜트',
};

// 운송 수단 한글 매핑 (이모지 제외)
const TRANSPORT_MODE_KO: Record<string, string> = {
    Maritime: '해상 운송 (Maritime)',
    Truck: '육상 트럭 (Truck)',
    Road: '육상 운송 (Road)',
    Rail: '철도 운송 (Rail)',
    Air: '항공 운송 (Air)',
    Multimodal: '복합 운송 (Multimodal)',
};

// HS 코드 품목명 매핑
const HS_CODE_NAME: Record<string, string> = {
    '2530.90': '리튬 광석 (정광)',
    '2836.91': '탄산리튬',
    '2825.20': '수산화리튬',
};

// 리스크 등급 텍스트
function getRiskLabel(score: number): string {
    if (score <= 33) return '저위험';
    if (score <= 66) return '중위험';
    return '고위험';
}

// 리스크 등급 색상 클래스
function getRiskLabelClass(score: number): string {
    if (score <= 33) return 'text-emerald-400';
    if (score <= 66) return 'text-amber-400';
    return 'text-rose-400';
}

export interface MapTooltipProps {
    info: TooltipInfo;
}

/**
 * 지도 호버 시 표시되는 툴팁 컴포넌트.
 * - 노드 호버: 이름, 타입, 국가, 생산 용량, 리스크 점수 표시
 * - 경로 호버: 출발지 → 도착지, 품목, 운송수단, 거리, 리드타임, 운임단가, 대체경로 표시
 * 위치는 커서 좌표에 따라 동적으로 결정되므로 inline style 사용.
 */
export function MapTooltip({ info }: MapTooltipProps) {
    const { x, y } = info;

    return (
        <div
            className="absolute bg-card/95 backdrop-blur-md border border-border text-foreground rounded-lg px-3.5 py-3 text-xs leading-relaxed z-20 pointer-events-none shadow-xl max-w-[320px]"
            style={{ left: x + 12, top: y + 12 }}
            role="tooltip"
        >
            {info.type === 'node' ? (
                <NodeTooltipContent data={info.data} />
            ) : (
                <EdgeTooltipContent data={info.data} />
            )}
        </div>
    );
}

/** 노드 툴팁 내용 */
function NodeTooltipContent({ data }: { data: NodeTooltipData }) {
    return (
        <>
            <div className="font-semibold text-sm mb-1.5 text-foreground border-b border-border/50 pb-1">
                {data.name}
            </div>
            <div className="space-y-0.5 text-muted-foreground">
                <div><span className="text-foreground/70">타입:</span> {NODE_TYPE_KO[data.nodeType] ?? data.nodeType}</div>
                <div><span className="text-foreground/70">국가:</span> {getCountryDisplayName(data.country)}</div>
                <div>
                    <span className="text-foreground/70">생산 용량:</span> {data.productionCapacity.toLocaleString()} {data.capacityUnit}
                </div>
                <div>
                    <span className="text-foreground/70">리스크:</span>{' '}
                    <span className={`${getRiskLabelClass(data.riskScore)} font-semibold`}>
                        {data.riskScore.toFixed(1)} ({getRiskLabel(data.riskScore)})
                    </span>
                </div>
            </div>
        </>
    );
}

/** 경로(엣지) 툴팁 내용 - 물류 및 운송 종합 카드 (이모지 없음) */
function EdgeTooltipContent({ data }: { data: EdgeTooltipData }) {
    const { logisticsInfo } = data;

    return (
        <div className="space-y-2.5">
            {/* 상단 경로 헤더 */}
            <div className="border-b border-border/60 pb-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                    공급망 운송 경로
                </span>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                    <span>{data.sourceName}</span>
                    <span className="text-primary font-bold">→</span>
                    <span>{data.targetName}</span>
                </div>
            </div>

            {/* 품목 정보 */}
            {data.hsCode && (
                <div className="flex items-center justify-between text-[11px] bg-muted/60 px-2.5 py-1 rounded border border-border/50">
                    <span className="text-muted-foreground font-medium">품목</span>
                    <span className="font-semibold text-foreground">
                        {HS_CODE_NAME[data.hsCode] ?? data.hsCode}
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">({data.hsCode})</span>
                    </span>
                </div>
            )}

            {/* 물류 상세 속성 카드 */}
            {logisticsInfo && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-primary tracking-wide">
                        <span>물류 및 운송 속성</span>
                        <span className="font-medium text-muted-foreground text-[9px]">Logistics Specs</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-card p-2.5 rounded-md border border-border/70">
                        <div>
                            <span className="text-muted-foreground block text-[10px]">운송 수단</span>
                            <span className="font-semibold text-foreground">
                                {TRANSPORT_MODE_KO[logisticsInfo.transportMode] ?? logisticsInfo.transportMode}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-[10px]">운송 거리</span>
                            <span className="font-semibold text-foreground">
                                {logisticsInfo.distanceKm.toLocaleString()} km
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-[10px]">총 리드타임</span>
                            <span className="font-semibold text-foreground">
                                {logisticsInfo.totalLeadTimeDays.toFixed(1)}일
                            </span>
                            <span className="text-[9px] text-muted-foreground block font-normal">
                                (운송 {logisticsInfo.leadTimeDays}d + 통관 {logisticsInfo.customsDelayDays}d)
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-[10px]">톤당 운임</span>
                            <span className="font-semibold text-foreground">
                                ${logisticsInfo.freightCostUsdPerTon.toLocaleString()}/ton
                            </span>
                        </div>
                    </div>

                    {/* 비상 대체 경로 안내 */}
                    {logisticsInfo.alternativeRoutes && logisticsInfo.alternativeRoutes.length > 0 && (
                        <div className="text-[10px] text-muted-foreground bg-muted/40 p-2 rounded border border-border/40 space-y-1">
                            <span className="font-semibold text-foreground/90 block">
                                비상 대체 경로
                            </span>
                            {logisticsInfo.alternativeRoutes.map((route, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[10px]">
                                    <span className="font-medium text-foreground/80">{TRANSPORT_MODE_KO[route.mode] ?? route.mode}</span>
                                    <span>{route.totalLeadTimeDays}일 (${route.freightCostUsdPerTon}/ton)</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 거래량 및 거래액 (있는 경우) */}
            {(data.volume != null || data.price != null) && (
                <div className="space-y-0.5 text-[11px] text-muted-foreground border-t border-border/50 pt-1.5">
                    {data.volume != null && (
                        <div className="flex justify-between">
                            <span>무역량:</span>
                            <span className="font-semibold text-foreground">{data.volume.toLocaleString()} kg</span>
                        </div>
                    )}
                    {data.price != null && (
                        <div className="flex justify-between">
                            <span>거래액:</span>
                            <span className="font-semibold text-foreground">${data.price.toLocaleString()}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
