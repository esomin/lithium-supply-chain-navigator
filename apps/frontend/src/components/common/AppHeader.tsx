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
                    type="button"
                    className={`font-semibold text-xs h-8 px-3.5 py-1.5 rounded-[4px] shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-200 border ${showAIPanel
                        ? 'bg-white/20 text-white border-white/50 ring-1 ring-primary/40 shadow-primary/20'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/25 hover:border-white/45'
                        }`}
                    aria-label={showAIPanel ? "AI 인사이트 패널 닫기" : "AI 인사이트 패널 열기"}
                    aria-pressed={showAIPanel}
                >
                    <GiDiamonds className="w-3.5 h-3.5 text-primary shrink-0 drop-shadow-[0_0_4px_rgba(59,130,246,0.6)]" />
                    <span className="tracking-tight">AI 인사이트</span>
                </Button>

                <ViewSwitcher currentView={currentView} />
            </div>
        </header>
    );
}
