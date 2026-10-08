import { useCallback, useMemo, useEffect, useState } from 'react';
import type { Disruption, DisruptionType } from '@navigator/shared';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { useSimulationStore } from '../../store/simulation-store';
import { getCountryDisplayName, getNodeTypeLabel } from '../../utils/graph-helpers';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Slider } from '../ui/slider';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw, Sparkles, SlidersHorizontal, X, Info } from 'lucide-react';
import { RiLightbulbLine } from 'react-icons/ri';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
    DISRUPTION_TYPE_CONFIGS,
    SCENARIO_PRESETS,
    type ScenarioPreset,
} from './simulation-configs';
import {
    SimulationResultSection,
    SimulationHistorySection,
} from './SimulationResultSection';
import { ReRoutingPanel } from './ReRoutingPanel';

export interface SimulationPanelProps {
    onClose?: () => void;
}

/**
 * Simulation Controls 사이드 패널 컴포넌트.
 * 충격 시나리오 구성, 국가 수출 규제 바로가기, 시뮬레이션 실행을 제공한다.
 * Requirements 7.5 구현.
 */
export function SimulationPanel({ onClose }: SimulationPanelProps = {}) {
    const { nodes, edges, setFilters } = useSupplyChainStore();
    const {
        currentDisruption,
        disruptions,
        isRunning,
        elapsedSeconds,
        error,
        result,
        activeRerouteOptions,
        isRerouteApplied,
        historyEntries,
        isLoadingHistory,
        setTargetId,
        setTargetType,
        setDisruptionType,
        setSeverity,
        addDisruption,
        removeDisruption,
        clearDisruptions,
        setDisruptions,
        runSimulation,
        clearResult,
        loadHistoryResult,
        setRerouteApplied,
        recalculateReroute,
    } = useSimulationStore();

    // '매장된 자원'을 제외한 유효 시설 노드 목록 생성
    const activeNodes = useMemo(() => {
        return nodes.filter((n) => n.type !== 'Resource');
    }, [nodes]);

    // 필터링 상태 추가
    const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
    const [selectedNodeType, setSelectedNodeType] = useState<string>('ALL');
    const [selectedSourceNodeId, setSelectedSourceNodeId] = useState<string>('ALL');

    // 직접 구성 아코디언 상태 (기본 닫힘)
    const [isCustomConfigOpen, setIsCustomConfigOpen] = useState(false);

    // 2열 패널 탭 상태 ('result' | 'history')
    const [activeTab, setActiveTab] = useState<'result' | 'history'>('result');

    // 2열 레이아웃 슬라이드 아웃 상태
    const [isSecondColumnOpen, setIsSecondColumnOpen] = useState(historyEntries.length > 0 || !!result);

    // 결과 생성 시 2열 패널 자동 확장 및 결과 탭으로 전환
    useEffect(() => {
        if (result) {
            setIsSecondColumnOpen(true);
            setActiveTab('result');
        }
    }, [result]);

    // 프리셋 적용 핸들러 (프리셋 선택 시 충격 목록에 자동 등록)
    const handleApplyPreset = useCallback((preset: ScenarioPreset) => {
        setTargetType(preset.config.targetType);

        if (preset.config.targetType === 'node') {
            setSelectedCountry(preset.config.country || 'ALL');
            setSelectedNodeType(preset.config.nodeType || 'ALL');
            setSelectedSourceNodeId('ALL');
        } else {
            setSelectedCountry('ALL');
            setSelectedNodeType('ALL');
            setSelectedSourceNodeId(preset.config.sourceNodeId || 'ALL');
        }

        setDisruptionType(preset.config.disruptionType);
        setSeverity(preset.config.severity);
        setTargetId(preset.config.targetId);

        // 프리셋 조건을 적용될 충격 목록(disruptions)에 즉시 자동 큐잉
        const presetDisruption: Disruption = {
            targetType: preset.config.targetType,
            targetId: preset.config.targetId,
            disruptionType: preset.config.disruptionType,
            severity: preset.config.severity,
            country: preset.config.country,
            nodeType: preset.config.nodeType,
            sourceNodeId: preset.config.sourceNodeId,
        };
        setDisruptions([presetDisruption]);
    }, [setTargetType, setDisruptionType, setSeverity, setTargetId, setDisruptions]);

    // 충격 시나리오 구성 초기화 핸들러 (프리셋 선택 해제 및 설정값 리셋)
    const handleResetScenario = useCallback(() => {
        setIsCustomConfigOpen(true);
        clearDisruptions();
        setTargetType('node');
        setSelectedCountry('ALL');
        setSelectedNodeType('ALL');
        setSelectedSourceNodeId('ALL');
        setDisruptionType('export_restriction');
        setSeverity(0.5);
        setTargetId('');
    }, [clearDisruptions, setTargetType, setDisruptionType, setSeverity, setTargetId]);
    const countryOptions = useMemo(() => {
        const countries = Array.from(new Set(activeNodes.map((n) => n.country)));
        return [
            { value: 'ALL', label: '모든 국가' },
            ...countries.map((c) => ({
                value: c,
                label: getCountryDisplayName(c),
            })).sort((a, b) => a.label.localeCompare(b.label, 'ko')),
        ];
    }, [activeNodes]);

    // 사용 가능한 시설 유형 필터 옵션
    const nodeTypeOptions = useMemo(() => {
        const types = Array.from(new Set(activeNodes.map((n) => n.type)));
        return [
            { value: 'ALL', label: '모든 시설 종류' },
            ...types.map((t) => ({
                value: t,
                label: getNodeTypeLabel(t),
            })).sort((a, b) => a.label.localeCompare(b.label, 'ko')),
        ];
    }, [activeNodes]);

    // 선택 가능한 노드 항목 목록 (필터 조건 적용)
    const targetOptions = useMemo(() => {
        const filtered = activeNodes
            .filter((n) => selectedCountry === 'ALL' || n.country === selectedCountry)
            .filter((n) => selectedNodeType === 'ALL' || n.type === selectedNodeType);

        const list = filtered.map((n) => {
            const countryStr = getCountryDisplayName(n.country);
            const typeStr = getNodeTypeLabel(n.type);
            const labelSuffix = n.country === 'NA' ? typeStr : `${countryStr}, ${typeStr}`;
            return {
                id: n.id,
                label: `${n.name} (${labelSuffix})`,
            };
        });

        // 조건에 해당하는 노드가 2개 이상일 때 '모든 해당 시설 (전체 선택)' 옵션을 최상단에 배치
        if (filtered.length > 1) {
            const countryLabel = selectedCountry === 'ALL' ? '모든 국가' : getCountryDisplayName(selectedCountry);
            const typeLabel = selectedNodeType === 'ALL' ? '모든 시설' : getNodeTypeLabel(selectedNodeType);
            list.unshift({
                id: 'ALL_NODES',
                label: `-- 전체 선택: ${countryLabel} ${typeLabel} (${filtered.length}개 전체) --`,
            });
        }

        return list;
    }, [activeNodes, selectedCountry, selectedNodeType]);

    // 결과 노드가 1개일 때 자동 선택 처리하는 이펙트
    useEffect(() => {
        if (currentDisruption.targetType === 'node' && targetOptions.length === 1) {
            const uniqueNode = targetOptions[0];
            if (currentDisruption.targetId !== uniqueNode.id) {
                setTargetId(uniqueNode.id);
            }
        }
    }, [targetOptions, currentDisruption.targetType, currentDisruption.targetId, setTargetId]);

    // 엣지의 출발 노드로 존재하는 노드들의 유니크 목록
    const sourceNodeOptions = useMemo(() => {
        const sourceIds = Array.from(new Set(edges.map((e) => e.sourceNodeId)));
        return sourceIds
            .map((id) => activeNodes.find((n) => n.id === id)) // 매장자원은 배제된 activeNodes 기준
            .filter((n): n is Exclude<typeof n, undefined> => !!n)
            .map((n) => ({
                id: n.id,
                label: `${n.name} (${getCountryDisplayName(n.country)})`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    }, [activeNodes, edges]);

    // 선택된 출발지 노드에서 출발하는 엣지 목록 (구조화 데이터로 관리)
    const targetEdgeOptions = useMemo(() => {
        if (selectedSourceNodeId === 'ALL') return [];
        return edges
            .filter((e) => e.sourceNodeId === selectedSourceNodeId)
            .map((e) => {
                const targetNode = nodes.find((n) => n.id === e.targetNodeId);
                const targetLabel = targetNode ? `${targetNode.name} (${getCountryDisplayName(targetNode.country)})` : e.targetNodeId;
                return {
                    edgeId: e.id,
                    targetLabel,
                    volume: e.attributes.volume ?? 0,
                };
            });
    }, [nodes, edges, selectedSourceNodeId]);

    // 도착지 경로가 1개일 때 자동 선택 처리하는 이펙트
    useEffect(() => {
        if (currentDisruption.targetType === 'edge' && targetEdgeOptions.length === 1) {
            const uniqueEdge = targetEdgeOptions[0];
            if (currentDisruption.targetId !== uniqueEdge.edgeId) {
                setTargetId(uniqueEdge.edgeId);
            }
        }
    }, [targetEdgeOptions, currentDisruption.targetType, currentDisruption.targetId, setTargetId]);

    // 컴포넌트 마운트 시(시뮬레이션 모드 진입 시) 글로벌 필터 전체 선택 처리
    useEffect(() => {
        setFilters({
            hsCode: ['2530.90', '2836.91', '2825.20'],
            countries: ['SouthKorea', 'China', 'Chile', 'Argentina', 'Australia', 'Poland'],
        });
    }, [setFilters]);

    // 충격 추가 핸들러
    const handleAddDisruption = useCallback(() => {
        addDisruption({ country: selectedCountry, nodeType: selectedNodeType });
    }, [addDisruption, selectedCountry, selectedNodeType]);

    // 시뮬레이션 실행 핸들러 (실행 시 모든 품목 및 국가 필터를 전체 활성화하여 데이터 정합성 보장)
    const handleRunSimulation = useCallback(() => {
        setFilters({
            hsCode: ['2530.90', '2836.91', '2825.20'],
            countries: ['SouthKorea', 'China', 'Chile', 'Argentina', 'Australia', 'Poland'],
        });
        runSimulation();
    }, [runSimulation, setFilters]);

    // 이력 항목 클릭 핸들러
    const handleHistoryClick = useCallback(
        (scenarioId: string) => {
            loadHistoryResult(scenarioId);
        },
        [loadHistoryResult],
    );

    // 3초 타임아웃 진행률 계산 (0~100)
    const timeoutProgress = useMemo(() => {
        return Math.min((elapsedSeconds / 3) * 100, 100);
    }, [elapsedSeconds]);

    // 전체 시뮬레이션 초기화 핸들러 (결과, 시나리오, 2열 패널 닫기 및 필터/하이라이트 원복)
    const handleFullReset = useCallback(() => {
        clearResult();
        clearDisruptions();
        setIsSecondColumnOpen(false);
        setTargetType('node');
        setSelectedCountry('ALL');
        setSelectedNodeType('ALL');
        setSelectedSourceNodeId('ALL');
        setDisruptionType('export_restriction');
        setSeverity(0.5);
        setTargetId('');
    }, [clearResult, clearDisruptions, setIsSecondColumnOpen, setTargetType, setDisruptionType, setSeverity, setTargetId]);

    // 초기화 버튼 표시 조건 (시뮬레이션 결과가 있거나 적용된 disruption이 있는 경우)
    const canReset = Boolean(result || disruptions.length > 0 || currentDisruption.targetId);

    return (
        <div
            className="absolute top-0 left-0 h-full flex flex-col font-sans z-[20] pointer-events-none"
            role="region"
            aria-label="시뮬레이션 제어 패널 그룹"
        >
            {/* 공통 상단 헤더: 두 패널 전체 가로 영역을 아우르는 타이틀 바 */}
            <div className={`bg-card border-b border-r border-border px-3.5 py-3 shadow-sm flex items-center justify-between pointer-events-auto z-10 transition-all duration-300 ease-in-out ${isSecondColumnOpen ? 'w-[760px]' : 'w-[380px]'
                }`}>
                <h2 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                    공급망 충격 시뮬레이션
                </h2>
                <div className="flex items-center gap-1.5">
                    {canReset && (
                        <button
                            type="button"
                            onClick={handleFullReset}
                            className="px-2 py-1 rounded-[3px] text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer flex items-center gap-1"
                            title="시뮬레이션 결과 및 시나리오 전체 초기화"
                        >
                            <span>초기화</span>
                        </button>
                    )}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 rounded-[3px] hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center"
                            aria-label="공급망 충격 시뮬레이션 패널 접기"
                            title="패널 접기"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* 패널 칼럼 바디 (1열 + 2열) */}
            <div className="flex-1 min-h-0 flex pointer-events-none">
                {/* 1열: 시뮬레이션 설정 및 입력 폼 */}
                <aside
                    className="w-[380px] h-full bg-card border-r border-border/40 p-4 pr-2 pt-3 shadow-md flex flex-col pointer-events-auto relative"
                    aria-label="시뮬레이션 입력 및 설정 제어"
                >
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3.5 p-1">
                        {/* 시나리오 프리셋 선택 섹션 (플랫 리스트 & 소프트 보더) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-0.5">
                                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 tracking-normal">
                                    <RiLightbulbLine className="w-3.5 h-3.5 text-muted-foreground" />
                                    추천 시나리오 프리셋
                                </h3>
                                <span className="text-[10px] text-muted-foreground font-normal">빠른 충격 적용</span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                {SCENARIO_PRESETS.map((preset, index) => {
                                    const isSelected =
                                        currentDisruption.disruptionType === preset.config.disruptionType &&
                                        currentDisruption.targetType === preset.config.targetType &&
                                        currentDisruption.targetId === preset.config.targetId &&
                                        Math.abs(currentDisruption.severity - preset.config.severity) < 0.01;

                                    const isLast = index === SCENARIO_PRESETS.length - 1;

                                    const severityVal =
                                        DISRUPTION_TYPE_CONFIGS[preset.config.disruptionType]?.formatValue(
                                            preset.config.severity,
                                        ) ?? '';

                                    return (
                                            <div
                                                onClick={() => handleApplyPreset(preset)}
                                                className={`w-full text-left p-2.5 rounded-[4px] transition-colors duration-150 cursor-pointer flex flex-col gap-1 ${
                                                    isSelected
                                                        ? 'bg-slate-700/80 text-foreground font-medium shadow-2xs'
                                                        : 'bg-transparent text-muted-foreground hover:bg-slate-700/40 hover:text-foreground'
                                                }`}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        handleApplyPreset(preset);
                                                    }
                                                }}
                                                aria-label={`프리셋 적용: ${preset.name}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span
                                                            className={`text-[10px] font-medium py-0.5 px-1.5 rounded-[3px] shrink-0 transition-colors ${
                                                                isSelected
                                                                    ? 'bg-primary/25 text-primary font-semibold'
                                                                    : 'bg-muted-foreground/15 text-muted-foreground group-hover:text-foreground group-hover:bg-muted-foreground/25'
                                                            }`}
                                                        >
                                                            {preset.badge}
                                                        </span>
                                                        <span
                                                            className={`text-xs font-medium leading-tight truncate transition-colors ${
                                                                isSelected ? 'text-foreground font-semibold' : 'text-foreground/80 group-hover:text-foreground'
                                                            }`}
                                                        >
                                                            {preset.name}
                                                        </span>

                                                        {/* 안내 아이콘 및 툴팁 영역 (아이콘 호버 시에만 툴팁 노출) */}
                                                        <div
                                                            className="relative inline-flex items-center group/info shrink-0"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-help rounded-[2px]"
                                                                aria-label={`${preset.name} 설명`}
                                                            >
                                                                <Info className="w-3.5 h-3.5" />
                                                            </button>

                                                            {/* 안내 아이콘 호버 시 나오는 상세 설명 툴팁 */}
                                                            <div
                                                                className={`absolute hidden group-hover/info:block z-50 w-60 p-2.5 bg-popover text-popover-foreground text-[10px] leading-relaxed rounded-[4px] border border-border/80 shadow-2xl pointer-events-none ${
                                                                    isLast ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                                                                } left-0`}
                                                            >
                                                                <div>{preset.description}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[3px] transition-colors shrink-0 ${
                                                            isSelected
                                                                ? 'bg-background text-foreground font-semibold shadow-2xs'
                                                                : 'text-muted-foreground/80 group-hover:text-foreground group-hover:bg-background/60'
                                                        }`}>
                                                            {severityVal}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground/80 leading-tight pl-0.5 group-hover:text-muted-foreground">
                                                    <span>
                                                        {preset.config.targetType === 'node'
                                                            ? preset.config.country === 'ALL'
                                                                ? '모든 국가'
                                                                : `${getCountryDisplayName(preset.config.country || '')} ${getNodeTypeLabel(preset.config.nodeType || '')}`
                                                            : '호주 ➔ 한국 수송로'}
                                                        {' • '}
                                                        {DISRUPTION_TYPE_CONFIGS[preset.config.disruptionType]?.label}
                                                    </span>
                                                </div>
                                            </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 시나리오 구성 UI (카드 테두리 형태) */}
                        <div className="border border-border/40 bg-muted/20 rounded-[4px] overflow-hidden transition-all duration-200">
                            <div
                                className="p-2.5 px-3 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors select-none"
                                onClick={() => setIsCustomConfigOpen(!isCustomConfigOpen)}
                            >
                                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <SlidersHorizontal className="w-3.5 h-3.5 opacity-70" />
                                    시나리오 조건 직접 구성
                                </div>
                                {isCustomConfigOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform" />
                                )}
                            </div>
                            {isCustomConfigOpen && (
                                <div className="p-2.5 pt-2 border-t border-border/40 space-y-2">
                                    {/* 대상 유형 선택 */}
                                    <div className="mb-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <label
                                                htmlFor="sim-target-type"
                                                className="block text-[11px] font-medium text-muted-foreground"
                                            >
                                                대상 유형
                                            </label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="xs"
                                                onClick={handleResetScenario}
                                                className="h-5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted font-medium cursor-pointer gap-1 px-1.5 py-0 rounded-[3px]"
                                                title="시나리오 구성 초기화"
                                                aria-label="시나리오 구성 초기화"
                                            >
                                                <RotateCcw className="w-2.5 h-2.5" />
                                                Reset
                                            </Button>
                                        </div>
                                        <Select
                                            value={currentDisruption.targetType}
                                            onValueChange={(val) => {
                                                setTargetType(val as 'node' | 'edge');
                                                setTargetId('');
                                            }}
                                        >
                                            <SelectTrigger id="sim-target-type" size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                <SelectItem value="node" className="text-[11px] rounded-[3px]">시설 (노드)</SelectItem>
                                                <SelectItem value="edge" className="text-[11px] rounded-[3px]">경로 (엣지)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 대상 지정 선택 */}
                                    <div className="mb-2">
                                        <label
                                            htmlFor="sim-target-id"
                                            className="block text-[11px] font-medium text-muted-foreground mb-1"
                                        >
                                            {currentDisruption.targetType === 'node' ? '대상 시설 (노드)' : '대상 경로 (엣지)'}
                                        </label>

                                        {/* 노드 타겟팅 활성화 및 국가/시설유형 가로 필터 렌더링 */}
                                        {currentDisruption.targetType === 'node' && (
                                             <div className="flex gap-2 mb-1.5">
                                                <div className="flex-1">
                                                    <Select
                                                        value={selectedCountry}
                                                        onValueChange={(val) => {
                                                            setSelectedCountry(val);
                                                            setTargetId('');
                                                        }}
                                                    >
                                                        <SelectTrigger
                                                            size="sm"
                                                            className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                            <SelectValue placeholder="국가 필터" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                            {countryOptions.map((opt) => (
                                                                <SelectItem key={opt.value} value={opt.value} className="text-[11px] rounded-[3px]">
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex-1">
                                                    <Select
                                                        value={selectedNodeType}
                                                        onValueChange={(val) => {
                                                            setSelectedNodeType(val);
                                                            setTargetId('');
                                                        }}
                                                    >
                                                        <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                            <SelectValue placeholder="시설 종류 필터" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                            {nodeTypeOptions.map((opt) => (
                                                                <SelectItem key={opt.value} value={opt.value} className="text-[11px] rounded-[3px]">
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {/* [분기 1] 노드 타겟팅일 때의 노드 선택 UI */}
                                        {currentDisruption.targetType === 'node' && (
                                            <>
                                                {targetOptions.length === 0 ? (
                                                    <div className="p-2 bg-red-950/40 border border-red-800 rounded-[4px] text-xs font-semibold text-red-400 flex items-center gap-1.5">
                                                        <span>⚠ 조건에 일치하는 시설이 없습니다.</span>
                                                    </div>
                                                ) : (
                                                    <Select
                                                        value={currentDisruption.targetId}
                                                        onValueChange={(val) => setTargetId(val)}
                                                    >
                                                        <SelectTrigger id="sim-target-id" size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                            <SelectValue placeholder="-- 선택 --" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                            {targetOptions.map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id} className="text-[11px] rounded-[3px]">
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </>
                                        )}

                                        {/* [분기 2] 엣지 타겟팅일 때의 출발지 -> 도착지 다단계 필터 UI */}
                                        {currentDisruption.targetType === 'edge' && (
                                            <div className="space-y-2">
                                                {/* 1. 출발 시설 선택 */}
                                                <div>
                                                    <Select
                                                        value={selectedSourceNodeId}
                                                        onValueChange={(val) => {
                                                            setSelectedSourceNodeId(val);
                                                            setTargetId('');
                                                        }}
                                                    >
                                                        <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                            <SelectValue placeholder="-- 출발 시설 선택 --" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                            <SelectItem value="ALL" className="text-[11px] rounded-[3px]">-- 출발 시설 선택 --</SelectItem>
                                                            {sourceNodeOptions.map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id} className="text-[11px] rounded-[3px]">
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* 2. 도착 시설(최종 엣지) 선택 */}
                                                <div>
                                                    {selectedSourceNodeId === 'ALL' ? (
                                                        <div className="p-2 bg-muted border border-border rounded-[4px] text-xs text-muted-foreground text-center">
                                                            출발 시설을 먼저 선택해주세요.
                                                        </div>
                                                    ) : targetEdgeOptions.length === 0 ? (
                                                        <div className="p-2 bg-red-950/40 border border-red-800 rounded-[4px] text-xs font-semibold text-red-400 flex items-center gap-1.5">
                                                            <span>⚠ 해당 출발 시설에서 연결된 물류 경로가 없습니다.</span>
                                                        </div>
                                                    ) : (
                                                        <Select
                                                            value={currentDisruption.targetId}
                                                            onValueChange={(val) => setTargetId(val)}
                                                        >
                                                            <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                                <SelectValue placeholder="-- 도착 시설 선택 --" />
                                                            </SelectTrigger>
                                                            <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                                {targetEdgeOptions.map((opt) => (
                                                                    <SelectItem key={opt.edgeId} value={opt.edgeId} className="text-[11px] rounded-[3px]">
                                                                        {opt.targetLabel}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 충격 유형 선택 (드롭다운) */}
                                    <div className="mb-2">
                                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                            충격 유형
                                        </label>
                                        <Select
                                            value={currentDisruption.disruptionType}
                                            onValueChange={(val) => setDisruptionType(val as DisruptionType)}
                                        >
                                            <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground rounded-[4px]">
                                                <SelectValue placeholder="-- 충격 유형 선택 --" />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="bg-card border border-border text-foreground rounded-[4px]">
                                                {(Object.keys(DISRUPTION_TYPE_CONFIGS) as DisruptionType[]).map((typeKey) => {
                                                    const config = DISRUPTION_TYPE_CONFIGS[typeKey]!;
                                                    const badgeText =
                                                        typeKey === 'export_restriction'
                                                            ? '지정학'
                                                            : typeKey === 'facility_closure'
                                                                ? '공급'
                                                                : '물류';

                                                    return (
                                                        <SelectItem key={typeKey} value={typeKey} className="text-[11px] py-1 cursor-pointer rounded-[3px]">
                                                            <div className="flex items-center justify-between w-full gap-2 text-[11px]">
                                                                <span className="text-[11px] font-normal">{config.label}</span>
                                                                <span className="text-[10px] text-muted-foreground font-normal">[{badgeText}]</span>
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 심각도 슬라이더 */}
                                    {(() => {
                                        const activeConfig = DISRUPTION_TYPE_CONFIGS[currentDisruption.disruptionType];
                                        if (!activeConfig) return null;
                                        return (
                                            <div className="mb-2">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[11px] font-medium text-muted-foreground">
                                                        {activeConfig.sliderLabel}
                                                    </label>
                                                    <span className="text-xs font-bold text-primary">
                                                        {activeConfig.formatValue(currentDisruption.severity)}
                                                    </span>
                                                </div>
                                                <Slider
                                                    value={[currentDisruption.severity]}
                                                    min={activeConfig.min}
                                                    max={activeConfig.max}
                                                    step={activeConfig.step}
                                                    onValueChange={([val]) => setSeverity(val)}
                                                    className="py-1"
                                                />
                                                <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                                                    <span>{activeConfig.minLabel}</span>
                                                    <span>{activeConfig.maxLabel}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* 충격 추가 버튼 */}
                                    <Button
                                         type="button"
                                         onClick={handleAddDisruption}
                                         disabled={!currentDisruption.targetId}
                                         variant="secondary"
                                         className="w-full h-8 text-xs font-semibold shadow-xs cursor-pointer border border-border/50 text-secondary-foreground hover:border-primary/50 disabled:border-border/30 disabled:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-[4px]"
                                     >
                                         + 충격 조건 추가
                                     </Button>
                                 </div>
                            )}
                        </div>

                        {/* 구성된 충격 리스트 (디바이더 구분 형태) */}
                        {disruptions.length > 0 && (
                            <div className="border-t border-border/40 pt-3">
                                <div className="text-[11px] font-semibold text-foreground mb-2 px-0.5 flex justify-between items-center">
                                    <span>적용될 충격 목록 ({disruptions.length})</span>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={clearDisruptions}
                                        className="h-5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 font-medium cursor-pointer px-1.5 rounded-[3px]"
                                        title="적용될 충격 목록 초기화"
                                        aria-label="적용될 충격 목록 초기화"
                                    >
                                        초기화
                                    </Button>
                                </div>
                                <ul className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                    {disruptions.map((d, idx) => (
                                        <li key={idx} className="flex justify-between items-center p-2 bg-muted/30 border border-border/30 rounded-[3px] text-[11px]">
                                            <span className="truncate pr-2 text-foreground">
                                                {d.targetType === 'node' ? '시설: ' : '경로: '}
                                                {d.targetId === 'ALL_NODES'
                                                    ? (() => {
                                                        const countryName = !d.country || d.country === 'ALL' ? '모든 국가' : getCountryDisplayName(d.country);
                                                        const typeName = !d.nodeType || d.nodeType === 'ALL' ? '모든 시설' : getNodeTypeLabel(d.nodeType);
                                                        return `${countryName} ${typeName} (전체)`;
                                                    })()
                                                    : d.targetId} ({DISRUPTION_TYPE_CONFIGS[d.disruptionType]?.label} {DISRUPTION_TYPE_CONFIGS[d.disruptionType]?.formatValue(d.severity)})
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => removeDisruption(idx)}
                                                className="h-4 w-4 text-muted-foreground hover:text-destructive p-0 rounded-[2px]"
                                            >
                                                ✕
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* 시뮬레이션 실행 버튼 */}
                        <Button
                            onClick={handleRunSimulation}
                            disabled={isRunning || disruptions.length === 0}
                            variant="default"
                            className="w-full h-8 mb-3 shadow-xs text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover cursor-pointer transition-colors rounded-[4px]"
                            aria-label="시뮬레이션 실행"
                        >
                            {isRunning ? '실행 중...' : '▶ 시뮬레이션 실행'}
                        </Button>

                        {/* 로딩 상태 & 3초 타임아웃 인디케이터 */}
                        {isRunning && (
                            <div
                                className="mb-4"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={3}
                                aria-valuenow={Math.min(elapsedSeconds, 3)}
                                aria-label="시뮬레이션 실행 진행률"
                            >
                                <div className="flex justify-between text-[11px] font-medium text-muted-foreground mb-1">
                                    <span>실행 중...</span>
                                    <span>{Math.min(elapsedSeconds, 3).toFixed(1)}s / 3.0s</span>
                                </div>
                                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-100 ease-linear"
                                        style={{ width: `${timeoutProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* 에러 메시지 */}
                        {error && (
                            <div
                                className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-[4px] text-xs mb-3 font-medium flex items-center gap-1.5"
                                role="alert"
                                aria-live="assertive"
                            >
                                ⚠ {error}
                            </div>
                        )}
                    </div>

                </aside>

                {/* 2열: 시뮬레이션 결과 요약 및 이력 (shadcn UI Tabs) */}
                <aside
                    className={`h-full bg-card border-r border-border shadow-lg flex flex-col pointer-events-auto transition-all duration-300 ease-in-out ${isSecondColumnOpen ? 'w-[380px] opacity-100 border-l border-border' : 'w-0 opacity-0 overflow-hidden border-l-0'
                        }`}
                    aria-label="시뮬레이션 결과 및 이력"
                >
                    <div className="w-[380px] h-full p-4 flex flex-col min-h-0">
                        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'result' | 'history')} className="w-full h-full flex flex-col">
                            <TabsList className="w-full h-10 grid grid-cols-2 p-0 bg-transparent border-b border-border/40 rounded-none shrink-0">
                                <TabsTrigger
                                    value="result"
                                    className="h-full gap-1.5 font-medium text-xs rounded-none border-b-2 border-transparent bg-transparent text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none -mb-[1px] cursor-pointer"
                                >
                                    <span>시뮬레이션 결과</span>
                                    {result && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="history"
                                    className="h-full gap-1.5 font-medium text-xs rounded-none border-b-2 border-transparent bg-transparent text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none -mb-[1px] cursor-pointer"
                                >
                                    <span>시뮬레이션 이력</span>
                                    {historyEntries.length > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted-foreground/15 text-muted-foreground font-mono">
                                            {historyEntries.length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="result" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col space-y-3 p-1">
                                {result ? (
                                    <>
                                        <SimulationResultSection
                                            result={result}
                                            onClear={() => {
                                                clearResult();
                                                clearDisruptions();
                                                setIsSecondColumnOpen(false);
                                            }}
                                        />
                                        <ReRoutingPanel
                                            reroutingResults={activeRerouteOptions || result.reroutingResults || []}
                                        />
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-muted/20 border border-dashed border-border rounded-[4px] text-muted-foreground">
                                        <p className="text-xs font-medium">실행된 시뮬레이션 결과가 없습니다.</p>
                                        <p className="text-[11px] text-muted-foreground/70 mt-1">좌측 패널에서 시나리오를 구성하고 '시뮬레이션 실행'을 누르세요.</p>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="history">
                                {historyEntries.length > 0 ? (
                                    <SimulationHistorySection
                                        entries={historyEntries}
                                        isLoading={isLoadingHistory}
                                        onEntryClick={handleHistoryClick}
                                    />
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-muted/20 border border-dashed border-border rounded-[4px] text-muted-foreground">
                                        <p className="text-xs font-medium">저장된 시뮬레이션 이력이 없습니다.</p>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>
                </aside>

                {/* 2열 슬라이드 아웃 토글 버튼 - 패널 우측 경계에 완벽히 밀착 */}
                {(historyEntries.length > 0 || result) && (
                    <button
                        onClick={() => setIsSecondColumnOpen(!isSecondColumnOpen)}
                        className="absolute top-1/2 -translate-y-1/2 w-6 h-12 bg-card hover:bg-accent border border-border border-l-0 rounded-r-[4px] shadow-md z-10 flex items-center justify-center cursor-pointer pointer-events-auto text-muted-foreground hover:text-foreground transition-all duration-300 ease-in-out"
                        style={{ left: isSecondColumnOpen ? '760px' : '380px' }}
                        title={isSecondColumnOpen ? "결과/이력 패널 접기" : "결과/이력 패널 펼치기"}
                        aria-label={isSecondColumnOpen ? "결과/이력 패널 접기" : "결과/이력 패널 펼치기"}
                    >
                        {isSecondColumnOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                )}
            </div>
        </div>
    );
}
