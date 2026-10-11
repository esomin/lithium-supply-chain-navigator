import type { DisruptionType } from '@navigator/shared';

export interface DisruptionTypeConfig {
    label: string;
    description: string;
    sliderLabel: string;
    min: number;
    max: number;
    step: number;
    formatValue: (val: number) => string;
    minLabel: string;
    maxLabel: string;
    defaultVal: number;
}

export const DISRUPTION_TYPE_CONFIGS: Partial<Record<DisruptionType, DisruptionTypeConfig>> = {
    export_restriction: {
        label: '수출 통제',
        description: '[지정학] 국가별 수출 통제 및 관세',
        sliderLabel: '수출 물량 제한율',
        min: 0,
        max: 1,
        step: 0.05,
        formatValue: (val: number) => `${(val * 100).toFixed(0)}%`,
        minLabel: '0%',
        maxLabel: '100%',
        defaultVal: 0.5,
    },
    facility_closure: {
        label: '조업 중단',
        description: '[공급] 광산/제련소 가동 중단',
        sliderLabel: '생산 능력 감소율',
        min: 0,
        max: 1,
        step: 0.05,
        formatValue: (val: number) => `${(val * 100).toFixed(0)}%`,
        minLabel: '0%',
        maxLabel: '100%',
        defaultVal: 0.5,
    },
    logistics_disruption: {
        label: '물류 마비',
        description: '[물류] 해운 경로 마비 및 운임 폭등',
        sliderLabel: '운송 리드타임 지연',
        min: 1,
        max: 5,
        step: 0.5,
        formatValue: (val: number) => `${val.toFixed(1)}배`,
        minLabel: '1배',
        maxLabel: '5배',
        defaultVal: 1.0,
    },
};

export interface ScenarioPreset {
    id: string;
    name: string;
    description: string;
    badge: string;
    config: {
        targetType: 'node' | 'edge';
        country?: string;
        nodeType?: string;
        sourceNodeId?: string;
        targetId: string;
        disruptionType: DisruptionType;
        severity: number;
    };
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
    {
        id: 'china-export-restriction',
        name: '중국 리튬 수출 통제',
        description: '지정학적 갈등 심화 및 자원 무기화로 인해 중국 내 리튬 제련 시설의 대외 수출 가능 물량이 80% 강력히 제한되는 고위험 규제 시나리오입니다.',
        badge: '지정학',
        config: {
            targetType: 'node',
            country: 'China',
            nodeType: 'Refinery',
            disruptionType: 'export_restriction',
            severity: 0.8,
            targetId: 'REF_CN_LITHIUM',
        },
    },
    {
        id: 'latin-nationalization',
        name: '남미 리튬 삼각지대 국유화 및 조업 중단',
        description: '남미 자원 민족주의 고조에 따라 칠레 주요 광산의 국가 통제 및 조업 중단으로 유통 공급망에서 자원 공급 능력이 50% 제한되는 시나리오입니다.',
        badge: '공급',
        config: {
            targetType: 'node',
            country: 'Chile',
            nodeType: 'Mine',
            disruptionType: 'facility_closure',
            severity: 0.5,
            targetId: 'MINE_CL_ATACAMA',
        },
    },
    {
        id: 'sea-route-blockade',
        name: '주요 해상 경로 봉쇄',
        description: '핵심 대양 해상 항로 마비 및 항만 지정학 지정 이슈로 호주 광산-중국/한국 제련소 간 핵심 수송 리드타임이 3배로 대폭 지연되는 물류 마비 시나리오입니다.',
        badge: '물류',
        config: {
            targetType: 'edge',
            sourceNodeId: 'MINE_AU_PILBARA',
            disruptionType: 'logistics_disruption',
            severity: 3.0,
            targetId: 'E-MINE_AU_PILBARA-REF_KR_POSCO_PILBARA',
        },
    },
];
