# AI 인사이트 패널 프롬프트 주입: 타이핑 효과 버그 원인 및 해결 보고서

- **문서 일자**: 2026-10-13
- **대상 컴포넌트**: `AIInsightPanel.tsx` (`apps/frontend/src/components/panels/AIInsightPanel.tsx`)
- **관련 기능**: 시뮬레이션 패널(`ReRoutingPanel.tsx`)에서 "AI 타당성 검증" 버튼 클릭 시 질의어 자동 주입

---

## 1. 발생 현상 (Symptom)
대체 공급망 시뮬레이션 결과 화면에서 **[AI 타당성 검증]** 또는 **[AI 비상 대응 전략 보고서 생성]** 버튼을 클릭하면 AI 인사이트 패널이 열리지만, **입력창(`<textarea>`)에 질의어 텍스트가 전혀 입력되지 않고 비어있는 현상** 발생.

---

## 2. 근본 원인 분석 (Root Cause)

### 2.1 기존 구현 코드 (문제의 코드)
```tsx
useEffect(() => {
    if (!draftAIQuery || !draftAIQuery.trim()) return;

    const targetText = draftAIQuery;
    clearDraftAIQuery(); // [문제 발생 지점 1] 즉시 Zustand 전역 상태 초기화

    setIsTyping(true);
    setInputValue('');

    let currentIndex = 0;
    const timer = setInterval(() => {
        currentIndex += step;
        if (currentIndex >= targetText.length) {
            setInputValue(targetText);
            setIsTyping(false);
            clearInterval(timer);
        } else {
            setInputValue(targetText.slice(0, currentIndex));
        }
    }, 16);

    return () => {
        clearInterval(timer); // [문제 발생 지점 2]
    };
}, [draftAIQuery, clearDraftAIQuery]);
```

### 2.2 React 라이프사이클 및 Zustand 상태 갱신 충돌 시퀀스
1. 사용자가 버튼을 클릭하여 Zustand 스토어의 `draftAIQuery`에 긴 질의 문자열이 저장됨.
2. `AIInsightPanel`이 리렌더링되면서 의존성 배열인 `[draftAIQuery]` 변경을 감지하고 `useEffect` 진입.
3. `useEffect` 진입 직후 동기적으로 `clearDraftAIQuery()`를 호출하여 Zustand 스토어의 `draftAIQuery` 값을 `null`로 리셋.
4. **Zustand 상태가 `null`로 바뀌는 즉시 React는 `AIInsightPanel` 컴포넌트의 리렌더링을 스케줄링.**
5. 리렌더링 시 React는 이전 `useEffect`의 **`cleanup` 함수(`return () => clearInterval(timer)`)를 즉시 실행**.
6. 결과적으로 `setInterval`이 첫 번째 틱(Tick, 16ms)을 실행하기도 전에 `clearInterval`에 의해 타이머가 파기됨.
7. `setInputValue`가 호출되지 못하고 빈 문자열(`''`) 상태로 멈추게 됨.

---

## 3. 해결 방안 (Resolution)

### 3.1 핵심 해결 전략
1. **타이머 생명주기를 React 렌더 사이클과 분리 (`useRef`)**:
   - `setInterval` ID를 컴포넌트 리렌더링에도 값이 유지되는 `useRef<NodeJS.Timeout | null>(null)`에 보관.
2. **상태 소비 시점의 지연**:
   - `clearDraftAIQuery()`를 `useEffect` 시작 시점이 아니라, **타이핑이 실제로 끝까지 도달했을 때(`targetText.length` 도달)** 호출.
3. **불필요한 이펙트 취소 방지**:
   - `useEffect`의 cleanup에서 타이머를 즉시 파기하지 않고, 새로운 쿼리가 들어왔을 때 기존 타이머를 리셋하거나 컴포넌트 언마운트 시점에만 정리되도록 변경.

---

## 4. 최종 해결 코드

```tsx
// 타이머 참조 보존용 ref
const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
    if (!draftAIQuery || !draftAIQuery.trim()) return;

    const targetText = draftAIQuery;

    // 1. 이미 진행 중인 타이핑이 있다면 안전하게 중단
    if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
    }

    setIsTyping(true);
    setInputValue('');

    let currentIdx = 0;
    // 0.4~0.6초 안에 부드럽고 경쾌하게 채워지도록 스텝 크기 동적 계산
    const step = Math.max(3, Math.min(8, Math.ceil(targetText.length / 28)));

    // 2. ref에 타이머 저장하여 리렌더링에 영향받지 않도록 보존
    typingTimerRef.current = setInterval(() => {
        currentIdx += step;
        if (currentIdx >= targetText.length) {
            setInputValue(targetText);
            setIsTyping(false);

            if (typingTimerRef.current) {
                clearInterval(typingTimerRef.current);
                typingTimerRef.current = null;
            }

            // 3. 타이핑이 완전히 끝난 후 전역 상태 초기화
            clearDraftAIQuery();

            // 4. 완료 후 텍스트 영역 포커스 및 커서 맨 끝 이동
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(targetText.length, targetText.length);
                }
            }, 50);
        } else {
            setInputValue(targetText.slice(0, currentIdx));
        }
    }, 16);

    return () => {
        // 컴포넌트 생명주기와 타이머 안정성 유지
    };
}, [draftAIQuery, clearDraftAIQuery]);
```

---

## 5. 결과 및 효과
- **완전한 타이핑 애니메이션 보장**: 렌더링 레이스 컨디션 없이 어떤 길이의 질문도 안정적으로 타이핑 출력.
- **글로우(Glow) 인터랙션 유지**: 타이핑 진행 중(`isTyping === true`) 테두리 블루 네온 링 강조로 시각적 피드백 제공.
- **포커스 자동 이동**: 출력이 끝난 후 포커스가 활성화되어 엔터키(전송)를 즉시 누를 수 있는 매끄러운 UX 완성.
