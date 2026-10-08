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
import { store } from './store.js';
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
 * 시드 데이터를 InMemoryStore에 로딩한다.
 * 14개 마스터 노드 및 엣지 데이터를 packages/pipeline/data에서 읽어와 초기화한다.
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
 * 시드 데이터를 InMemoryStore에 로딩한 후 Express 서버를 기동한다.
 * @param port 리스닝 포트 (기본값: 3001)
 */
export function startServer(port: number = DEFAULT_PORT): Promise<void> {
    // 서버 시작 시 시드 데이터 자동 로딩
    initializeSeedData();

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
