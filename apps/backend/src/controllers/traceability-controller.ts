// ESG 역추적 컨트롤러
import type { TraceabilityReport } from '@navigator/shared';
import { computeUpstreamPaths, generateTraceabilityReport } from '@navigator/core';
import type { DataStore } from '@navigator/database';

/**
 * ESG 역추적 컨트롤러.
 * Factory 노드에서 원재료 소스(Mine)까지의 업스트림 경로를 계산하고
 * 종합 역추적 보고서를 생성한다.
 */
export class TraceabilityController {
    constructor(private readonly store: DataStore) { }

    /**
     * 지정된 Factory 노드의 업스트림 역추적 보고서를 생성한다.
     * 노드가 존재하지 않거나 Factory 타입이 아닌 경우 null을 반환한다.
     * @param factoryNodeId - 역추적 대상 Factory 노드 ID
     * @returns 역추적 보고서 또는 null
     */
    getUpstreamTrace(factoryNodeId: string): TraceabilityReport | null {
        const node = this.store.getNodeById(factoryNodeId);

        // 노드가 없거나 Plant/Factory 타입이 아닌 경우 null 반환
        if (!node || (node.type !== 'Plant' && node.type !== 'Factory')) {
            return null;
        }

        const allNodes = this.store.getNodes();
        const allEdges = this.store.getEdges();

        // 업스트림 경로 계산
        const result = computeUpstreamPaths(factoryNodeId, allNodes, allEdges);

        // 종합 보고서 생성
        const report = generateTraceabilityReport(result);

        return report;
    }
}
