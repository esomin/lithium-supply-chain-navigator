import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
    count: number;
    resetTime: number;
}

/**
 * IP 기반 인메모리 Rate Limiter 미들웨어.
 * 외부 라이브러리 의존성 없이 가볍고 안전하게 15분당 최대 10회 요청 제한을 수행합니다.
 */
export function createRateLimiter(options: {
    windowMs: number;
    max: number;
    message: string;
}) {
    const records = new Map<string, RateLimitRecord>();

    // 1시간마다 만료된 오래된 레코드 정리
    setInterval(() => {
        const now = Date.now();
        for (const [ip, record] of records.entries()) {
            if (now > record.resetTime) {
                records.delete(ip);
            }
        }
    }, 60 * 60 * 1000).unref();

    return (req: Request, res: Response, next: NextFunction): void => {
        // x-forwarded-for 또는 remoteAddress로 클라이언트 IP 식별
        const forwarded = req.headers['x-forwarded-for'];
        const ip = typeof forwarded === 'string'
            ? forwarded.split(',')[0].trim()
            : req.socket.remoteAddress || 'unknown';

        const now = Date.now();
        let record = records.get(ip);

        if (options.max <= 0) {
            res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
            res.setHeader('X-RateLimit-Limit', 0);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.status(429).json({
                error: options.message,
                statusCode: 429,
                retryAfter: Math.ceil(options.windowMs / 1000),
            });
            return;
        }

        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + options.windowMs,
            };
            records.set(ip, record);
            res.setHeader('X-RateLimit-Limit', options.max);
            res.setHeader('X-RateLimit-Remaining', options.max - 1);
            res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
            return next();
        }

        if (record.count >= options.max) {
            const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
            res.setHeader('Retry-After', retryAfterSec);
            res.setHeader('X-RateLimit-Limit', options.max);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

            res.status(429).json({
                error: options.message,
                statusCode: 429,
                retryAfter: retryAfterSec,
            });
            return;
        }

        record.count += 1;
        res.setHeader('X-RateLimit-Limit', options.max);
        res.setHeader('X-RateLimit-Remaining', options.max - record.count);
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
        return next();
    };
}
