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
import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw, Sparkles, SlidersHorizontal, X } from 'lucide-react';
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
                    충격 시뮬레이션
                </h2>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center"
                        aria-label="충격 시뮬레이션 패널 접기"
                        title="패널 접기"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* 패널 칼럼 바디 (1열 + 2열) */}
            <div className="flex-1 min-h-0 flex pointer-events-none">
                {/* 1열: 시뮬레이션 설정 및 입력 폼 */}
                <aside
                    className="w-[380px] h-full bg-card border-r border-border p-4 pr-2 pt-3 shadow-md flex flex-col pointer-events-auto relative"
                    aria-label="시뮬레이션 입력 및 설정 제어"
                >
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 p-1">
                        {/* 시나리오 프리셋 선택 카드 (아이디어 1: Hero 하이라이트) */}
                        <Card className="border border-primary/40 bg-gradient-to-b from-primary/15 via-primary/5 to-card/70 backdrop-blur-xs shadow-md ring-1 ring-primary/20 mb-3 overflow-visible relative z-10 rounded-lg">
                            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between space-y-0 border-b border-primary/15">
                                <CardTitle className="text-xs font-bold text-primary flex items-center gap-1.5 tracking-normal">
                                    <Sparkles className="w-3.5 h-3.5 fill-primary/30" />
                                    추천 시나리오 프리셋
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2.5 pt-2 overflow-visible">
                                <div className="flex flex-col gap-1.5 overflow-visible">
                                    {SCENARIO_PRESETS.map((preset, index) => {
                                        const isSelected =
                                            currentDisruption.disruptionType === preset.config.disruptionType &&
                                            currentDisruption.targetType === preset.config.targetType &&
                                            currentDisruption.targetId === preset.config.targetId &&
                                            Math.abs(currentDisruption.severity - preset.config.severity) < 0.01;

                                        const isLast = index === SCENARIO_PRESETS.length - 1;

                                        const badgeColor = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';

                                        const severityVal =
                                            DISRUPTION_TYPE_CONFIGS[preset.config.disruptionType]?.formatValue(
                                                preset.config.severity,
                                            ) ?? '';

                                        return (
                                            <div key={preset.id} className="relative group hover:z-50">
                                                <button
                                                    type="button"
                                                    onClick={() => handleApplyPreset(preset)}
                                                    className={`w-full text-left p-2.5 rounded-md border transition-all cursor-pointer flex flex-col gap-1.5 ${isSelected
                                                        ? 'bg-primary/20 border-primary shadow-sm ring-1 ring-primary/50 text-foreground font-semibold'
                                                        : 'bg-card/85 border-border/80 text-muted-foreground hover:bg-primary/5 hover:border-primary/40 hover:text-foreground'
                                                        }`}
                                                    aria-label={`프리셋 적용: ${preset.name}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span
                                                                className={`text-[10px] font-bold py-0.5 rounded border shrink-0 w-11 text-center ${badgeColor}`}
                                                            >
                                                                {preset.badge}
                                                            </span>
                                                            <span
                                                                className={`text-xs font-semibold leading-tight truncate ${isSelected
                                                                    ? 'text-primary font-bold'
                                                                    : 'text-foreground'
                                                                    }`}
                                                            >
                                                                {preset.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {isSelected && (
                                                                <span className="text-[9px] font-bold text-primary px-1 py-0.2 rounded bg-primary/10 border border-primary/20">
                                                                    선택됨
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-background/90 border border-border text-foreground shrink-0 shadow-2xs">
                                                                {severityVal}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] opacity-75 leading-tight flex items-center justify-between text-muted-foreground">
                                                        <span className="truncate">
                                                            {preset.config.targetType === 'node'
                                                                ? preset.config.country === 'ALL'
                                                                    ? '모든 국가'
                                                                    : `${getCountryDisplayName(preset.config.country || '')} ${getNodeTypeLabel(preset.config.nodeType || '')}`
                                                                : '호주 ➔ 한국 수송로'}
                                                            {' • '}
                                                            {DISRUPTION_TYPE_CONFIGS[preset.config.disruptionType]?.label}
                                                        </span>
                                                    </div>
                                                </button>
                                                {/* 마우스 호버 시 나오는 상세 설명 툴팁 */}
                                                <div
                                                    className={`absolute hidden group-hover:block z-50 w-64 p-2.5 bg-popover text-popover-foreground text-[10px] leading-relaxed rounded-md border border-border shadow-xl pointer-events-none ${isLast ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                                                        } left-0`}
                                                >
                                                    <div className="font-semibold text-foreground mb-0.5">
                                                        {preset.name}
                                                    </div>
                                                    <div className="text-muted-foreground">{preset.description}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 시나리오 구성 UI (아이디어 2: 아코디언 접기 형태) */}
                        <Card className="border border-border/70 bg-card/60 shadow-xs mb-3 transition-all duration-200">
                            <CardHeader
                                className="p-2.5 flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/40 rounded-t-lg transition-colors select-none"
                                onClick={() => setIsCustomConfigOpen(!isCustomConfigOpen)}
                            >
                                <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                    <SlidersHorizontal className="w-3 h-3 opacity-70" />
                                    시나리오 조건 구성(Custom Settings)
                                </CardTitle>
                                {isCustomConfigOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform" />
                                )}
                            </CardHeader>
                            {isCustomConfigOpen && (
                                <CardContent className="p-2.5 pt-2 border-t border-border/40">
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
                                                className="h-5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted font-medium cursor-pointer gap-1 px-1.5 py-0"
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
                                            <SelectTrigger id="sim-target-type" size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                <SelectItem value="node" className="text-[11px]">시설 (노드)</SelectItem>
                                                <SelectItem value="edge" className="text-[11px]">경로 (엣지)</SelectItem>
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
                                                            className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                            <SelectValue placeholder="국가 필터" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                            {countryOptions.map((opt) => (
                                                                <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
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
                                                        <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                            <SelectValue placeholder="시설 종류 필터" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                            {nodeTypeOptions.map((opt) => (
                                                                <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
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
                                                    <div className="p-2 bg-red-950/40 border border-red-800 rounded-md text-xs font-semibold text-red-400 flex items-center gap-1.5">
                                                        <span>⚠ 조건에 일치하는 시설이 없습니다.</span>
                                                    </div>
                                                ) : (
                                                    <Select
                                                        value={currentDisruption.targetId}
                                                        onValueChange={(val) => setTargetId(val)}
                                                    >
                                                        <SelectTrigger id="sim-target-id" size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                            <SelectValue placeholder="-- 선택 --" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                            {targetOptions.map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id} className="text-[11px]">
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
                                                        <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                            <SelectValue placeholder="-- 출발 시설 선택 --" />
                                                        </SelectTrigger>
                                                        <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                            <SelectItem value="ALL" className="text-[11px]">-- 출발 시설 선택 --</SelectItem>
                                                            {sourceNodeOptions.map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id} className="text-[11px]">
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* 2. 도착 시설(최종 엣지) 선택 */}
                                                <div>
                                                    {selectedSourceNodeId === 'ALL' ? (
                                                        <div className="p-2 bg-muted border border-border rounded-md text-xs text-muted-foreground text-center">
                                                            출발 시설을 먼저 선택해주세요.
                                                        </div>
                                                    ) : targetEdgeOptions.length === 0 ? (
                                                        <div className="p-2 bg-red-950/40 border border-red-800 rounded-md text-xs font-semibold text-red-400 flex items-center gap-1.5">
                                                            <span>⚠ 해당 출발 시설에서 연결된 물류 경로가 없습니다.</span>
                                                        </div>
                                                    ) : (
                                                        <Select
                                                            value={currentDisruption.targetId}
                                                            onValueChange={(val) => setTargetId(val)}
                                                        >
                                                            <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                                <SelectValue placeholder="-- 도착 시설 선택 --" />
                                                            </SelectTrigger>
                                                            <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                                {targetEdgeOptions.map((opt) => (
                                                                    <SelectItem key={opt.edgeId} value={opt.edgeId} className="text-[11px]">
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
                                            <SelectTrigger size="sm" className="w-full bg-muted border border-border text-[11px] text-foreground">
                                                <SelectValue placeholder="-- 충격 유형 선택 --" />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="bg-card border border-border text-foreground">
                                                {(Object.keys(DISRUPTION_TYPE_CONFIGS) as DisruptionType[]).map((typeKey) => {
                                                    const config = DISRUPTION_TYPE_CONFIGS[typeKey]!;
                                                    const badgeText =
                                                        typeKey === 'export_restriction'
                                                            ? '지정학'
                                                            : typeKey === 'facility_closure'
                                                                ? '공급'
                                                                : '물류';

                                                    return (
                                                        <SelectItem key={typeKey} value={typeKey} className="text-[11px] py-1 cursor-pointer">
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
                                        className="w-full h-8 text-xs font-bold shadow-xs cursor-pointer bg-gradient-to-r from-secondary via-secondary-hover to-secondary bg-[length:200%_200%] animate-pulse-gradient border border-border text-secondary-foreground hover:border-primary/50 disabled:bg-none disabled:bg-secondary/40 disabled:border-border disabled:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                                    >
                                        + 충격 조건 추가
                                    </Button>
                                </CardContent>
                            )}
                        </Card>

                        {/* 구성된 충격 리스트 */}
                        {disruptions.length > 0 && (
                            <div className="mb-3 p-2 bg-muted border border-border rounded-md">
                                <div className="text-[11px] font-bold text-foreground mb-1.5 flex justify-between items-center">
                                    <span>적용될 충격 목록 ({disruptions.length})</span>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={clearDisruptions}
                                        className="h-5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-card font-medium cursor-pointer gap-1 px-1.5"
                                        title="적용될 충격 목록 전체 삭제"
                                        aria-label="적용될 충격 목록 전체 삭제"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Clear
                                    </Button>
                                </div>
                                <ul className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                    {disruptions.map((d, idx) => (
                                        <li key={idx} className="flex justify-between items-center p-1.5 bg-card border border-border rounded text-[11px]">
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
                                                className="h-4 w-4 text-muted-foreground hover:text-destructive p-0"
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
                            className="w-full h-9 mb-3 shadow-sm font-bold bg-primary text-primary-foreground hover:bg-primary-hover cursor-pointer transition-colors"
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
                                className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-xs mb-3 font-medium flex items-center gap-1.5"
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
                            <TabsList className="w-full grid grid-cols-2 p-1 bg-muted/60 border border-border">
                                <TabsTrigger value="result" className="gap-1.5 font-bold">
                                    <span>시뮬레이션 결과</span>
                                    {result && (
                                        <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="history" className="gap-1.5 font-bold">
                                    <span>시뮬레이션 이력</span>
                                    {historyEntries.length > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted-foreground/15 text-muted-foreground font-mono">
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
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-muted/20 border border-dashed border-border rounded-lg text-muted-foreground">
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
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-muted/20 border border-dashed border-border rounded-lg text-muted-foreground">
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
                        className="absolute top-1/2 -translate-y-1/2 w-6 h-12 bg-card hover:bg-accent border border-border border-l-0 rounded-r-md shadow-md z-10 flex items-center justify-center cursor-pointer pointer-events-auto text-muted-foreground hover:text-foreground transition-all duration-300 ease-in-out"
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
