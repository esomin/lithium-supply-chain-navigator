// Simulation Engine Types (Phase 2)

export type DisruptionType =
    | 'export_restriction'  // 수출 통제
    | 'logistics_disruption' // 물류 마비
    | 'facility_closure'     // 조업 중단
    | 'stockpile_policy'     // 비축 정책
    | 'demand_shock'         // 수요 충격

export interface Disruption {
    targetId: string;
    targetType: 'node' | 'edge';
    disruptionType: DisruptionType;
    severity: number; // 0-1
    country?: string;
    nodeType?: string;
}

export interface DisruptionScenario {
    id: string;
    name: string;
    disruptions: Disruption[];
}

export interface PropagationPath {
    nodes: string[];              // affected node IDs in order
    edges: string[];              // path edge IDs in order
    attenuationFactors: number[]; // impact attenuation per step
}

export interface DeficitResult {
    nodeId: string;
    originalSupply: number;
    disruptedSupply: number;
    deficitPercentage: number; // 0-100
    defectQuantityTons?: number; // 화학양론비(LCE)가 반영된 노드별 결손 톤수
    isTerminalConsumer?: boolean; // 하류 소비 공장 여부 (순결손 대상 여부)
}

export type OptimizationCriterion = 'cost' | 'leadTime' | 'balanced';

export interface ReroutingCostImpact {
    unitExtraCostUsd: number;    // 톤당 추가 운임/비용 (USD/ton)
    totalExtraCostUsd: number;   // 총 추가 비용 (USD)
}

export interface ReroutingLeadTimeImpact {
    baseDays: number;            // 기존 리드타임 (일)
    additionalDays: number;      // 추가 소요 리드타임 (일)
    totalDays: number;           // 총 소요 리드타임 (일)
}

export interface ReroutingTargetBreakdown {
    targetNodeId: string;
    targetName: string;
    allocatedVolumeTons: number;
    unitExtraCostUsd: number;
    additionalLeadTimeDays: number;
    totalLeadTimeDays: number;
}

export interface ReroutingOption {
    rank: number;
    sourceNodeId: string;
    sourceName: string;
    targetNodeId: string;
    targetName: string;
    allocatedVolumeTons: number;
    coveredDeficitPercentage: number;
    costImpact: ReroutingCostImpact;
    leadTimeImpact: ReroutingLeadTimeImpact;
    transportType: string;
    hsCode: string;
    suggestedEdgeId: string;
    targetBreakdown?: ReroutingTargetBreakdown[];
}

export interface ReroutingProposalPlan {
    planNumber: 1 | 2 | 3;
    title: string;                 // 예: "1안: 비용 우선" | "2안: 운송시간 우선" | "3안: 밸런스"
    criterion: OptimizationCriterion;
    coveredDeficitPercentage: number;
    remainingDeficitPercentage: number;
    totalExtraCostUsd: number;
    averageExtraLeadTimeDays: number;
    options: ReroutingOption[];
}

export interface ReroutingResult {
    simulationId: string;
    targetNodeId: string;
    targetNodeName: string;
    isGlobalCombined?: boolean;
    defectQuantityTons: number;
    originalDeficitPercentage: number;
    remainingDeficitPercentage: number;
    totalExtraCostUsd: number;
    averageExtraLeadTimeDays: number;
    criterion: OptimizationCriterion;
    plans: ReroutingProposalPlan[]; // 1안, 2안, 3안 종합 시나리오
}

export interface SimulationResult {
    scenarioId: string;
    propagationPaths: PropagationPath[];
    deficits: DeficitResult[];
    executionTimeMs: number;
    totalNetDeficitTons?: number; // 상하류 중복이 제거된 순 결손 총 톤수
    totalGrossDeficitTons?: number; // 단순 계통 결손 합계 톤수
    averageDeficitPercentage?: number; // 전체 평균 결손율 (%)
    reroutingResults?: ReroutingResult[];
}
