import { Cuboid } from 'lucide-react';
import { GiDiamonds } from 'react-icons/gi';
import { ViewSwitcher } from './ViewSwitcher';
import { useSupplyChainStore } from '../../store/supply-chain-store';
import { Button } from '../ui/button';

export interface AppHeaderProps {
    currentView: 'graph' | 'map';
}

/**
 * 공통 상단 헤더 컴포넌트.
 * 로고, 애플리케이션 타이틀, AI 인사이트 토글 버튼, 뷰 전환 네비게이션을 제공한다.
 */
export function AppHeader({
    currentView,
}: AppHeaderProps) {
    const { showAIPanel, toggleAIPanel } = useSupplyChainStore();

    return (
        <header className="px-6 border-b border-border bg-card flex items-center justify-between h-16 min-h-[64px] select-none">
            {/* 좌측 로고 및 타이틀 영역 */}
            <div className="flex items-center gap-3.5">
                <Cuboid size={34} strokeWidth={2.5} className="text-foreground shrink-0" />
                <h1 className="m-0 text-[24px] font-bold text-foreground tracking-tight">
                    Lithium Supply Chain Navigator
                </h1>
            </div>

            {/* 우측 네비게이션 & AI 인사이트 토글 버튼 영역 */}
            <div className="flex items-center gap-3 h-full">
                <Button
                    onClick={toggleAIPanel}
                    variant={showAIPanel ? "outline" : "default"}
                    className={`font-semibold shadow-xs flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer rounded-[4px] px-4 py-1.5 text-xs h-8 ${
                        showAIPanel
                            ? 'bg-slate-800/95 text-white border border-primary/50 shadow-sm'
                            : 'bg-slate-800/80 text-white hover:bg-slate-700/80 border border-slate-700/80 hover:border-slate-500'
                    }`}
                    aria-label={showAIPanel ? "AI 인사이트 패널 닫기" : "AI 인사이트 패널 열기"}
                    aria-pressed={showAIPanel}
                >
                    <GiDiamonds className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    AI 인사이트
                </Button>

                <ViewSwitcher currentView={currentView} />
            </div>
        </header>
    );
}
