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
    summaryLabel?: string;
    config: {
        targetType: 'node' | 'edge';
        country?: string;
        nodeType?: string;
        sourceNodeId?: string;
        targetId: string;
        disruptionType: DisruptionType;
        severity: number;
    };
    /** 복수 충격으로 확장 시 적용될 충격 목록 (정의 시 단일 config 대신 우선 적용) */
    disruptions?: Array<{
        targetType: 'node' | 'edge';
        country?: string;
        nodeType?: string;
        sourceNodeId?: string;
        targetId: string;
        disruptionType: DisruptionType;
        severity: number;
    }>;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
    {
        id: 'latin-nationalization',
        name: '남미 생산·물류 차질',
        description: '아르헨티나 안데스 고지대의 악천후 및 산악 도로 접근 제한으로 살타·옴브레 무에르토 리튬 생산·정제 시설의 출하 및 인도 일정이 40% 지연·차질을 빚는 현실적 공급망 병목 시나리오입니다.',
        badge: '공급·물류',
        summaryLabel: '아르헨티나 고지대의 악천후·도로 접근 제한',
        config: {
            targetType: 'node',
            country: 'Argentina',
            nodeType: 'ALL',
            disruptionType: 'facility_closure',
            severity: 0.4,
            targetId: 'ALL_NODES',
        },
        disruptions: [
            {
                targetType: 'node',
                country: 'Argentina',
                nodeType: 'ALL',
                disruptionType: 'facility_closure',
                severity: 0.4,
                targetId: 'ALL_NODES',
            },
        ],
    },
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
        id: 'pilbara-cyclone-disruption',
        name: '호주 필바라 광산 기습 침수',
        description: '호주 서부 필바라 지역의 기습적 대형 사이클론 및 폭우로 필강구라(Pilgangoora) 광산 채굴 및 선광 플랜트가 침수되어 가동률이 70% 급감하는 단일 핵심 광산 조업 중단 시나리오입니다.',
        badge: '자연재해',
        summaryLabel: '호주 필강구라 리튬 광산 침수',
        config: {
            targetType: 'node',
            country: 'Australia',
            nodeType: 'Mine',
            disruptionType: 'facility_closure',
            severity: 0.7,
            targetId: 'MINE_AU_PILBARA',
        },
    },
];
