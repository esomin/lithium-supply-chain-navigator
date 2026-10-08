---
doc_type: policy_whitepaper
source_pdf: ../../raw/regulatory/30DWhite-Paper.pdf
institution: Department of the Treasury
effective_date: 2023-03-31
tier: 2
related_rules:
  - VALUE_ADD_50PCT_FTA
---

# 미국 재무부 Section 30D 백서 - 핵심광물 부가가치 50% 산정 기준

## 1. 개요
미국 재무부(US Department of the Treasury)가 발표한 Section 30D 핵심광물 및 배터리 부품 요구사항 백서(White Paper on Section 30D)는 전기차 배터리에 사용되는 핵심광물이 세액공제($3,750)를 받기 위한 **적격 공급망(Qualifying Supply Chain)** 및 **부가가치 비율(Value-Added Percentage) 산정 방법론**을 규정한다.

---

## 2. 부가가치 산정 단계 및 방법 (Value-Added Methodology)

### 2.1 3단계 공급망 공정 구분
핵심광물 요건을 충족하기 위해서는 다음 3단계 공정 각각에서 창출된 부가가치를 식별해야 함:
1. **추출(Extraction)**: 원광석 채굴(Mining) 또는 염호에서의 브라인(Brine) 펌핑 및 농축 공정.
2. **가공/정제(Processing)**: 미가공 광물을 화학적·열적 처리를 통해 배터리급 소재(수산화리튬, 탄산리튬, 황산니켈 등) 및 전구체/양극재 활물질로 전환하는 공정.
3. **재활용(Recycling)**: 폐배터리(Black Mass 등)로부터 핵심 금속을 물리·화학적으로 분리·회수하는 공정.

### 2.2 부가가치 산정 공식 (50% Value-Add Threshold)
$$\text{적격 부가가치 비율 (\%)} = \frac{\sum (\text{미국 또는 FTA 체결국 내 추출·가공·재활용으로 창출된 부가가치})}{\sum (\text{전체 공정에서 창출된 총 부가가치})} \times 100$$

- **기준 요건**:
  - 2023년: 40% 이상
  - 2024년: 50% 이상
  - 2025년: 60% 이상
  - 2026년: 70% 이상
  - 2027년 이후: 80% 이상
- *현행 시뮬레이션 및 표준 검증 기준*: **50% 이상 (VALUE_ADD_50PCT_FTA)**

---

## 3. 미국 및 FTA 체결국(Free Trade Agreement Partners) 범위

### 3.1 FTA 적격 국가의 정의
재무부 장관이 지정한 미국과 자유무역협정(FTA)을 발효 중이거나 핵심광물 협정(CMA)을 체결한 국가:
- **주요 광물 공급국**: 호주(Australia), 칠레(Chile), 캐나다(Canada), 멕시코(Mexico)
- **주요 가공/제조국**: 대한민국(Republic of Korea), 일본(Japan - 핵심광물 협정 체결)

### 3.2 비(非) FTA 국가 가공 시의 제약
- 호주에서 리튬 정광(Spodumene)을 채굴(FTA 적격)했더라도, 비FTA 체결국(예: 중국)에서 100% 제련/가공하여 수산화리튬을 생산한 경우:
  - 제련 과정에서 창출된 상당한 부가가치가 비FTA 국가로 귀속되므로, 전체 부가가치 비율이 50% 미만으로 떨어져 세액공제 수혜 자격을 상실할 위험이 매우 높음.

---

## 4. 원산지 증빙 및 추적 절차

1. **원산지 증명서 (Certificate of Origin, COO)**: 광산 및 제련소 단위의 공식 서류 구비.
2. **공정 원가 명세서 (Cost Invoices & Flowcharts)**: 추출원가, 가공 직접비용, 인건비, 감가상각비 등 단계별 부가가치 발생 증빙 제출.
3. **공급망 경로 연결 (Batch-Level Tracking)**: 개별 배터리 셀 팩에 투입된 광물 로트(Lot)의 이력 매핑.

---

## 5. 규칙 연결 (Rule Linkage)
- **연결 규칙 ID**: `VALUE_ADD_50PCT_FTA`
- **검증 로직**:
  - `(미국 및 FTA 국가 내 발생 부가가치 합 / 전체 공정 부가가치 합) >= 0.50` 여부를 판정.
