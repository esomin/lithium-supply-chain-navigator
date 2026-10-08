import { useCallback, useMemo } from 'react';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { Checkbox } from '../ui/checkbox';

// HS 코드 필터 옵션
const HS_CODE_OPTIONS = [
    {
        value: '2530.90',
        label: '리튬 광석',
        badges: [
            { text: '광산→정제소 원료', color: 'bg-muted/80 text-muted-foreground border-border/80' },
        ],
        description: '리튬 광석 (2530.90): 광산 → 정제소 이동 원료',
    },
    {
        value: '2836.91',
        label: '탄산리튬',
        badges: [
            { text: '염호→정제소 원료', color: 'bg-muted/80 text-muted-foreground border-border/80' },
            { text: 'LFP계 양극재 원료', color: 'bg-muted/80 text-muted-foreground border-border/80' },
        ],
        description: '탄산리튬 (2836.91): 염호 직조달 및 정제소 → LFP 양극재 공장 납품',
    },
    {
        value: '2825.20',
        label: '수산화리튬',
        badges: [
            { text: '삼원계 양극재 원료', color: 'bg-muted/80 text-muted-foreground border-border/80' },
        ],
        description: '수산화리튬 (2825.20): 정제소 → 삼원계(NCM/NCA) 하이니켈 공장 납품',
    },
] as const;

// 국가 필터 옵션
const COUNTRY_OPTIONS = [
    { value: 'SouthKorea', label: '한국' },
    { value: 'China', label: '중국' },
    { value: 'Chile', label: '칠레' },
    { value: 'Argentina', label: '아르헨티나' },
    { value: 'Australia', label: '호주' },
    { value: 'Poland', label: '폴란드' },
] as const;

export interface FilterBarProps {
    nodeCount?: number;
    totalNodeCount?: number;
    disabled?: boolean;
}

/**
 * 그래프 및 대시보드 필터 컨트롤 바.
 * - 품목명 (HS 코드) 다중 필터
 * - 국가별 다중 필터
 * - 현재 필터링된 노드 수/전체 노드 수 표시
 * - disabled 상태 지원(시뮬레이션 모드 등에서 상시 유지 및 시프트 방지)
 */
export function FilterBar({ nodeCount, totalNodeCount, disabled = false }: FilterBarProps) {
    const { nodes, edges, filters, setFilters } = useSupplyChainStore();

    // HS 코드 필터 적용 시 해당 엣지에 연결된 노드 ID 집합 계산
    const hsCodeFilteredNodeIds = useMemo(() => {
        const nodeIds = new Set<string>();
        for (const edge of edges) {
            const hsCode = edge.attributes?.hsCode;
            if (!hsCode || filters.hsCode.includes(hsCode) || filters.hsCode.length === 0) {
                nodeIds.add(edge.sourceNodeId);
                nodeIds.add(edge.targetNodeId);
            }
        }
        return nodeIds;
    }, [edges, filters.hsCode]);

    // 필터링된 노드 계산
    const filteredNodes = useMemo(() => {
        const hasHsCodeFilter = filters.hsCode.length > 0;
        const hasCountryFilter = filters.countries.length > 0;
        const hasHsCodeMatch = hasHsCodeFilter && hsCodeFilteredNodeIds && hsCodeFilteredNodeIds.size > 0;

        return nodes.filter((node) => {
            if (hasHsCodeMatch && !hsCodeFilteredNodeIds.has(node.id)) {
                return false;
            }
            if (hasCountryFilter && !filters.countries.includes(node.country)) {
                return false;
            }
            return true;
        });
    }, [nodes, hsCodeFilteredNodeIds, filters.countries, filters.hsCode]);

    const displayNodeCount = nodeCount ?? filteredNodes.length;
    const displayTotalCount = totalNodeCount ?? nodes.length;

    const handleHsCodeChange = useCallback(
        (hsCode: string) => {
            if (disabled) return;
            const current = filters.hsCode;
            let next: string[];
            if (current.includes(hsCode)) {
                // 이미 선택된 상태이면 해제 (단, 최소 1개는 활성화되어야 함)
                if (current.length > 1) {
                    next = current.filter((c) => c !== hsCode);
                } else {
                    return; // 최소 1개 선택 유지
                }
            } else {
                next = [...current, hsCode];
            }
            setFilters({ hsCode: next });
        },
        [filters.hsCode, setFilters, disabled],
    );

    const handleCountryChange = useCallback(
        (country: string) => {
            if (disabled) return;
            const current = filters.countries;
            let next: string[];
            if (current.includes(country)) {
                // 이미 선택된 상태이면 해제 (단, 최소 1개는 활성화되어야 함)
                if (current.length > 1) {
                    next = current.filter((c) => c !== country);
                } else {
                    return; // 최소 1개 선택 유지
                }
            } else {
                next = [...current, country];
            }
            setFilters({ countries: next });
        },
        [filters.countries, setFilters, disabled],
    );

    return (
        <div
            className={`flex items-center justify-between px-6 py-3 border-b border-border bg-card flex-wrap gap-4 transition-all duration-200 ${
                disabled ? 'opacity-50 pointer-events-none select-none' : 'opacity-100'
            }`}
            role="toolbar"
            aria-label="공급망 필터 바"
            aria-disabled={disabled}
        >
            <div className="flex flex-col gap-2.5">
                {/* 품목 필터 */}
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-muted-foreground mr-2 w-12 shrink-0">품목명</span>
                    <div className="flex items-center gap-5 flex-wrap">
                        {HS_CODE_OPTIONS.map(({ value, label, badges, description }) => {
                            const isActive = filters.hsCode.includes(value);
                            const id = `hs-code-${value}`;
                            return (
                                <div
                                    key={value}
                                    className="flex items-center gap-1.5 group relative"
                                    title={description}
                                >
                                    <Checkbox
                                        id={id}
                                        checked={isActive}
                                        disabled={disabled}
                                        onCheckedChange={() => handleHsCodeChange(value)}
                                    />
                                    <label
                                        htmlFor={id}
                                        className="text-xs font-semibold text-foreground cursor-pointer select-none flex items-center gap-1.5"
                                    >
                                        <span>{label}</span>
                                        {badges.map((b, idx) => (
                                            <span
                                                key={idx}
                                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${b.color}`}
                                            >
                                                {b.text}
                                            </span>
                                        ))}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 국가 필터 */}
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-muted-foreground mr-2 w-12 shrink-0">국가</span>
                    <div className="flex items-center gap-4 flex-wrap">
                        {COUNTRY_OPTIONS.map(({ value, label }) => {
                            const isActive = filters.countries.includes(value);
                            const id = `country-${value}`;
                            return (
                                <div key={value} className="flex items-center gap-1.5">
                                    <Checkbox
                                        id={id}
                                        checked={isActive}
                                        disabled={disabled}
                                        onCheckedChange={() => handleCountryChange(value)}
                                    />
                                    <label
                                        htmlFor={id}
                                        className="text-xs font-semibold text-foreground cursor-pointer select-none"
                                    >
                                        {label}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 우측 정보: 노드 카운트 텍스트 (하단 정렬) */}
            <div className="flex items-center gap-3 self-end shrink-0 pb-0.5">
                <div className="text-xs text-muted-foreground select-none">
                    <span>노드: </span>
                    <span className="font-bold text-foreground">{displayNodeCount}</span>
                    <span>/{displayTotalCount}</span>
                </div>
            </div>
        </div>
    );
}
