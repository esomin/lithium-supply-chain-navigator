import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ChatMessage, Citation, InsightResponse } from '@navigator/shared';
import { GiDiamonds } from 'react-icons/gi';
import { LuCopy, LuCheck } from 'react-icons/lu';
import { FiFileText, FiSend, FiChevronRight, FiExternalLink, FiX, FiSearch } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import React from 'react';

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
    const clientCacheRef = useRef<Map<string, { answer: string; citations: Citation[] }>>((() => {
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
    })());

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
        const clientCache = clientCacheRef.current;
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
        clientCacheRef.current.clear();
        try {
            localStorage.removeItem(STORAGE_KEY_MESSAGES);
            localStorage.removeItem(STORAGE_KEY_SESSION);
            localStorage.removeItem(STORAGE_KEY_CLIENT_CACHE);
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
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 -ml-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center"
                        aria-label="AI 인사이트 패널 접기"
                        title="패널 접기"
                    >
                        <FiChevronRight className="w-5 h-5" />
                    </button>
                    <span className="p-1 rounded-md bg-primary/10 border border-primary/20 text-primary shrink-0">
                        <GiDiamonds size={18} />
                    </span>
                    <div>
                        <h2 className="m-0 text-sm font-bold text-foreground flex items-center gap-2">
                            AI 공급망 인사이트
                            {messages.length > 0 && (
                                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
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
                </div>
            </div>

            {/* 메시지 리스트 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
                {/* 초기 안내 메시지 */}
                {messages.length === 0 && !isLoading && (
                    <div className="text-center text-muted-foreground text-xs mt-10 p-6 bg-muted/20 border border-dashed border-border rounded-xl">
                        <GiDiamonds className="w-8 h-8 mx-auto mb-2 text-primary opacity-80" />
                        <p className="font-semibold text-foreground mb-1">리튬 공급망에 대해 질문해 보세요</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
                            실제 공급망 지도와 글로벌 통상 규정을 결합해 조달 리스크와 규제 적격성을 실시간으로 분석해 드립니다.
                        </p>
                        <div className="flex flex-col gap-1.5 text-left max-w-sm mx-auto">
                            <button
                                type="button"
                                onClick={() => sendQuery('칠레산 리튬이 한국 공장까지 어떻게 들어오나요?')}
                                className="text-[11px] p-2 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground transition-all text-left cursor-pointer"
                            >
                                "칠레산 리튬이 한국 공장까지 어떻게 들어오나요?"
                            </button>
                            <button
                                type="button"
                                onClick={() => sendQuery('글로벌 리튬 소비량 중 배터리가 차지하는 비중과 주요 소비국은?')}
                                className="text-[11px] p-2 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground transition-all text-left cursor-pointer"
                            >
                                "글로벌 리튬 소비량 중 배터리가 차지하는 비중과 주요 소비국은?"
                            </button>
                            <button
                                type="button"
                                onClick={() => sendQuery('중국 지분이 섞인 원료를 쓰면 미국 보조금을 못 받나요?')}
                                className="text-[11px] p-2 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground transition-all text-left cursor-pointer"
                            >
                                "중국 지분이 섞인 원료를 쓰면 미국 보조금을 못 받나요?"
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

            {/* 입력 영역 */}
            <form
                onSubmit={handleSubmit}
                className="px-4 py-3 border-t border-border bg-card/95 backdrop-blur-xs"
            >
                <div className="relative flex flex-col bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 shadow-inner transition-all">
                    <textarea
                        ref={textareaRef}
                        rows={2}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="공급망 분석, 규제 적격성, 우회로 등을 질문하세요..."
                        disabled={isLoading}
                        className="w-full min-h-[44px] max-h-[160px] bg-transparent border-0 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed resize-none leading-relaxed custom-scrollbar pb-1 px-1"
                        aria-label="AI 인사이트 질문 입력"
                    />
                    <div className="flex items-center justify-end pt-1 border-t border-slate-800/60 mt-1">
                        <button
                            type="submit"
                            disabled={isLoading || !inputValue.trim()}
                            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer shrink-0 flex items-center justify-center"
                            aria-label="질문 전송"
                            title="전송"
                        >
                            <FiSend className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </form>
        </aside>
    );
}

// === 하위 컴포넌트 ===

/** 출처 메타데이터 맵핑 (파일명 -> 공식 명칭 및 태그) */
interface SourceMeta {
    title: string;
    organization: string;
    category: string;
    isGraph?: boolean;
}

function getSourceMeta(source: string): SourceMeta {
    const s = source.toLowerCase();
    if (s.includes('ira-feoc-guidance')) {
        return {
            title: '미국 IRA §30D 해외우려기관(FEOC) 최종 규정 요약',
            organization: 'IRS / 미국 재무부',
            category: '법령/규제',
        };
    }
    if (s.includes('irs-notice-2026-15')) {
        return {
            title: 'IRS Notice 2026-15 계약 지배력 및 실효 통제권 기준',
            organization: '미국 국세청 (IRS)',
            category: '가이드라인',
        };
    }
    if (s.includes('treasury-30d-value-add')) {
        return {
            title: '미국 재무부 핵심광물 50% 부가가치 산정 기준',
            organization: '미국 재무부 (US Treasury)',
            category: '법령/규제',
        };
    }
    if (s.includes('us-au-critical-minerals')) {
        return {
            title: '미-호 핵심광물 공급망 전략 협력 프레임워크',
            organization: '미국-호주 정부 협정',
            category: '국가협정',
        };
    }
    if (s.includes('iea-lithium-outlook')) {
        return {
            title: 'IEA 글로벌 리튬 시장 수급 전망 보고서 (2025)',
            organization: '국제에너지기구 (IEA)',
            category: '시장전망',
        };
    }
    if (s.includes('usgs-lithium')) {
        return {
            title: 'USGS 리튬 광물 상품 요약 통계 (2025)',
            organization: '미국 지질조사국 (USGS)',
            category: '통계보고서',
        };
    }
    if (s.includes('그래프') || s.includes('공급망')) {
        return {
            title: '실시간 리튬 공급망 토폴로지 네트워크',
            organization: '공급망 엔진',
            category: '그래프 데이터',
            isGraph: true,
        };
    }

    // 기본 대체
    const filename = source.split('/').pop() || source;
    return {
        title: filename,
        organization: '참조 문서',
        category: '문서',
    };
}

/** 메시지 버블 컴포넌트 */
function MessageBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user';
    const [copied, setCopied] = useState(false);
    const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

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

    // 인용구 클릭 시 해당 출처 모달 열기
    const handleBadgeClick = (matchedText: string) => {
        if (!message.citations || message.citations.length === 0) return;

        // [문서 2], [2] 등 숫자 추출
        const numMatch = matchedText.match(/\d+/);
        if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            const found = message.citations.find(c => c.docIndex === num);
            if (found) {
                setSelectedCitation(found);
                return;
            }
        }

        // 출처명 매칭
        const foundByName = message.citations.find(c => {
            const clean = matchedText.replace(/[\[\]]/g, '').replace(/^출처:\s*/, '').trim().toLowerCase();
            return c.source.toLowerCase().includes(clean) || clean.includes(c.source.toLowerCase());
        });
        if (foundByName) {
            setSelectedCitation(foundByName);
        }
    };

    // 텍스트 내 [문서 N], [N], [출처: ...] 패턴을 감지하여 시안 뱃지로 변환
    const renderNodeWithBadges = (node: React.ReactNode): React.ReactNode => {
        if (typeof node === 'string') {
            const parts = node.split(/(\[문서\s*\d+\]|\[\d+\]|\[출처:\s*[^\]]+\])/g);
            if (parts.length === 1) return node;

            return parts.map((part, i) => {
                if (/^\[(문서\s*\d+|\d+|출처:\s*[^\]]+)\]$/.test(part)) {
                    return (
                        <span
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleBadgeClick(part);
                            }}
                            className="inline-flex items-center px-1.5 py-0.2 mx-0.5 text-[11px] font-mono font-bold rounded bg-primary/15 text-primary select-none hover:bg-primary/25 hover:underline transition-all cursor-pointer"
                            title="클릭하여 참조 원문 보기"
                        >
                            {part}
                        </span>
                    );
                }
                return part;
            });
        }
        if (React.isValidElement(node)) {
            const element = node as React.ReactElement<{ children?: React.ReactNode }>;
            if (element.props && element.props.children) {
                return React.cloneElement(element, {
                    ...element.props,
                    children: renderNodeWithBadges(element.props.children),
                });
            }
            return node;
        }
        if (Array.isArray(node)) {
            return node.map((child, idx) => (
                <React.Fragment key={idx}>{renderNodeWithBadges(child)}</React.Fragment>
            ));
        }
        return node;
    };

    return (
        <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[92%] rounded-xl text-xs relative border shadow-md transition-all ${isUser
                    ? 'bg-primary text-primary-foreground border-primary/50 rounded-br-xs px-4 py-3'
                    : 'bg-slate-900/95 text-slate-100 border-slate-700/80 rounded-bl-xs pl-4 pr-10 py-3 backdrop-blur-md'
                    }`}
            >
                {/* 복사 버튼 (어시스턴트 메시지에만 표시) */}
                {!isUser && (
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="absolute top-2.5 right-2 p-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/80 opacity-70 group-hover:opacity-100 transition-all cursor-pointer shadow-sm flex items-center justify-center"
                        aria-label="답변 복사"
                        title={copied ? '복사 완료' : '답변 복사'}
                    >
                        {copied ? (
                            <LuCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                            <LuCopy className="w-3.5 h-3.5" />
                        )}
                    </button>
                )}

                {/* 메시지 내용 (선명한 명도 대비와 가독성) */}
                <div className="m-0 leading-relaxed break-words space-y-2 [&>p]:mb-1.5 [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:space-y-1 [&>h3]:text-[13px] [&>h3]:font-bold [&>h3]:text-primary [&>h3]:mt-2 [&>h4]:text-xs [&>h4]:font-bold [&>h4]:text-slate-200 [&>strong]:text-white [&>code]:bg-slate-800 [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-primary/90">
                    <ReactMarkdown
                        components={{
                            p: ({ children }) => <p className="mb-1.5 leading-relaxed">{renderNodeWithBadges(children)}</p>,
                            li: ({ children }) => <li>{renderNodeWithBadges(children)}</li>,
                            strong: ({ children }) => <strong className="font-bold text-white">{renderNodeWithBadges(children)}</strong>,
                            em: ({ children }) => <em className="italic text-slate-200">{renderNodeWithBadges(children)}</em>,
                            td: ({ children }) => <td>{renderNodeWithBadges(children)}</td>,
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>

                {/* 출처 인용 (어시스턴트 메시지에만 표시) */}
                {!isUser && message.citations && message.citations.length > 0 && (
                    <CitationList
                        citations={message.citations}
                        onSelectCitation={(cit) => setSelectedCitation(cit)}
                    />
                )}

                {/* 타임스탬프 */}
                <span
                    className={`block text-[9px] mt-2 font-mono ${isUser ? 'text-primary-foreground/70 text-right' : 'text-slate-400'
                        }`}
                >
                    {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>

            {/* 원문 전체보기 모달 */}
            {selectedCitation && (
                <DocumentViewerModal
                    citation={selectedCitation}
                    onClose={() => setSelectedCitation(null)}
                />
            )}
        </div>
    );
}

/** 출처 인용 리스트 컴포넌트 */
function CitationList({
    citations,
    onSelectCitation,
}: {
    citations: Citation[];
    onSelectCitation: (citation: Citation) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="mt-3 pt-2.5 border-t border-slate-800/80">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-transparent border-none cursor-pointer p-0 transition-colors select-none"
                aria-expanded={isExpanded}
                aria-label="참조 정책/보고서 원문 목록 토글"
            >
                <span className="text-[9px] text-slate-500">{isExpanded ? '▼' : '▶'}</span>
                <span>참조 정책/보고서 원문 ({citations.length}건)</span>
            </button>

            {isExpanded && (
                <ul className="mt-2.5 m-0 p-0 list-none space-y-2">
                    {citations.map((citation, idx) => {
                        const meta = getSourceMeta(citation.source);
                        return (
                            <li
                                key={idx}
                                className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800 text-[11px] hover:border-slate-700 transition-all shadow-xs group/card"
                            >
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex items-baseline gap-1.5 min-w-0">
                                        <span className="text-[11px] font-mono font-bold text-primary shrink-0 select-none">
                                            [{citation.docIndex ?? idx + 1}]
                                        </span>
                                        <span className="font-semibold text-slate-200 truncate text-[11px]" title={meta.title}>
                                            {meta.title}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono cursor-help"
                                            title="문서 분류: 규제 정책, 시장 전망 보고서 또는 통계 자료"
                                        >
                                            {meta.category}
                                        </span>
                                        <span
                                            className="text-[9px] font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded cursor-help"
                                            title={`질문 키워드 및 시맨틱 벡터 유사도 기반 관련성 점수 (${Math.round(citation.relevance * 100)}%)`}
                                        >
                                            {Math.round(citation.relevance * 100)}%
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1.5">
                                    <span className="text-slate-500">기관:</span>
                                    <span>{meta.organization}</span>
                                </div>

                                <p className="m-0 text-slate-300 text-[11px] leading-relaxed line-clamp-3 bg-slate-900/60 p-2 rounded border border-slate-800/50 font-sans">
                                    "{citation.content}"
                                </p>

                                {!meta.isGraph && (
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => onSelectCitation(citation)}
                                            className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/70 hover:border-slate-600 px-2.5 py-1 rounded transition-colors cursor-pointer"
                                            title="문서 전문 및 인용 단락 확인"
                                        >
                                            <FiExternalLink className="w-3 h-3 text-slate-400" />
                                            <span>원문 전문 보기</span>
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/** 문서 전문 확인 모달 (하이라이트 지원) */
function DocumentViewerModal({
    citation,
    onClose,
}: {
    citation: Citation;
    onClose: () => void;
}) {
    const meta = getSourceMeta(citation.source);
    const [fullContent, setFullContent] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setError(null);

        fetch(`/api/documents/content?source=${encodeURIComponent(citation.source)}`)
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(`문서를 불러오지 못했습니다 (${res.status})`);
                }
                const data = await res.json();
                if (isMounted) {
                    const raw = data.content || citation.content;
                    // YAML Frontmatter (--- ... ---) 완전 제거 로직
                    const cleanText = raw.replace(/^---[\s\S]*?---\s*/, '').trim();
                    setFullContent(cleanText);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    // API 실패 시 인용 청크 본문으로 대체 표시 (Frontmatter 제거)
                    const cleanFallback = citation.content.replace(/^---[\s\S]*?---\s*/, '').trim();
                    setFullContent(cleanFallback);
                    console.warn('원문 fetch 실패, 인용 본문 표시:', err);
                }
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [citation.source, citation.content]);

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-modal-title"
        >
            <div className="bg-slate-900 border border-slate-700/80 w-full max-w-3xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
                {/* 모달 헤더 */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/80">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 shrink-0">
                            <FiFileText size={16} />
                        </span>
                        <div className="min-w-0">
                            <h3 id="doc-modal-title" className="m-0 text-xs font-bold text-slate-100 truncate">
                                {meta.title}
                            </h3>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span>{meta.organization}</span>
                                <span>·</span>
                                <span
                                    className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[9px] cursor-help"
                                    title="문서 분류: 규제 정책, 시장 전망 보고서 또는 통계 자료"
                                >
                                    {meta.category}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        aria-label="닫기"
                    >
                        <FiX size={16} />
                    </button>
                </div>

                {/* 인용 요약 배너 */}
                <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-start gap-2 text-xs">
                    <span className="font-medium text-slate-400 shrink-0 text-[11px]">[참조 단락]</span>
                    <p className="m-0 text-slate-300 line-clamp-2 text-[11px] leading-relaxed">
                        "{citation.content}"
                    </p>
                </div>

                {/* 모달 본문 영역 (패널 텍스트 크기인 text-xs, line-height 통일) */}
                <div className="flex-1 p-5 overflow-y-auto custom-scrollbar text-xs leading-relaxed space-y-3 bg-slate-900/95">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-ping" />
                            <span>문서 원문을 불러오는 중...</span>
                        </div>
                    ) : error ? (
                        <div className="p-3 bg-destructive/10 border border-destructive/40 text-destructive rounded-lg text-xs">
                            {error}
                        </div>
                    ) : (
                        <div className="prose prose-invert prose-xs max-w-none text-xs text-slate-200 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:text-slate-100 [&>h1]:mb-2 [&>h2]:text-xs [&>h2]:font-bold [&>h2]:text-slate-200 [&>h2]:mt-3 [&>h2]:mb-1.5 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:text-slate-300 [&>p]:text-xs [&>p]:text-slate-300 [&>p]:leading-relaxed [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:text-slate-300 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:text-slate-300 [&>ol]:space-y-1 [&>li]:my-0.5 [&>strong]:text-slate-100 [&>strong]:font-semibold [&>hr]:border-slate-800">
                            <ReactMarkdown>{fullContent || ''}</ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* 모달 푸터 */}
                <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono text-[10px] text-slate-400">
                        참조 파일: {citation.source.split('/').pop() || citation.source}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer border border-slate-700/70"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

/** 타이핑 인디케이터 컴포넌트 */
function TypingIndicator() {
    return (
        <div className="flex justify-start">
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 rounded-bl-xs shadow-sm">
                <div className="flex items-center gap-1.5" aria-label="응답 생성 중">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">AI 분석 중</span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
            </div>
        </div>
    );
}

/** 에러 표시 + 재시도 컴포넌트 (이모지 제거) */
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
            <p className="m-0 font-medium mb-2">[오류] {error}</p>
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
