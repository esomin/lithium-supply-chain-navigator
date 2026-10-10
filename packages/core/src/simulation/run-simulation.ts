import type {
    DisruptionScenario,
    SupplyChainNode,
    SupplyChainEdge,
    SimulationResult,
    PropagationPath,
    DeficitResult,
} from '@navigator/shared';
import { computePropagationPath } from './compute-propagation.js';
import { calculateSupplyDeficit } from './calculate-deficit.js';

/** 시뮬레이션 실행 옵션 */
export interface SimulationOptions {
    /** 감쇄율 (기본값: 0.7) */
    attenuationRate?: number;
    /** 영향 전파 중단 임계값 (기본값: 0.01) */
    impactThreshold?: number;
    /** 시나리오 별 타임아웃 (ms, 기본값: 3000) */
    timeoutMs?: number;
}

/** 기본 타임아웃 값 (ms) */
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * 단일 시나리오 시뮬레이션 실행.
 *
 * 시나리오 내 모든 교란에 대해 전파 경로와 공급 부족을 계산하고,
 * 결과를 하나의 SimulationResult로 병합하여 반환한다.
 */
export function runSingleSimulation(
    scenario: DisruptionScenario,
    allNodes: SupplyChainNode[],
    allEdges: SupplyChainEdge[],
    options?: SimulationOptions,
): SimulationResult {
    const startTime = performance.now();

    const propagationPaths: PropagationPath[] = [];
    const deficits: DeficitResult[] = [];

    // 각 교란에 대해 전파 경로 및 공급 부족 계산
    for (const disruption of scenario.disruptions) {
        // 시작 노드 결정: node 대상은 targetId, edge 대상은 엣지의 sourceNodeId
        let startNodeId = disruption.targetId;
        if (disruption.targetType === 'edge') {
            const edge = allEdges.find((e) => e.id === disruption.targetId);
            if (edge) {
                startNodeId = edge.sourceNodeId;
            }
        }

        // 전파 경로 계산
        const path = computePropagationPath(
            startNodeId,
            disruption,
            allNodes,
            allEdges,
            {
                attenuationRate: options?.attenuationRate,
                impactThreshold: options?.impactThreshold,
            },
        );

        if (path.nodes.length > 0) {
            propagationPaths.push(path);

            // 공급 부족 계산
            const deficitResults = calculateSupplyDeficit(path, allNodes, allEdges);
            deficits.push(...deficitResults);
        }
    }

    const executionTimeMs = performance.now() - startTime;

    // 결손 노드 집계 및 상하류 중복 방지 순 결손(Net Deficit) 계산
    const deficitNodeIdSet = new Set(deficits.filter((d) => d.deficitPercentage > 0).map((d) => d.nodeId));
    const isUpstreamOfAnotherDeficitNode = (nodeId: string): boolean => {
        return allEdges.some(
            (e) => e.sourceNodeId === nodeId && deficitNodeIdSet.has(e.targetNodeId),
        );
    };

    let totalGrossDeficitTons = 0;
    let totalNetDeficitTons = 0;
    let sumDeficitPercentage = 0;

    deficits.forEach((d) => {
        sumDeficitPercentage += d.deficitPercentage;
        const tons = d.defectQuantityTons || 0;
        totalGrossDeficitTons += tons;

        if (!isUpstreamOfAnotherDeficitNode(d.nodeId)) {
            totalNetDeficitTons += tons;
        }
    });

    if (totalNetDeficitTons === 0 && deficits.length > 0) {
        totalNetDeficitTons = totalGrossDeficitTons;
    }

    const averageDeficitPercentage = deficits.length > 0
        ? Math.round((sumDeficitPercentage / deficits.length) * 10) / 10
        : 0;

    return {
        scenarioId: scenario.id,
        propagationPaths,
        deficits,
        executionTimeMs,
        totalNetDeficitTons,
        totalGrossDeficitTons,
        averageDeficitPercentage,
    };
}

/**
 * 복수 시나리오 동시 시뮬레이션 실행.
 *
 * 여러 시나리오를 Promise.all을 사용하여 병렬로 실행한다.
 * 각 시나리오는 독립적이며 공유 상태를 변경하지 않는다.
 * 타임아웃 초과 시 부분 결과와 함께 타임아웃 값을 executionTimeMs로 설정한다.
 */
export async function runConcurrentSimulations(
    scenarios: DisruptionScenario[],
    allNodes: SupplyChainNode[],
    allEdges: SupplyChainEdge[],
    options?: SimulationOptions,
): Promise<SimulationResult[]> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // 각 시나리오를 독립적으로 실행하되, 타임아웃 처리 포함
    const promises = scenarios.map((scenario) =>
        runWithTimeout(scenario, allNodes, allEdges, options, timeoutMs),
    );

    return Promise.all(promises);
}

/**
 * 타임아웃을 적용하여 단일 시뮬레이션 실행.
 *
 * 타임아웃 초과 시 빈 결과를 반환하고 executionTimeMs를 타임아웃 값으로 설정한다.
 */
function runWithTimeout(
    scenario: DisruptionScenario,
    allNodes: SupplyChainNode[],
    allEdges: SupplyChainEdge[],
    options: SimulationOptions | undefined,
    timeoutMs: number,
): Promise<SimulationResult> {
    return new Promise<SimulationResult>((resolve) => {
        const timer = setTimeout(() => {
            // 타임아웃 발생 시 부분 결과 반환
            resolve({
                scenarioId: scenario.id,
                propagationPaths: [],
                deficits: [],
                executionTimeMs: timeoutMs,
            });
        }, timeoutMs);

        // 시뮬레이션을 비동기적으로 실행 (microtask로 예약)
        Promise.resolve().then(() => {
            const result = runSingleSimulation(scenario, allNodes, allEdges, options);
            clearTimeout(timer);
            resolve(result);
        });
    });
}
