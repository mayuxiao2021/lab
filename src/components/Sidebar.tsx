import React, { useEffect, useRef, useState } from 'react';
import { X, Radio } from 'lucide-react';
import { RHINE_SECTIONS, type RhineSection } from '../data/rhineLore';
import type { WorkspaceView } from '../logic/terminalEngine';

interface SidebarProps {
  activeSection: RhineSection;
  activeView: WorkspaceView;
  theme: 'light' | 'dark';
  fluxBoost: number;
  onSelectSection: (section: RhineSection) => void;
  onTalkToDirector: (directorId: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  activeView,
  theme,
  fluxBoost,
  onSelectSection,
  onTalkToDirector,
  mobileOpen,
  onCloseMobile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef(activeView);
  const themeRef = useRef(theme);
  const boostRef = useRef(fluxBoost);
  const [fluxMsv, setFluxMsv] = useState('42.8');
  const [clockText, setClockText] = useState('1099-11-08 08:00:00');

  useEffect(() => {
    viewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    boostRef.current = fluxBoost;
  }, [fluxBoost]);

  useEffect(() => {
    const tickClock = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setClockText(
        `1099-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      );
    };
    tickClock();
    const timer = window.setInterval(tickClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let frameCount = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const isDark = themeRef.current === 'dark';
      const isEco = viewRef.current === 'eco';
      const isCode = viewRef.current === 'code';
      const amp = 10 + (boostRef.current > 0 ? 5 : 0);

      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26,27,29,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      ctx.strokeStyle = isEco
        ? isDark
          ? '#3FA67E'
          : '#2B7A5B'
        : isCode
          ? isDark
            ? '#4E8EC7'
            : '#2A6396'
          : isDark
            ? '#F0622D'
            : '#E05320';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y =
          h / 2 +
          Math.sin(x * 0.06 + phase) * amp +
          Math.sin(x * 0.14 - phase * 1.4) * 3.8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.065;
      frameCount += 1;
      if (frameCount % 25 === 0) {
        setFluxMsv((41.8 + Math.sin(phase) * 2.2).toFixed(1));
      }
      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const content = (
    <div className="flex flex-col h-full bg-[#F3EFE6] dark:bg-[#15171A] text-[#1A1B1D] dark:text-[#EAE6DC]">
      {/* Calibration Strip & Live Trimounts Time */}
      <div className="px-4 py-3 border-b border-[#C8C2B6] dark:border-[#2E3136] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" aria-label="四色校准条">
          <span className="w-3 h-2.5 bg-[#E05320]" />
          <span className="w-3 h-2.5 bg-[#DDA027]" />
          <span className="w-3 h-2.5 bg-[#2B7A5B]" />
          <span className="w-3 h-2.5 bg-[#2A6396]" />
        </div>
        <span className="text-[11px] font-mono tabular-nums text-[#55524C] dark:text-[#9A968C]">
          {clockText}
        </span>
      </div>

      {/* Active Section Summary */}
      <div className="p-4 border-b border-[#C8C2B6] dark:border-[#2E3136]">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#6A6862] dark:text-[#8E8B82] mb-2">
          <span>当前接入科室</span>
          <span>权限 LV.5</span>
        </div>
        <div className="p-3 bg-[#EAE5DA] dark:bg-[#1D2024] border border-[#C8C2B6] dark:border-[#2E3136]">
          <div className="text-[11px] font-mono font-semibold text-[#E05320] dark:text-[#F0622D]">
            {activeSection.code} · {activeSection.id}
          </div>
          <div className="text-sm font-bold mt-0.5">{activeSection.name}</div>
          <div className="text-xs text-[#6A6862] dark:text-[#8E8B82] mt-1 truncate">
            {activeSection.director}
          </div>
          <button
            type="button"
            onClick={() => {
              onTalkToDirector(activeSection.directorId);
              onCloseMobile();
            }}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono font-semibold border border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#F3EFE6] dark:bg-[#15171A] hover:bg-[#E05320] hover:text-white hover:border-[#E05320] transition-colors cursor-pointer"
          >
            <Radio className="w-3 h-3" />
            <span>直连科室主任对话</span>
          </button>
        </div>
      </div>

      {/* Originium Flux Oscilloscope */}
      <div className="p-4 border-b border-[#C8C2B6] dark:border-[#2E3136]">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#6A6862] dark:text-[#8E8B82] mb-2">
          <span>源石通量监测 Arc-01</span>
          <span className="tabular-nums font-semibold text-[#1A1B1D] dark:text-[#EAE6DC]">
            {fluxMsv} mSv
          </span>
        </div>
        <div className="p-1.5 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
          <canvas ref={canvasRef} width={224} height={54} className="w-full h-[54px] block" />
          <div className="flex items-center justify-between text-[10px] font-mono text-[#6A6862] dark:text-[#8E8B82] mt-1 px-0.5">
            <span>ALT 6,000m</span>
            <span>● 链路正常</span>
          </div>
        </div>
      </div>

      {/* Ten Sections Directory */}
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#6A6862] dark:text-[#8E8B82] mb-2">
          <span>十大业务科室</span>
          <span>10</span>
        </div>
        <div className="flex flex-col gap-1" role="list">
          {RHINE_SECTIONS.map((sec) => {
            const isActive = sec.code === activeSection.code;
            return (
              <button
                key={sec.code}
                type="button"
                onClick={() => {
                  onSelectSection(sec);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-mono border text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E05320] ${
                  isActive
                    ? 'bg-[#E05320]/10 border-[#E05320] text-[#E05320] dark:bg-[#F0622D]/15 dark:border-[#F0622D] dark:text-[#F0622D] font-semibold'
                    : 'bg-transparent border-transparent hover:bg-[#EAE5DA] hover:border-[#C8C2B6] dark:hover:bg-[#1D2024] dark:hover:border-[#2E3136]'
                }`}
              >
                <span className="truncate">{sec.name}</span>
                <span className="text-[10px] opacity-75 shrink-0 ml-2">{sec.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Engineering Warning Stripe */}
      <div
        className="h-2 shrink-0 opacity-75"
        aria-hidden="true"
        style={{
          background:
            'repeating-linear-gradient(-45deg, #E05320, #E05320 6px, transparent 6px, transparent 12px)',
        }}
      />
    </div>
  );

  return (
    <>
      {/* Desktop fixed column */}
      <aside
        aria-label="莱茵生命科室目录与遥测"
        className="hidden lg:block w-[264px] shrink-0 border-r border-[#C8C2B6] dark:border-[#2E3136] h-full overflow-hidden"
      >
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="科室目录抽屉"
            className="relative z-10 w-[280px] max-w-[85vw] h-full border-r border-[#1A1B1D] dark:border-[#EAE6DC] flex flex-col bg-[#F3EFE6] dark:bg-[#15171A]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#C8C2B6] dark:border-[#2E3136]">
              <span className="text-xs font-bold tracking-wider uppercase">科室目录</span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="关闭科室目录"
                className="p-1.5 border border-[#C8C2B6] dark:border-[#2E3136] text-[#1A1B1D] dark:text-[#EAE6DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">{content}</div>
          </aside>
        </div>
      )}
    </>
  );
};
