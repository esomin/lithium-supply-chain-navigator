---
doc_type: regulation_summary
source_pdf: ../../raw/regulatory/2024-09094.pdf
institution: IRS / Department of the Treasury
effective_date: 2024-05-06
tier: 1
related_rules:
  - FEOC_25PCT_OWNERSHIP
---

# 미국 IRA §30D 해외우려기관(FEOC) 최종 규정 요약

## 1. 개요 및 목적
미국 재무부(Department of the Treasury) 및 국세청(IRS)이 발표한 인플레이션 감축법(Inflation Reduction Act, IRA) 섹션 30D 신규 청정 차량 세액공제(Clean Vehicle Credit)에 관한 최종 규정(26 CFR Part 1, TD 9995 / Federal Register Vol. 89, No. 88, Doc. 2024-09094)의 핵심 요약이다. 

본 규정은 북미 최종 조립 요건과 더불어, 세액공제 최대 $7,500(핵심광물 요건 $3,750 + 배터리 부품 요건 $3,750)를 수혜받기 위해 충족해야 하는 **해외우려기관(Foreign Entity of Concern, FEOC)** 배제 기준과 **적격 핵심광물(Applicable Critical Minerals)** 산정 요건을 확정한다.

---

## 2. 핵심 정의 및 FEOC 판정 기준

### 2.1 해외우려국가(Covered Nation)
- 미국 법무·안보 기준에 따른 지정 국가: **중국(People's Republic of China), 러시아(Russian Federation), 이란(Iran), 북한(North Korea)**

### 2.2 해외우려기관(FEOC) 지정 요건
다음 중 어느 하나에 해당하는 법인/기관은 FEOC로 지정된다:
1. **소재지/설립지 기준**: 해외우려국가(중국 등) 정부 관할 하에 설립되었거나 주된 사업장이 위치한 법인.
2. **지분 및 의결권 기준 (25% Rule)**:
   - 해외우려국 정부(중앙/지방 정부, 국유기업, 고위 공직자 및 직계가족 포함)가 직접 또는 간접적으로 **이사회 의석, 의결권, 지분의 25% 이상**을 보유·통제하는 법인.
   - 복수 단계의 지분 구조(Tiered Ownership)인 경우 비례 배분 방식으로 지분율을 합산 산정함.
3. **실효적 통제(Effective Control) 기준**:
   - 지분율이 25% 미만이라 하더라도, 라이선스 계약(Licensing Agreement), 기술협력(IP/Tech Transfer), 광물 전량 인수계약(Offtake Agreement) 등을 통해 해외우려국 기관이 생산량, 운영권, 핵심 기술에 대한 **실질적 통제권**을 행사하는 경우 FEOC로 간주.

---

## 3. 단계별 적용 시기 및 실격(Disqualification) 기준

### 3.1 적용 타임라인
- **배터리 부품(Battery Components)**: 2024년 1월 1일 이후 인도되는 차량부터 FEOC 제조·조립 부품 포함 시 전면 실격.
- **핵심광물(Applicable Critical Minerals)**: 2025년 1월 1일 이후 인도되는 차량부터 FEOC에서 추출, 가공, 또는 재활용된 핵심광물 포함 시 전면 실격.

### 3.2 세액공제 박탈 효과
- 공급망 체인(광산 채굴 → 제련/가공 → 양극재/음극재 합성 → 셀/모듈 조립) 중 어느 한 단계라도 FEOC 기관이 개입된 경우:
  - 핵심광물 요건 불충족 → **$3,750 세액공제 박탈**
  - 배터리 부품 요건 불충족 → **$3,750 세액공제 박탈**
  - 양측 모두 위반 시 총 **$7,500 전액 혜택 제외**.

---

## 4. 원산지 추적 및 공급망 실사 의무

### 4.1 추적 시스템(Traceability & Due Diligence)
- 완성차 제조업체(OEM)는 배터리에 투입되는 모든 핵심광물(리튬, 니켈, 코발트, 흑연, 망간 등)에 대해 채굴지부터 최종 셀 제조까지의 전체 공급 경로(Chain of Custody)를 문서로 증명해야 함.
- 공급망 원산지 추적 장부(Allocation Ledger) 제출 의무화.

### 4.2 식별 불가능한 미량 광물(Non-Traceable Battery Materials) 유예
- 흑연 및 특정 미량 광물에 대해 2026년 말까지 한시적 전환 유예기간(Transition Rule)을 부여하나, 리튬(Lithium)과 같은 주요 핵심광물은 **2025년부터 즉시 전수 FEOC 추적** 대상임.

---

## 5. 규칙 연결 (Rule Linkage)
- **연결 규칙 ID**: `FEOC_25PCT_OWNERSHIP`
- **검증 로직 요약**:
  - 공급망 상의 임의의 노드(Entity)가 중국/러시아/이란/북한 관할이거나 해당국 정부/국유기업 지분이 25%를 초과하는 경우 `FEOC_DISQUALIFIED = TRUE`.
