import React, { useEffect, useRef, useState } from 'react';
import { Check, Code2, Copy } from 'lucide-react';
import type { TerminalCodeBlock } from '../logic/terminalEngine';

interface TerminalCodeBlockCardProps {
  block: TerminalCodeBlock;
  onLoadCodeInSandbox: (block: TerminalCodeBlock, autoRun?: boolean) => void;
}

export const TerminalCodeBlockCard: React.FC<TerminalCodeBlockCardProps> = ({
  block,
  onLoadCodeInSandbox,
}) => {
  const [copied, setCopied] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setScanComplete(false);
    const timer = window.setTimeout(() => {
      setScanComplete(true);
    }, 880);
    return () => window.clearTimeout(timer);
  }, [block.code, block.language, block.title]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard
      ?.writeText(block.code)
      .then(() => {
        setCopied(true);
        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, 1500);
      })
      .catch(() => {});
  };

  return (
    <div
      data-testid="terminal-code-block"
      className="rl-code-scan relative overflow-hidden border border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#EAE5DA] dark:bg-[#0D0E10]"
    >
      {/* Animated optical scanline sweep on load */}
      <div
        key={`${block.title}-${block.code.length}`}
        aria-hidden="true"
        className="rl-scan-overlay"
      >
        <div className="rl-scan-raster" />
        <div className="rl-scan-beam" />
      </div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA]/90 dark:bg-[#15171A]/90 text-[11px] font-mono">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#2A6396] dark:text-[#4E8EC7] truncate">
            {block.title} ({block.language.toUpperCase()})
          </span>
          <span
            className={`px-1.5 py-0.2 text-[9px] font-bold border tracking-wider uppercase ${
              scanComplete
                ? 'border-[#2B7A5B]/50 text-[#2B7A5B] dark:text-[#3FA67E] bg-[#2B7A5B]/10'
                : 'border-[#E05320]/60 text-[#E05320] dark:text-[#F0622D] bg-[#E05320]/10'
            }`}
          >
            {scanComplete ? 'SCAN // OK' : 'SCANNING...'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 border border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] hover:border-[#E05320] text-[10px] font-semibold cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-[#2B7A5B]" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>复制</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadCodeInSandbox(block, false);
            }}
            className="px-2 py-0.5 border border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#F3EFE6] dark:bg-[#15171A] hover:border-[#2A6396] text-[10px] font-semibold cursor-pointer"
          >
            载入沙盒
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadCodeInSandbox(block, true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 bg-[#2A6396] text-white text-[10px] font-semibold hover:bg-[#1f4d75] cursor-pointer"
          >
            <Code2 className="w-3 h-3" />
            <span>载入并立即运行</span>
          </button>
        </div>
      </div>

      <pre className="relative z-10 p-2.5 text-[11px] overflow-x-auto max-h-[190px] text-[#1A1B1D] dark:text-[#EAE6DC] leading-relaxed">
        {block.code}
      </pre>
    </div>
  );
};
