import React, { useEffect, useRef, useState } from 'react';
import { Play, Sparkles, Cpu, Loader2 } from 'lucide-react';
import { RHINE_DIRECTORS, type RhineSection } from '../data/rhineLore';
import {
  autocompleteCommand,
  type OutputTone,
  type TerminalCodeBlock,
  type TerminalEntry,
} from '../logic/terminalEngine';
import { TerminalCodeBlockCard } from './TerminalCodeBlockCard';

interface TerminalViewProps {
  entries: TerminalEntry[];
  activeSection: RhineSection;
  activeAiDirectorId: string;
  aiBusy: boolean;
  onChangeAiDirector: (directorId: string) => void;
  onExecute: (rawCommand: string) => void;
  onLoadCodeInSandbox: (block: TerminalCodeBlock, autoRun?: boolean) => void;
  onOpenEcoLab: () => void;
  onOpenCodeLab: () => void;
  onOpenDirectorComms: () => void;
}

const QUICK_COMMANDS: { label: string; cmd: string }[] = [
  { label: 'help', cmd: 'help' },
  { label: 'calc 算式', cmd: 'calc (128 * 4.5) / sqrt(81) + sin(pi/2)' },
  { label: 'note 便签', cmd: 'note list' },
  { label: 'code', cmd: 'code' },
  { label: 'comms', cmd: 'comms' },
  { label: 'sections', cmd: 'sections' },
  { label: 'eco status', cmd: 'eco status' },
  { label: 'ls -a', cmd: 'ls -a' },
  { label: 'decrypt CONTROL', cmd: 'decrypt CONTROL' },
  { label: 'scan', cmd: 'scan' },
  { label: 'clear', cmd: 'clear' },
];

const AI_QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: 'AI: 调优生态舱',
    prompt: '请帮我把 Bio-Dome 04 参数调优到最适合水分子拟态的高凝聚稳态，并解释原因。',
  },
  {
    label: 'AI: 生成 RK4 算例',
    prompt: '用 Python 写一段 RK4 龙格库塔法求解水分子流形微分方程并画图',
  },
  {
    label: '@缪尔赛思 自由闲聊',
    prompt: '@muelsyse 你好呀，今天在实验室忙什么呢？怎么评价克丽斯腾和塞雷娅？',
  },
];

const TONE_CLASSES: Record<OutputTone, string> = {
  normal: 'text-[#1A1B1D] dark:text-[#EAE6DC]',
  accent: 'text-[#E05320] dark:text-[#F0622D] font-semibold',
  eco: 'text-[#2B7A5B] dark:text-[#3FA67E] font-semibold',
  info: 'text-[#2A6396] dark:text-[#4E8EC7] font-semibold',
  warn: 'text-[#B47811] dark:text-[#EAB33A] font-semibold',
  error: 'text-[#C83232] dark:text-[#E54D4D] font-semibold',
  muted: 'text-[#6A6862] dark:text-[#8E8B82]',
};

export const TerminalView: React.FC<TerminalViewProps> = ({
  entries,
  activeSection,
  activeAiDirectorId,
  aiBusy,
  onChangeAiDirector,
  onExecute,
  onLoadCodeInSandbox,
  onOpenEcoLab,
  onOpenCodeLab,
  onOpenDirectorComms,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries, aiBusy]);

  const submitCommand = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setHistory((prev) => [trimmed, ...prev]);
    setHistoryIdx(-1);
    setInputValue('');
    onExecute(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCommand(inputValue);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIdx < history.length - 1) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInputValue(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputValue(history[nextIdx]);
      } else {
        setHistoryIdx(-1);
        setInputValue('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const completed = autocompleteCommand(inputValue);
      if (completed) {
        setInputValue(completed);
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#F8F5EE] dark:bg-[#111315]">
      {/* AI Persona Link + Quick Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#F3EFE6] dark:bg-[#15171A] border-b border-[#C8C2B6] dark:border-[#2E3136] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-[#E05320] shrink-0" />
          <label
            htmlFor="terminal-ai-director"
            className="text-[11px] font-mono font-semibold text-[#6A6862] dark:text-[#8E8B82] whitespace-nowrap"
          >
            终端智能核心:
          </label>
          <select
            id="terminal-ai-director"
            value={activeAiDirectorId}
            onChange={(e) => onChangeAiDirector(e.target.value)}
            className="px-2 py-1 text-xs font-mono font-semibold bg-[#EAE5DA] dark:bg-[#1D2024] border border-[#C8C2B6] dark:border-[#2E3136] text-[#1A1B1D] dark:text-[#EAE6DC] focus:outline-none focus:border-[#E05320] cursor-pointer"
          >
            {RHINE_DIRECTORS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.sectionCode})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {AI_QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={aiBusy}
              onClick={() => {
                submitCommand(item.prompt);
                inputRef.current?.focus();
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono font-semibold border border-[#E05320]/60 text-[#E05320] dark:text-[#F0622D] bg-[#F8F5EE] dark:bg-[#111315] hover:bg-[#E05320] hover:text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Command Strip */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-[#EAE5DA] dark:bg-[#1D2024] border-b border-[#C8C2B6] dark:border-[#2E3136] overflow-x-auto shrink-0">
        <span className="text-[11px] font-mono font-semibold text-[#6A6862] dark:text-[#8E8B82] whitespace-nowrap shrink-0 mr-1">
          快捷指令
        </span>

        <button
          type="button"
          onClick={onOpenDirectorComms}
          className="px-2 py-1 text-[11px] font-mono font-semibold border border-[#E05320] text-[#E05320] dark:border-[#F0622D] dark:text-[#F0622D] bg-[#F3EFE6] dark:bg-[#15171A] hover:bg-[#E05320] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          主任神经通讯
        </button>

        <button
          type="button"
          onClick={onOpenCodeLab}
          className="px-2 py-1 text-[11px] font-mono font-semibold border border-[#2A6396] text-[#2A6396] dark:border-[#4E8EC7] dark:text-[#4E8EC7] bg-[#F3EFE6] dark:bg-[#15171A] hover:bg-[#2A6396] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          代码沙盒
        </button>

        <button
          type="button"
          onClick={onOpenEcoLab}
          className="px-2 py-1 text-[11px] font-mono font-semibold border border-[#2B7A5B] text-[#2B7A5B] dark:border-[#3FA67E] dark:text-[#3FA67E] bg-[#F3EFE6] dark:bg-[#15171A] hover:bg-[#2B7A5B] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          生态模拟舱
        </button>

        {QUICK_COMMANDS.map((item) => (
          <button
            key={item.cmd}
            type="button"
            onClick={() => {
              submitCommand(item.cmd);
              inputRef.current?.focus();
            }}
            className="px-2 py-1 text-[11px] font-mono border border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] text-[#1A1B1D] dark:text-[#EAE6DC] hover:border-[#E05320] hover:text-[#E05320] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Terminal Output Stream */}
      <div
        ref={outputRef}
        data-testid="terminal-output"
        onClick={() => {
          const selection = window.getSelection();
          if (!selection || selection.toString().length === 0) {
            inputRef.current?.focus();
          }
        }}
        className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-relaxed cursor-text"
      >
        {entries.map((entry, idx) => {
          const entryDelayStyle =
            entry.id.startsWith('boot-') && idx < 10
              ? { animationDelay: `${idx * 24}ms` }
              : undefined;

          if (entry.kind === 'command') {
            return (
              <div
                key={entry.id}
                style={entryDelayStyle}
                className="rl-terminal-entry mt-3 mb-1.5 flex items-baseline gap-2 flex-wrap"
              >
                <span className="font-bold text-[#E05320] dark:text-[#F0622D]">
                  researcher@rhine-lab
                </span>
                <span className="text-[#2A6396] dark:text-[#4E8EC7] font-semibold">
                  {entry.promptPath}$
                </span>
                <span className="font-semibold text-[#1A1B1D] dark:text-[#EAE6DC]">
                  {entry.text}
                </span>
              </div>
            );
          }

          if (entry.kind === 'ai') {
            return (
              <div
                key={entry.id}
                style={entryDelayStyle}
                className="rl-terminal-entry my-3 p-3.5 bg-[#F3EFE6] dark:bg-[#15171A] border-l-4 border-l-[#E05320] border border-[#C8C2B6] dark:border-[#2E3136]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#C8C2B6]/60 dark:border-[#2E3136]">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#E05320] text-white">
                      {entry.speakerCode || 'R.L.OS AI'}
                    </span>
                    <span className="text-xs font-bold text-[#1A1B1D] dark:text-[#EAE6DC]">
                      {entry.speakerName || 'R.L.OS 中枢主脑'}
                    </span>
                  </div>
                </div>

                {entry.toolActions && entry.toolActions.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2.5">
                    {entry.toolActions.map((act, i) => (
                      <div
                        key={i}
                        className="px-2 py-1 text-[11px] bg-[#2B7A5B]/12 border border-[#2B7A5B]/40 text-[#2B7A5B] dark:text-[#3FA67E] font-semibold"
                      >
                        ✓ [TOOL EXECUTED] {act}
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-[13px] font-sans leading-relaxed text-[#1A1B1D] dark:text-[#EAE6DC] whitespace-pre-wrap break-words">
                  {entry.text}
                </div>

                {entry.codeBlocks && entry.codeBlocks.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {entry.codeBlocks.map((blk, i) => (
                      <TerminalCodeBlockCard
                        key={`${entry.id}-blk-${i}`}
                        block={blk}
                        onLoadCodeInSandbox={onLoadCodeInSandbox}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }

          if (entry.kind === 'dossier') {
            return (
              <div
                key={entry.id}
                style={entryDelayStyle}
                className="rl-terminal-entry my-2.5 p-3.5 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]"
              >
                {entry.title && (
                  <div
                    className={`font-bold text-xs tracking-wide mb-2 ${
                      TONE_CLASSES[entry.tone ?? 'accent']
                    }`}
                  >
                    {entry.title}
                  </div>
                )}
                <div className="space-y-1 text-[#1A1B1D] dark:text-[#EAE6DC] whitespace-pre-wrap break-words">
                  {entry.lines?.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              style={entryDelayStyle}
              className={`rl-terminal-entry mb-1 whitespace-pre-wrap break-words ${
                TONE_CLASSES[entry.tone ?? 'normal']
              }`}
            >
              {entry.text}
            </div>
          );
        })}

        {aiBusy && (
          <div className="my-3 flex items-center gap-2 text-xs font-mono text-[#E05320] dark:text-[#F0622D]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>[R.L.OS NEURAL CORE] 正在检索档案并演算响应...</span>
          </div>
        )}
      </div>

      {/* Command & AI Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCommand(inputValue);
        }}
        className="flex items-center gap-2.5 px-4 py-3 border-t border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] shrink-0"
      >
        <label
          htmlFor="rhine-cli-input"
          className="text-xs font-mono whitespace-nowrap shrink-0 select-none"
        >
          <span className="font-bold text-[#E05320] dark:text-[#F0622D]">rhine-lab</span>
          <span className="text-[#6A6862] dark:text-[#8E8B82]">:</span>
          <span className="font-semibold text-[#2A6396] dark:text-[#4E8EC7]">
            ~/{activeSection.short.toLowerCase()}
          </span>
          <span className="text-[#6A6862] dark:text-[#8E8B82]">$</span>
        </label>

        <input
          id="rhine-cli-input"
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
          placeholder="输入 CLI 指令 (help / code / eco) 或直接用自然语言 / @主任名 提问..."
          className="flex-1 min-w-0 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] px-3 py-2 font-mono text-xs sm:text-[13px] text-[#1A1B1D] dark:text-[#EAE6DC] placeholder:text-[#8E8B82] focus:outline-none focus:border-[#E05320] dark:focus:border-[#F0622D]"
        />

        <button
          type="submit"
          disabled={aiBusy}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#E05320] hover:bg-[#C94517] dark:bg-[#F0622D] dark:hover:bg-[#E05320] text-white font-mono text-xs font-semibold shrink-0 cursor-pointer transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#1A1B1D]"
        >
          {aiBusy ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          <span>执行</span>
        </button>
      </form>
    </div>
  );
};
