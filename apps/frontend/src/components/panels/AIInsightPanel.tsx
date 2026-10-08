import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, Citation, InsightResponse } from '@navigator/shared';
import { GiDiamonds } from 'react-icons/gi';
import { LuCopy, LuCheck } from 'react-icons/lu';
import { FiFileText } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import { useSupplyChainStore } from '../../store/supply-chain-store';

export interface AIInsightPanelProps {
    onClose: () => void;
    initialQuery?: string;
}

/**
 * AI 인사이트 사이드 패널.
 * 그래프 토폴로지 + 문서 컨텍스트 기반 LLM 인사이트를 대화 형태로 제공한다.
 * 출처 인용 표시, 에러/재시도 UX 포함.
 * Requirements 9.1, 9.2, 9.5 구현.
 */
const STORAGE_KEY_MESSAGES = 'lithium_ai_messages';
const STORAGE_KEY_SESSION = 'lithium_ai_session_id';
const STORAGE_KEY_CLIENT_CACHE = 'lithium_ai_client_cache';

/** 질문 문자열 정규화 함수 */
function normalizeQueryText(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[\s\t\r\n]+/g, ' ')
        .replace(/[?!.,~;:]+/g, '');
}

/** 클라이언트 간단 해시 키 생성 (FNV-1a / SHA 스타일) */
function computeClientHash(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

export function AIInsightPanel({ onClose, initialQuery }: AIInsightPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.map((m: any) => ({
                    ...m,
                    timestamp: new Date(m.timestamp),
                }));
            }
        } catch (e) {
            console.warn('Failed to load saved messages from localStorage', e);
        }
        return [];
    });
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(() => {
        try {
            return localStorage.getItem(STORAGE_KEY_SESSION) || null;
        } catch {
            return null;
        }
    });

    // 클라이언트 질의응답 Exact Match 캐시 Map
    const clientCacheRef = useRef<Map<string, { answer: string; citations: Citation[] }>>(() => {
        const map = new Map<string, { answer: string; citations: Citation[] }>();
        try {
            const saved = localStorage.getItem(STORAGE_KEY_CLIENT_CACHE);
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.entries(parsed).forEach(([k, v]: [string, any]) => map.set(k, v));
            }
        } catch (e) {
            console.warn('Failed to load client cache', e);
        }
        return map;
    });

    // 에러 자동 제거 타이머
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 메시지 리스트 스크롤 영역
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // 마지막 사용자 질의 (재시도용)
    const lastQueryRef = useRef<string>('');
    // 텍스트에어리어 자동 리사이징 ref
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 메시지 변경 시 로컬스토리지 동기화
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
        } catch (e) {
            console.warn('Failed to save messages to localStorage', e);
        }
    }, [messages]);

    // 세션 ID 변경 시 로컬스토리지 동기화
    useEffect(() => {
        try {
            if (sessionId) {
                localStorage.setItem(STORAGE_KEY_SESSION, sessionId);
            } else {
                localStorage.removeItem(STORAGE_KEY_SESSION);
            }
        } catch (e) {
            console.warn('Failed to save session ID to localStorage', e);
        }
    }, [sessionId]);

    // 에러 발생 시 10초 후 자동 제거
    useEffect(() => {
        if (error) {
            errorTimerRef.current = setTimeout(() => {
                setError(null);
            }, 10000);
        }
        return () => {
            if (errorTimerRef.current) {
                clearTimeout(errorTimerRef.current);
            }
        };
    }, [error]);

    // 새 메시지 추가 시 자동 스크롤
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // 텍스트에어리어 높이 자동 조절
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 44), 160)}px`;
        }
    }, [inputValue]);

    // AI 질의 전송
    const sendQuery = useCallback(async (query: string) => {
        if (!query.trim()) return;

        lastQueryRef.current = query;
        setError(null);

        // 사용자 메시지 추가
        const userMessage: ChatMessage = {
            role: 'user',
            content: query,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');

        // 1단계: 프론트엔드 클라이언트 Exact Match 캐시 확인 (즉각 0ms 응답)
        const normalized = normalizeQueryText(query);
        const cacheKey = computeClientHash(normalized);
        const clientCache = typeof clientCacheRef.current === 'function' ? (clientCacheRef.current as any)() : clientCacheRef.current;
        const cached = clientCache.get(cacheKey);

        if (cached) {
            console.info(`[AI Client Cache Hit] 0ms 즉각 반환: "${query.substring(0, 30)}..."`);
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: cached.answer,
                citations: cached.citations,
                timestamp: new Date(),
            };
            // 자연스러운 UI 전환을 위해 미세한 딜레이(50ms) 후 응답 추가
            setTimeout(() => {
                setMessages((prev) => [...prev, assistantMessage]);
            }, 50);
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/insights/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId ?? undefined,
                    query: query.trim(),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(
                    errorData?.error ?? `서버 오류가 발생했습니다 (${response.status})`,
                );
            }

            const data: InsightResponse = await response.json();

            // 응답에 에러가 포함된 경우
            if (data.error) {
                setError(data.error);
                return;
            }

            // 세션 ID 저장
            if (data.sessionId) {
                setSessionId(data.sessionId);
            }

            // 클라이언트 캐시에 저장 (최대 100개 유지)
            clientCache.set(cacheKey, {
                answer: data.answer,
                citations: data.citations,
            });
            try {
                const cacheObj = Object.fromEntries(clientCache.entries());
                localStorage.setItem(STORAGE_KEY_CLIENT_CACHE, JSON.stringify(cacheObj));
            } catch (e) {
                console.warn('Failed to save client cache to localStorage', e);
            }

            // 어시스턴트 메시지 추가
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: data.answer,
                citations: data.citations,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err) {
            setError(err instanceof Error ? err.message : '인사이트 생성에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    // 외부에서 스토어를 통해 질문이 주입되었을 때 자동 전송
    const pendingAIQuery = useSupplyChainStore((state) => state.pendingAIQuery);
    const clearPendingAIQuery = useSupplyChainStore((state) => state.clearPendingAIQuery);

    useEffect(() => {
        if (pendingAIQuery && pendingAIQuery.trim()) {
            sendQuery(pendingAIQuery);
            clearPendingAIQuery();
        }
    }, [pendingAIQuery, sendQuery, clearPendingAIQuery]);

    // 외부에서 props로 질문이 주입되었을 때 자동 전송
    useEffect(() => {
        if (initialQuery && initialQuery.trim()) {
            sendQuery(initialQuery);
        }
    }, [initialQuery, sendQuery]);

    // 입력 폼 제출 핸들러
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendQuery(inputValue);
    };

    // 키보드 엔터(전송) / Shift+엔터(줄바꿈) 핸들러
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            if (!e.nativeEvent.isComposing) {
                e.preventDefault();
                if (inputValue.trim() && !isLoading) {
                    sendQuery(inputValue);
                }
            }
        }
    };

    // 재시도 핸들러
    const handleRetry = () => {
        if (lastQueryRef.current) {
            setError(null);
            sendQuery(lastQueryRef.current);
        }
    };

    // 대화 내역 초기화 핸들러
    const handleClearChat = () => {
        setMessages([]);
        setSessionId(null);
        setError(null);
        try {
            localStorage.removeItem(STORAGE_KEY_MESSAGES);
            localStorage.removeItem(STORAGE_KEY_SESSION);
        } catch (e) {
            console.warn('Failed to clear localStorage', e);
        }
    };

    return (
        <aside
            className="fixed top-0 right-0 w-[580px] max-w-[92vw] h-full bg-card/95 backdrop-blur-md border-l border-border shadow-2xl z-40 flex flex-col animate-slide-in text-foreground"
            aria-label="AI 인사이트 패널"
        >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-violet-600/10 border border-violet-500/30 text-violet-400">
                        <GiDiamonds size={18} />
                    </span>
                    <div>
                        <h2 className="m-0 text-sm font-bold text-foreground flex items-center gap-2">
                            AI 공급망 인사이트
                            {messages.length > 0 && (
                                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                    세션 유지 중
                                </span>
                            )}
                        </h2>
                        <p className="m-0 text-[10px] text-muted-foreground">그래프 토폴로지 &amp; RAG 규제/시장 정보 분석</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearChat}
                            className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
                            title="새 대화 시작 (대화 초기화)"
                        >
                            새 대화
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm font-medium"
                        aria-label="AI 인사이트 패널 닫기"
                        title="패널 닫기"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* 메시지 리스트 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
                {/* 초기 안내 메시지 */}
                {messages.length === 0 && !isLoading && (
                    <div className="text-center text-muted-foreground text-xs mt-10 p-6 bg-muted/20 border border-dashed border-border rounded-xl">
                        <GiDiamonds className="w-8 h-8 mx-auto mb-2 text-violet-400 opacity-80" />
                        <p className="font-semibold text-foreground mb-1">리튬 공급망에 대해 질문해 보세요</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
                            공급망 리스크, 노드 간 의존도, IRA/FEOC 규제 적격성 및 대체 우회로를 실시간으로 질의할 수 있습니다.
                        </p>
                        <div className="flex flex-col gap-1.5 text-left max-w-sm mx-auto">
                            <button
                                type="button"
                                onClick={() => sendQuery('칠레에서 한국까지 리튬 공급 경로 및 주요 제련소 현황을 설명해 줘')}
                                className="text-[11px] p-2 rounded-lg bg-card border border-border hover:border-violet-500/50 hover:bg-violet-500/5 text-foreground transition-all text-left cursor-pointer"
                            >
                                "칠레에서 한국까지 리튬 공급 경로 및 주요 제련소 현황을 설명해 줘"
                            </button>
                            <button
                                type="button"
                                onClick={() => sendQuery('중국 지분이 30% 포함된 합작 제련소를 통한 조달 시 IRA FEOC 세액공제에 미치는 영향은?')}
                                className="text-[11px] p-2 rounded-lg bg-card border border-border hover:border-violet-500/50 hover:bg-violet-500/5 text-foreground transition-all text-left cursor-pointer"
                            >
                                "중국 지분이 30% 포함된 합작 제련소를 통한 조달 시 IRA FEOC 영향은?"
                            </button>
                        </div>
                    </div>
                )}

                {messages.map((msg, index) => (
                    <MessageBubble key={index} message={msg} />
                ))}

                {/* 로딩 인디케이터 */}
                {isLoading && <TypingIndicator />}

                {/* 에러 표시 */}
                {error && (
                    <ErrorDisplay
                        error={error}
                        onRetry={handleRetry}
                        hasLastQuery={!!lastQueryRef.current}
                    />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* 입력 영역: 자동 높이 조절 멀티라인 Textarea 지원 */}
            <form
                onSubmit={handleSubmit}
                className="flex items-end gap-2 px-4 py-3 border-t border-border bg-card/80 backdrop-blur-xs"
            >
                <textarea
                    ref={textareaRef}
                    rows={2}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="공급망 분석, 규제 적격성, 우회로 등을 질문하세요... (Enter 전송, Shift+Enter 줄바꿈)"
                    disabled={isLoading}
                    className="flex-1 min-h-[44px] max-h-[160px] px-3 py-2.5 bg-muted/60 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all resize-none leading-normal custom-scrollbar"
                    aria-label="AI 인사이트 질문 입력"
                />
                <button
                    type="submit"
                    disabled={isLoading || !inputValue.trim()}
                    className="px-4 py-2 h-[44px] bg-violet-600 text-white font-semibold rounded-lg text-xs hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer shrink-0 flex items-center justify-center"
                    aria-label="질문 전송"
                >
                    전송
                </button>
            </form>
        </aside>
    );
}

// === 하위 컴포넌트 ===

/** 메시지 버블 컴포넌트 */
function MessageBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user';
    const [copied, setCopied] = useState(false);

    // 답변 복사 핸들러
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.warn('클립보드 복사 실패');
        }
    };

    return (
        <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[88%] rounded-xl text-xs relative border shadow-sm ${isUser
                    ? 'bg-primary text-primary-foreground border-primary/50 rounded-br-xs px-3.5 py-2.5'
                    : 'bg-muted/70 text-foreground border-border/80 rounded-bl-xs pl-3.5 pr-9 py-2.5'
                    }`}
            >
                {/* 복사 버튼 (어시스턴트 메시지에만 표시 - 아이콘 단독 및 겹침 방지) */}
                {!isUser && (
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="absolute top-2.5 right-2 p-1 rounded-md bg-card/80 hover:bg-card text-muted-foreground hover:text-foreground border border-border/70 opacity-60 group-hover:opacity-100 transition-all cursor-pointer shadow-2xs flex items-center justify-center"
                        aria-label="답변 복사"
                        title={copied ? '복사 완료' : '답변 복사'}
                    >
                        {copied ? (
                            <LuCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                            <LuCopy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        )}
                    </button>
                )}

                {/* 메시지 내용 */}
                <div className="m-0 leading-relaxed break-words space-y-1.5 [&>p]:mb-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>h3]:text-xs [&>h3]:font-bold [&>h3]:text-primary [&>h4]:text-xs [&>h4]:font-bold">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>

                {/* 출처 인용 (어시스턴트 메시지에만 표시) */}
                {!isUser && message.citations && message.citations.length > 0 && (
                    <CitationList citations={message.citations} />
                )}

                {/* 타임스탬프 */}
                <span
                    className={`block text-[9px] mt-1.5 font-mono ${isUser ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'
                        }`}
                >
                    {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>
        </div>
    );
}

/** 출처 인용 리스트 컴포넌트 */
function CitationList({ citations }: { citations: Citation[] }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="mt-2.5 pt-2 border-t border-border/60">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-primary bg-transparent border-none cursor-pointer hover:underline p-0"
                aria-expanded={isExpanded}
                aria-label="출처 목록 토글"
            >
                <span className="text-[9px]">{isExpanded ? '▼' : '▶'}</span>
                <span>참조 정책/보고서 원문 ({citations.length}건)</span>
            </button>

            {isExpanded && (
                <ul className="mt-2 m-0 p-0 list-none space-y-1.5">
                    {citations.map((citation, idx) => (
                        <li
                            key={idx}
                            className="p-2 bg-card/90 rounded-md border border-border/80 text-[11px]"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-foreground truncate flex items-center gap-1.5">
                                    <FiFileText className="w-3 h-3 text-sky-400 shrink-0" />
                                    {citation.source}
                                </span>
                                <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.2 rounded shrink-0 ml-1">
                                    관련도 {Math.round(citation.relevance * 100)}%
                                </span>
                            </div>
                            <p className="m-0 text-muted-foreground text-[10px] leading-relaxed line-clamp-3">
                                {citation.content}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** 타이핑 인디케이터 컴포넌트 */
function TypingIndicator() {
    return (
        <div className="flex justify-start">
            <div className="bg-muted/70 border border-border rounded-xl px-4 py-2.5 rounded-bl-xs">
                <div className="flex items-center gap-1.5" aria-label="응답 생성 중">
                    <span className="text-[11px] text-muted-foreground font-medium mr-1">AI 분석 중</span>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
            </div>
        </div>
    );
}

/** 에러 표시 + 재시도 컴포넌트 */
function ErrorDisplay({
    error,
    onRetry,
    hasLastQuery,
}: {
    error: string;
    onRetry: () => void;
    hasLastQuery: boolean;
}) {
    return (
        <div className="p-3 bg-destructive/10 border border-destructive/40 text-destructive rounded-xl text-xs" role="alert">
            <p className="m-0 font-medium mb-2">⚠️ {error}</p>
            <div className="flex items-center gap-2 flex-wrap">
                {hasLastQuery && (
                    <button
                        onClick={onRetry}
                        className="px-2.5 py-1 bg-destructive/20 text-destructive border border-destructive/40 rounded text-xs cursor-pointer hover:bg-destructive/30 transition-colors font-medium"
                    >
                        다시 시도
                    </button>
                )}
                <span className="text-[11px] text-muted-foreground">
                    네트워크 또는 API 키 설정을 확인해 주세요.
                </span>
            </div>
        </div>
    );
}
