// Express 서버 엔트리포인트
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 환경변수 로딩 (시스템 환경변수 우선, 모노레포 루트 .env 폴백)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import type { Request, Response, NextFunction } from 'express';
import { router } from './routes/index.js';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { indexDocument } from '@navigator/pipeline';
import type { RawDocument, DocumentType } from '@navigator/shared';
import { store, vectorStore, embeddingProvider } from './store.js';
import { loadSeedData } from '@navigator/database';

const app = express();

// === 미들웨어 설정 ===

// CORS 미들웨어
app.use(cors());

// JSON 바디 파서
app.use(express.json());

// === API 라우트 ===
app.use('/api', router);

// === 에러 핸들링 미들웨어 ===

/** 애플리케이션 에러 타입 */
interface AppError extends Error {
    statusCode?: number;
    type?: 'validation' | 'not_found' | 'internal';
}

/** 404 핸들러 — 정의되지 않은 라우트 처리 */
app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.', statusCode: 404 });
});

/** 전역 에러 핸들러 */
app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode ?? (err.type === 'validation' ? 400 : 500);

    // 프로덕션에서는 내부 에러 메시지 노출 방지
    const message =
        statusCode === 500
            ? '서버 내부 오류가 발생했습니다.'
            : err.message || '알 수 없는 오류가 발생했습니다.';

    res.status(statusCode).json({ error: message, statusCode });
});

/** 서버 기본 포트 */
const DEFAULT_PORT = 3001;

/**
 * 규제 요약, 시장 전망, 통계 등 텍스트 문서를 읽어 VectorStore에 RAG 인덱싱한다.
 */
async function indexSeedDocuments(): Promise<void> {
    const seedTextDir = resolve(__dirname, '../../../packages/database/src/seed/text');
    if (!existsSync(seedTextDir)) {
        console.warn(`[backend] 시드 텍스트 디렉터리를 찾을 수 없습니다: ${seedTextDir}`);
        return;
    }

    console.info('[backend] RAG 문서 인덱싱을 시작합니다...');
    const categories: Array<{ dir: string; docType: DocumentType }> = [
        { dir: 'regulatory', docType: 'regulation' },
        { dir: 'market', docType: 'technical_report' },
        { dir: 'statistics', docType: 'technical_report' },
    ];

    let totalIndexed = 0;

    for (const { dir, docType } of categories) {
        const catDir = resolve(seedTextDir, dir);
        if (!existsSync(catDir)) continue;

        const files = readdirSync(catDir);
        for (const file of files) {
            if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;

            const filePath = resolve(catDir, file);
            try {
                const content = readFileSync(filePath, 'utf-8');
                const title = file.replace(/\.(md|txt)$/, '').replace(/[-_]/g, ' ');

                const rawDoc: RawDocument = {
                    title,
                    content,
                    source: `seed/text/${dir}/${file}`,
                    date: new Date('2025-01-01'),
                    documentType: docType,
                };

                const result = await indexDocument(rawDoc, vectorStore, embeddingProvider, {
                    maxChunkSize: 800,
                    overlap: 150,
                });

                if (result.success) {
                    totalIndexed += result.chunksIndexed;
                } else {
                    console.warn(`[backend] 문서 인덱싱 경고 (${file}):`, result.errors);
                }
            } catch (err) {
                console.error(`[backend] 문서 읽기/인덱싱 실패 (${file}):`, err);
            }
        }
    }

    console.info(`[backend] RAG 문서 인덱싱 완료: 총 ${totalIndexed}개 청크 적재 (VectorStore 청크 수: ${vectorStore.getChunkCount()})`);
}

/**
 * 시드 데이터를 InMemoryStore에 로딩한다.
 * 14개 마스터 노드 및 엣지 데이터를 읽어와 초기화한다.
 */
function initializeSeedData(): void {
    console.info('[backend] 시드 데이터 로딩을 시작합니다...');

    const seedResult = loadSeedData();

    // InMemoryStore에 시드 데이터 적재
    store.loadSeedData(seedResult);

    console.info(
        `[backend] 시드 데이터 초기화 완료: 노드 ${seedResult.nodes.length}개, 엣지 ${seedResult.edges.length}개`,
    );

    if (seedResult.errors.length > 0) {
        console.warn(
            `[backend] 시드 데이터 로딩 중 ${seedResult.errors.length}개의 오류가 발생했습니다:`,
            seedResult.errors,
        );
    }
}

/**
 * 서버를 시작한다.
 * 시드 데이터를 InMemoryStore에 로딩하고 RAG 문서를 벡터 저장소에 인덱싱한 후 Express 서버를 기동한다.
 * @param port 리스닝 포트 (기본값: 3001)
 */
export async function startServer(port: number = DEFAULT_PORT): Promise<void> {
    // 서버 시작 시 그래프 시드 데이터 및 RAG 문서 자동 로딩/인덱싱
    initializeSeedData();
    await indexSeedDocuments();

    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`[backend] 서버가 포트 ${port}에서 실행 중입니다.`);
            resolve();
        });
    });
}

export { app };

// 직접 실행 시 서버 기동
startServer();
