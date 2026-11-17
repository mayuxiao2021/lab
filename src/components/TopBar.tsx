import React from 'react';
import {
  Sun,
  Moon,
  Terminal,
  Droplets,
  Menu,
  Radio,
  Code2,
  Smartphone,
} from 'lucide-react';
import type { WorkspaceView } from '../logic/terminalEngine';
import type { ActivitySignals } from '../logic/systemTelemetry';
import { SystemTelemetry } from './SystemTelemetry';
import { RhineLogo } from './RhineLogo';

interface TopBarProps {
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenMobileSections: () => void;
  onOpenEnvModal: () => void;
  telemetrySignals: ActivitySignals;
}

const NAV_ITEMS: {
  id: WorkspaceView;
  shortLabel: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  activeClass: string;
  focusClass: string;
}[] = [
  {
    id: 'terminal',
    shortLabel: 'AI 终端',
    label: 'AI 智能终端',
    icon: Terminal,
    activeClass:
      'bg-[#1A1B1D] text-[#F3EFE6] border-[#1A1B1D] dark:bg-[#EAE6DC] dark:text-[#111315] dark:border-[#EAE6DC]',
    focusClass: 'focus-visible:outline-[#E05320]',
  },
  {
    id: 'comms',
    shortLabel: '主任通讯',
    label: '主任神经通讯',
    icon: Radio,
    activeClass:
      'bg-[#E05320] text-white border-[#E05320] dark:bg-[#F0622D] dark:text-white dark:border-[#F0622D]',
    focusClass: 'focus-visible:outline-[#E05320]',
  },
  {
    id: 'code',
    shortLabel: '代码沙盒',
    label: '代码演算沙盒',
    icon: Code2,
    activeClass:
      'bg-[#2A6396] text-white border-[#2A6396] dark:bg-[#4E8EC7] dark:text-[#0D0E10] dark:border-[#4E8EC7]',
    focusClass: 'focus-visible:outline-[#2A6396]',
  },
  {
    id: 'eco',
    shortLabel: '生态舱',
    label: '缪尔赛斯生态舱',
    icon: Droplets,
    activeClass:
      'bg-[#2B7A5B] text-white border-[#2B7A5B] dark:bg-[#3FA67E] dark:text-[#0D0E10] dark:border-[#3FA67E]',
    focusClass: 'focus-visible:outline-[#2B7A5B]',
  },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onChangeView,
  theme,
  onToggleTheme,
  onOpenMobileSections,
  onOpenEnvModal,
  telemetrySignals,
}) => {
  return (
    <header className="flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-5 h-13 sm:h-14 border-b border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#F3EFE6] dark:bg-[#15171A] shrink-0 min-w-0">
      {/* Brand mark & wordmark */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onOpenMobileSections}
          aria-label="打开科室目录"
          className="lg:hidden p-1.5 border border-[#C8C2B6] dark:border-[#2E3136] text-[#1A1B1D] dark:text-[#EAE6DC] hover:border-[#E05320] focus-visible:outline-2 focus-visible:outline-[#E05320]"
        >
          <Menu className="w-4 h-4" />
        </button>

        <RhineLogo
          className="w-10 h-5 sm:w-11 sm:h-6 shrink-0 text-[#1A1B1D] dark:text-[#EAE6DC]"
        />

        <div className="flex flex-col leading-none">
          <span className="font-bold text-xs sm:text-sm tracking-[0.14em] uppercase text-[#1A1B1D] dark:text-[#EAE6DC] whitespace-nowrap">
            Rhine Lab
          </span>
          <span className="hidden 2xl:block font-mono text-[9px] tracking-[0.16em] text-[#6A6862] dark:text-[#8E8B82] mt-0.5">
            R.L.OS v4.2 // WORKSTATION
          </span>
        </div>
      </div>

      {/* Primary 4-Mode Workspace Navigation (Desktop / Tablet; Mobile uses native bottom dock) */}
      <nav
        aria-label="工作区视图"
        className="hidden md:flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar min-w-0"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold tracking-wide border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 ${item.focusClass} ${
                isActive
                  ? item.activeClass
                  : 'bg-[#EAE5DA] text-[#55524C] border-[#C8C2B6] hover:text-[#1A1B1D] hover:border-[#1A1B1D] dark:bg-[#1D2024] dark:text-[#A19D94] dark:border-[#2E3136] dark:hover:text-[#EAE6DC]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="md:hidden">{item.shortLabel}</span>
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Utility Cluster: Live D3 System Telemetry + Env/APK + Theme Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <SystemTelemetry signals={telemetrySignals} theme={theme} />

        <button
          type="button"
          data-testid="open-env-btn"
          onClick={onOpenEnvModal}
          aria-label="环境诊断与安卓 APK 下载"
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-mono font-semibold border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] text-[#1A1B1D] dark:text-[#EAE6DC] hover:border-[#2B7A5B] hover:text-[#2B7A5B] dark:hover:text-[#3FA67E] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2B7A5B]"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0 text-[#2B7A5B] dark:text-[#3FA67E]" />
          <span className="hidden lg:inline">环境 / APK</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? '切换至深空轨道模式' : '切换至浅色实验室模式'}
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-mono font-semibold border border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#EAE5DA] dark:bg-[#1D2024] text-[#1A1B1D] dark:text-[#EAE6DC] hover:bg-[#E05320] hover:text-white hover:border-[#E05320] dark:hover:bg-[#F0622D] dark:hover:text-white dark:hover:border-[#F0622D] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E05320]"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">深空轨道</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">浅色实验室</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
