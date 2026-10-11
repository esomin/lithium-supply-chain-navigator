import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface PortalTooltipProps {
    /** 툴팁 내용 */
    content: ReactNode;
    /** 툴팁을 띄울 트리거 엘리먼트 */
    children: ReactNode;
    /** 툴팁 선호 위치: 'top' | 'bottom' (공간 부족 시 자동 반전) */
    side?: 'top' | 'bottom';
    /** 툴팁 너비 (기본 280px) */
    width?: number;
    /** 툴팁 추가 CSS 클래스 */
    className?: string;
    /** 트리거를 감싸는 래퍼 클래스 */
    triggerClassName?: string;
    /** 비활성화 여부 */
    disabled?: boolean;
}

/**
 * overflow: hidden / scroll 컨테이너 내부에서도 잘리지 않도록
 * document.body 최상단에 createPortal을 이용해 렌더링하는 공통 툴팁 컴포넌트.
 * 뷰포트 경계를 감지하여 화면 밖으로 벗어나지 않도록 자동 보정합니다.
 */
export function PortalTooltip({
    content,
    children,
    side = 'bottom',
    width = 280,
    className = '',
    triggerClassName = '',
    disabled = false,
}: PortalTooltipProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (triggerRef.current) {
            setAnchorRect(triggerRef.current.getBoundingClientRect());
        }
    };

    const handleMouseEnter = () => {
        if (disabled) return;
        updatePosition();
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        setIsOpen(false);
    };

    // 스크롤이나 리사이즈 발생 시 툴팁 닫기 또는 위치 재계산
    useEffect(() => {
        if (!isOpen) return;

        const handleScrollOrResize = () => {
            updatePosition();
        };

        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);

        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen]);

    const renderTooltip = () => {
        if (!isOpen || !anchorRect || disabled) return null;

        const padding = 12; // 화면 경계 여백
        let left = anchorRect.left + anchorRect.width / 2 - width / 2;

        // 좌우 화면 경계 보정
        if (left < padding) {
            left = padding;
        } else if (left + width > window.innerWidth - padding) {
            left = window.innerWidth - padding - width;
        }

        // 상하 공간 계산 및 선호 위치 반영
        const spaceAbove = anchorRect.top;
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const preferredTop = side === 'top';

        // 선호 위치가 top인데 위쪽 공간이 150px 미만이고 아래쪽 공간이 더 많으면 bottom으로 반전
        // 선호 위치가 bottom인데 아래쪽 공간이 150px 미만이고 위쪽 공간이 더 많으면 top으로 반전
        const showOnTop = preferredTop
            ? spaceAbove >= 120 || spaceAbove >= spaceBelow
            : spaceBelow < 120 && spaceAbove > spaceBelow;

        const top = showOnTop ? anchorRect.top - 6 : anchorRect.bottom + 6;

        return createPortal(
            <div
                role="tooltip"
                style={{
                    position: 'fixed',
                    top: `${top}px`,
                    left: `${left}px`,
                    transform: showOnTop ? 'translateY(-100%)' : 'none',
                    width: `${width}px`,
                    zIndex: 99999,
                }}
                className={`pointer-events-none p-2.5 bg-popover text-popover-foreground text-xs leading-relaxed rounded-md border border-border/80 shadow-2xl backdrop-blur-md animate-in fade-in-0 duration-150 ${className}`}
            >
                {content}
            </div>,
            document.body
        );
    };

    return (
        <div
            ref={triggerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`inline-flex items-center shrink-0 ${triggerClassName}`}
        >
            {children}
            {renderTooltip()}
        </div>
    );
}
