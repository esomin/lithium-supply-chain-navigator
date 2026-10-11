import { Langfuse } from 'langfuse';

/**
 * Langfuse 싱글톤 클라이언트 래퍼.
 * 환경 변수(LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY)가 없거나 통신 실패 시
 * 서비스 장애 없이 안전하게 Graceful Degradation(No-op)으로 동작한다.
 */
let langfuseInstance: Langfuse | null = null;
let isInitialized = false;

export function getLangfuseClient(): Langfuse | null {
    if (isInitialized) {
        return langfuseInstance;
    }

    isInitialized = true;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com';

    if (!publicKey || !secretKey) {
        console.info('[Langfuse] API 키 미설정: LLM 추적(Tracing)이 비활성화된 상태로 안전하게 실행됩니다.');
        langfuseInstance = null;
        return null;
    }

    try {
        langfuseInstance = new Langfuse({
            publicKey,
            secretKey,
            baseUrl,
        });
        console.info(`[Langfuse] 클라이언트 초기화 완료 | baseUrl=${baseUrl}`);
    } catch (error) {
        console.warn('[Langfuse] 초기화 실패 (비활성화 상태로 유지):', error);
        langfuseInstance = null;
    }

    return langfuseInstance;
}

/**
 * 프로세스 종료 시 Langfuse 버퍼에 남은 이벤트를 비동기로 플러시한다.
 */
export async function flushLangfuse(): Promise<void> {
    if (langfuseInstance) {
        try {
            await langfuseInstance.flushAsync();
        } catch (error) {
            console.warn('[Langfuse] Flush 중 오류 발생:', error);
        }
    }
}
