/**
 * 그래프 렌더링 유틸리티 함수들.
 * 노드 크기 계산, 리스크 색상 매핑 등을 담당한다.
 */

// 리스크 수준별 Fill 색상 매핑
const RISK_COLORS: Record<'green' | 'yellow' | 'red', string> = {
    green: '#b7eb8f',   // 저위험: 녹색
    yellow: '#ffc95e',  // 중위험: 노란색
    red: '#ffa39e',     // 고위험: 빨간색
};

/**
 * 리스크 점수(0-100)를 Fill 색상 hex 코드로 변환.
 *
 * - 0~33: green (저위험)
 * - 34~66: yellow (중위험)
 * - 67~100: red (고위험)
 */
export function getRiskColor(score: number): string {
    const clamped = Math.max(0, Math.min(100, score));
    if (clamped <= 33) return RISK_COLORS.green;
    if (clamped <= 66) return RISK_COLORS.yellow;
    return RISK_COLORS.red;
}

/**
 * production_capacity 값을 노드 반지름(px)으로 변환.
 *
 * 단위별 정규화 후 로그 스케일 적용으로 극단적 차이를 완화한다.
 * - RF-01 (100,000 tons), F-04 (100 GWh): 큰 원
 * - M-03 (5,000 tons_lce), F-03 (10 GWh): 작은 원
 *
 * 반지름 범위: 15px ~ 50px
 */
export function getNodeRadius(
    productionCapacity: number,
    capacityUnit: string,
): number {
    const MIN_RADIUS = 15;
    const MAX_RADIUS = 50;

    // 단위별 정규화를 위한 기준 최대값 (대략적인 스케일 매핑)
    const maxByUnit: Record<string, number> = {
        tons_lce: 200000,    // M-01: 200,000 tons LCE (최대)
        tons: 100000,        // RF-01: 100,000 tons (최대)
        gwh: 100,            // F-04: 100+ GWh (최대)
        tons_cathode: 100000, // F-01: 100,000 tons (양극재)
    };

    const maxCapacity = maxByUnit[capacityUnit] || 100000;

    // 0~1 범위 정규화
    const normalized = Math.min(productionCapacity / maxCapacity, 1);

    // 로그 스케일 적용 (작은 값도 시각적으로 구분 가능)
    // log(1 + x*9) / log(10) → 0일 때 0, 1일 때 1
    const logScale = Math.log10(1 + normalized * 9);

    // 반지름 범위 매핑
    return MIN_RADIUS + logScale * (MAX_RADIUS - MIN_RADIUS);
}

/**
 * 노드 타입별 기본 아이콘/뱃지 텍스트 반환.
 */
export function getNodeTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        Resource: '매장된 자원',
        Mine: '광산',
        Refinery: '제련소',
        Factory: '공장',
    };
    return labels[type] || type;
}

/**
 * 국가별 노드 fill 색상 매핑.
 */
const COUNTRY_COLORS: Record<string, string> = {
    SouthKorea: 'rgba(0, 188, 212, 0.8)',      // 시안
    China: 'rgba(93, 52, 14, 0.8)',            // 브라운
    Chile: 'rgba(0, 57, 166, 0.8)',            // 파랑
    UnitedStates: 'rgba(123, 104, 238, 0.8)', // 보라
    Japan: 'rgba(255, 105, 180, 0.8)',         // 핑크
    Argentina: 'rgba(117, 190, 233, 0.8)',     // 하늘색
    Australia: 'rgba(255, 193, 7, 0.8)',       // 금색
    Poland: 'rgba(220, 53, 69, 0.8)',          // 빨강/크림슨
    NA: 'rgba(136, 136, 136, 0.8)',           // 회색
};

/**
 * 노드 타입별 fill 색상 매핑.
 */
const NODE_TYPE_COLORS: Record<string, string> = {
    Resource: '#0EA5E9',   // 하늘색 (자원)
    Mine: '#10B981',       // 에메랄드 그린 (광산)
    Refinery: '#F59E0B',   // 앰버/주황 (정제소)
    Factory: 'rgba(91, 134, 195, 1)',    // 연한 그레이 (공장)
};

/**
 * 노드 타입을 fill 색상으로 변환.
 */
export function getNodeTypeColor(type: string): string {
    return NODE_TYPE_COLORS[type] || '#6B7280';
}

/**
 * 국가 코드를 노드 fill 색상으로 변환.
 */
export function getCountryColor(country: string): string {
    return COUNTRY_COLORS[country] || '#4a505a';
}

/**
 * 국가 코드를 표시 이름으로 변환.
 */
export function getCountryDisplayName(country: string): string {
    const names: Record<string, string> = {
        SouthKorea: '한국',
        Japan: '일본',
        China: '중국',
        Chile: '칠레',
        UnitedStates: '미국',
        Argentina: '아르헨티나',
        Australia: '호주',
        Poland: '폴란드',
        NA: 'N/A',
    };
    return names[country] || country;
}
