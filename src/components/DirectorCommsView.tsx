import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Users,
  User,
  Trash2,
  Code2,
  Droplets,
  Loader2,
  Sparkles,
  BookOpen,
  Download,
  Plus,
  X,
} from 'lucide-react';
import { RHINE_DIRECTORS, type DirectorProfile } from '../data/rhineLore';
import type { EcoParams } from '../logic/ecoSimulation';
import { nextTerminalId, type TerminalCodeBlock } from '../logic/terminalEngine';
import {
  BackendUnreachableError,
  fetchWithTimeout,
  generateOfflineDirectorReply,
  isBackendUnreachableError,
} from '../logic/localOfflineCore';
import {
  formatThreadAsMarkdown,
  loadResearcherProfile,
  saveResearcherProfile,
  type LocalResearcherProfile,
} from '../logic/localChatEngine';
import {
  loadPreferredModel,
  resolveApiUrl,
  resolveGeminiModelByTaskTier,
  savePreferredModel,
  saveServerlessMode,
  shouldUseLocalServerlessOnly,
  type GeminiTaskTier,
} from '../logic/workspaceStorage';

export interface DirectorMessage {
  id: string;
  role: 'user' | 'assistant';
  speakerId?: string;
  speakerName?: string;
  speakerCode?: string;
  content: string;
  timestamp: string;
  error?: boolean;
}

interface DirectorCommsViewProps {
  selectedDirectorId: string;
  onSelectDirector: (directorId: string) => void;
  ecoParams: EcoParams;
  activeCodeFile: {
    filename: string;
    language: 'python' | 'typescript' | 'javascript';
    code: string;
  };
  draftMessage?: string | null;
  onConsumeDraftMessage: () => void;
  onLoadCodeInSandbox: (block: TerminalCodeBlock, autoRun?: boolean) => void;
  onStreamingChange?: (streaming: boolean) => void;
}

const STORAGE_KEY = 'rhine_director_comms_v1';

function extractCodeBlocksFromMarkdown(text: string): TerminalCodeBlock[] {
  const blocks: TerminalCodeBlock[] = [];
  const regex = /```(python|py|typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    idx += 1;
    const rawLang = (match[1] || 'python').toLowerCase();
    const language: 'python' | 'typescript' | 'javascript' =
      rawLang === 'ts' || rawLang === 'typescript'
        ? 'typescript'
        : rawLang === 'js' || rawLang === 'javascript'
          ? 'javascript'
          : 'python';
    const ext =
      language === 'python' ? 'py' : language === 'typescript' ? 'ts' : 'js';
    blocks.push({
      language,
      title: `director_code_${idx}.${ext}`,
      code: match[2].trim(),
    });
  }
  return blocks;
}

function nowClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export const DirectorCommsView: React.FC<DirectorCommsViewProps> = ({
  selectedDirectorId,
  onSelectDirector,
  ecoParams,
  activeCodeFile,
  draftMessage,
  onConsumeDraftMessage,
  onLoadCodeInSandbox,
  onStreamingChange,
}) => {
  const [mode, setMode] = useState<'single' | 'council'>('single');
  const [councilMembers, setCouncilMembers] = useState<string[]>([
    'kristen',
    'saria',
    'muelsyse',
  ]);
  const [attachEco, setAttachEco] = useState(true);
  const [attachCode, setAttachCode] = useState(false);
  const [thinkingDepth, setThinkingDepth] = useState<GeminiTaskTier | 'local'>(
    () => (shouldUseLocalServerlessOnly() ? 'local' : 'standard')
  );
  const [customPersonas, setCustomPersonas] = useState<Record<string, string>>(
    () => {
      try {
        const raw = localStorage.getItem('rhine_custom_personas_v1');
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      } catch {
        return {};
      }
    }
  );

  const [threads, setThreads] = useState<Record<string, DirectorMessage[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore storage errors
    }
    return {};
  });

  const [inputValue, setInputValue] = useState('');
  const [streamingSpeaker, setStreamingSpeaker] = useState<string | null>(null);
  const [topicCategory, setTopicCategory] = useState<
    'default' | 'casual' | 'empathy' | 'gossip' | 'math' | 'algo'
  >('default');
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<LocalResearcherProfile>(() =>
    loadResearcherProfile()
  );
  const [newNoteInput, setNewNoteInput] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onStreamingChange?.(Boolean(streamingSpeaker));
  }, [streamingSpeaker, onStreamingChange]);

  const activeDirector: DirectorProfile =
    RHINE_DIRECTORS.find((d) => d.id === selectedDirectorId) ?? RHINE_DIRECTORS[1];

  const threadKey = mode === 'council' ? '__council__' : activeDirector.id;

  const currentMessages: DirectorMessage[] = threads[threadKey] ?? [
    {
      id: `greet-${threadKey}`,
      role: 'assistant',
      speakerId: mode === 'council' ? 'rlos' : activeDirector.id,
      speakerName:
        mode === 'council' ? 'R.L.OS 联席会议频道' : activeDirector.name,
      speakerCode:
        mode === 'council' ? 'COUNCIL' : activeDirector.sectionCode,
      content:
        mode === 'council'
          ? '已开启多主任联席会议频道。请在上方勾选参与议事的科室主任（建议 2~4 位），提出议题或代码方案，各位主任将依次独立发表专业意见。'
          : activeDirector.greeting,
      timestamp: nowClock(),
    },
  ];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch {
      // Ignore storage quota errors
    }
  }, [threads]);

  useEffect(() => {
    if (draftMessage) {
      setInputValue(draftMessage);
      setAttachCode(true);
      onConsumeDraftMessage();
    }
  }, [draftMessage, onConsumeDraftMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentMessages, streamingSpeaker]);

  const toggleCouncilMember = (id: string) => {
    setCouncilMembers((prev) => {
      if (prev.includes(id)) {
        return prev.length > 2 ? prev.filter((m) => m !== id) : prev;
      }
      return prev.length >= 4 ? [...prev.slice(1), id] : [...prev, id];
    });
  };

  const streamSingleDirectorTurn = async (
    targetThreadKey: string,
    targetDirector: DirectorProfile,
    historyForRequest: DirectorMessage[],
    councilContext?: string
  ): Promise<{ text: string; isError: boolean }> => {
    const assistantMsgId = nextTerminalId(`msg-${targetDirector.id}`);
    setStreamingSpeaker(targetDirector.name);

    setThreads((prev) => {
      const existing = prev[targetThreadKey] ?? currentMessages;
      return {
        ...prev,
        [targetThreadKey]: [
          ...existing,
          {
            id: assistantMsgId,
            role: 'assistant',
            speakerId: targetDirector.id,
            speakerName: targetDirector.name,
            speakerCode: targetDirector.sectionCode,
            content: '',
            timestamp: nowClock(),
          },
        ],
      };
    });

    let accumulated = '';
    let isError = false;
    try {
      const sanitizedHistory = historyForRequest
        .filter((m) => !m.error && !m.id.startsWith('greet-') && m.content.trim())
        .map((m) => ({
          role: m.role,
          speaker: m.speakerName,
          content: m.content,
        }));

      if (thinkingDepth === 'local' || shouldUseLocalServerlessOnly()) {
        const lastUserText =
          [...historyForRequest].reverse().find((m) => m.role === 'user')?.content ?? '';
        const localReply = generateOfflineDirectorReply({
          directorId: targetDirector.id,
          userMessage: lastUserText,
          history: sanitizedHistory,
          ecoParams,
          activeCode: attachCode ? activeCodeFile : undefined,
          councilContext,
          includeEcoTelemetry: attachEco,
        });
        setThreads((prev) => ({
          ...prev,
          [targetThreadKey]: (prev[targetThreadKey] ?? []).map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  speakerName: `${targetDirector.name} · SERVERLESS`,
                  content: localReply,
                  error: false,
                }
              : m
          ),
        }));
        return { text: localReply, isError: false };
      }

      const activeTier: GeminiTaskTier = thinkingDepth;
      const targetModel = resolveGeminiModelByTaskTier(
        activeTier,
        loadPreferredModel()
      );
      const customSystemInstruction =
        customPersonas[targetDirector.id]?.trim() || targetDirector.systemPersona;

      const apiUrl = resolveApiUrl('/api/ai/chat');
      const resp = await fetchWithTimeout(
        apiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directorId: targetDirector.id,
            messages: sanitizedHistory,
            ecoParams: attachEco ? ecoParams : undefined,
            activeCode: attachCode ? activeCodeFile : undefined,
            councilContext,
            customSystemInstruction,
            thinkingDepth: activeTier,
            model: targetModel,
          }),
        },
        10000
      );

      if (!resp.ok || !resp.body) {
        if (resp.status === 404 || resp.status >= 502) {
          throw new BackendUnreachableError(`HTTP ${resp.status}`, {
            status: resp.status,
            targetUrl: apiUrl,
          });
        }
        throw new Error(`HTTP ${resp.status} 通讯链路异常`);
      }

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new BackendUnreachableError('远端节点返回 HTML 鉴权或 404 页面', {
          status: resp.status,
          targetUrl: apiUrl,
        });
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          const payload = JSON.parse(jsonStr) as {
            chunk?: string;
            error?: string;
            done?: boolean;
          };
          if (payload.error) {
            throw new Error(payload.error);
          }
          if (payload.chunk) {
            accumulated += payload.chunk;
            setThreads((prev) => ({
              ...prev,
              [targetThreadKey]: (prev[targetThreadKey] ?? []).map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulated } : m
              ),
            }));
          }
        }
      }
    } catch (err) {
      if (isBackendUnreachableError(err)) {
        const lastUserText =
          [...historyForRequest].reverse().find((m) => m.role === 'user')?.content ?? '';
        const fallbackHistory = historyForRequest
          .filter((m) => !m.error && !m.id.startsWith('greet-') && m.content.trim())
          .map((m) => ({
            role: m.role,
            speaker: m.speakerName,
            content: m.content,
          }));
        accumulated = generateOfflineDirectorReply({
          directorId: targetDirector.id,
          userMessage: lastUserText,
          history: fallbackHistory,
          ecoParams,
          activeCode: attachCode ? activeCodeFile : undefined,
          councilContext,
          includeEcoTelemetry: attachEco,
        });
        setThreads((prev) => ({
          ...prev,
          [targetThreadKey]: (prev[targetThreadKey] ?? []).map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  speakerName: `${targetDirector.name} · LOCAL`,
                  content: accumulated,
                  error: false,
                }
              : m
          ),
        }));
      } else {
        isError = true;
        const errMsg = err instanceof Error ? err.message : String(err);
        accumulated = `[LINK ERROR] ${errMsg}`;
        setThreads((prev) => ({
          ...prev,
          [targetThreadKey]: (prev[targetThreadKey] ?? []).map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: accumulated, error: true }
              : m
          ),
        }));
      }
    } finally {
      setStreamingSpeaker(null);
    }

    return { text: accumulated, isError };
  };

  const handleSend = async (rawPrompt?: string) => {
    const text = (rawPrompt ?? inputValue).trim();
    if (!text || streamingSpeaker) return;
    setInputValue('');

    const activeThreadKey = threadKey;
    const userMsg: DirectorMessage = {
      id: nextTerminalId('user'),
      role: 'user',
      speakerName: '研究员 (Researcher)',
      content: text,
      timestamp: nowClock(),
    };

    const nextHistory = [...currentMessages, userMsg];
    setThreads((prev) => ({
      ...prev,
      [activeThreadKey]: nextHistory,
    }));

    if (mode === 'single') {
      await streamSingleDirectorTurn(activeThreadKey, activeDirector, nextHistory);
    } else {
      const participants = councilMembers
        .map((id) => RHINE_DIRECTORS.find((d) => d.id === id))
        .filter((d): d is DirectorProfile => Boolean(d));

      let runningHistory = [...nextHistory];
      for (const participant of participants) {
        const councilCtx = `当前联席会议与会人员: ${participants
          .map((p) => `${p.name}(${p.sectionName})`)
          .join('、')}。请以你自身立场回应研究员，并可简短回应前几位主任的观点（保持 150~260 字精炼发言）。`;
        const reply = await streamSingleDirectorTurn(
          activeThreadKey,
          participant,
          runningHistory,
          councilCtx
        );
        if (!reply.isError) {
          runningHistory = [
            ...runningHistory,
            {
              id: nextTerminalId(`council-${participant.id}`),
              role: 'assistant',
              speakerId: participant.id,
              speakerName: participant.name,
              speakerCode: participant.sectionCode,
              content: reply.text,
              timestamp: nowClock(),
            },
          ];
        }
      }
    }
  };

  const clearCurrentThread = () => {
    setThreads((prev) => {
      const copy = { ...prev };
      delete copy[threadKey];
      return copy;
    });
  };

  return (
    <div className="flex flex-1 min-h-0 bg-[#F8F5EE] dark:bg-[#111315] text-[#1A1B1D] dark:text-[#EAE6DC]">
      {/* Left Roster of All 10 Rhine Lab Directors */}
      <div className="hidden md:flex flex-col w-[240px] shrink-0 border-r border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] overflow-y-auto">
        <div className="px-3.5 py-2.5 border-b border-[#C8C2B6] dark:border-[#2E3136] flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#6A6862] dark:text-[#8E8B82]">
            神经通讯对象 ({RHINE_DIRECTORS.length})
          </span>
        </div>

        <div className="p-2 space-y-1">
          {RHINE_DIRECTORS.map((dir) => {
            const isSelected =
              mode === 'single'
                ? activeDirector.id === dir.id
                : councilMembers.includes(dir.id);
            return (
              <button
                key={dir.id}
                type="button"
                onClick={() => {
                  if (mode === 'single') {
                    onSelectDirector(dir.id);
                  } else {
                    toggleCouncilMember(dir.id);
                  }
                }}
                className={`w-full text-left p-2.5 border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#EAE5DA] dark:bg-[#1D2024] border-[#E05320] dark:border-[#F0622D]'
                    : 'bg-transparent border-transparent hover:bg-[#EAE5DA]/60 dark:hover:bg-[#1D2024]/60'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold text-[#E05320] dark:text-[#F0622D]">
                    {dir.sectionCode}
                  </span>
                  {mode === 'council' && isSelected && (
                    <span className="px-1 text-[9px] font-mono bg-[#E05320] text-white">
                      IN SEAT
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold mt-0.5 truncate">{dir.name}</div>
                <div className="text-[10px] text-[#6A6862] dark:text-[#8E8B82] truncate">
                  {dir.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Conversation Workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Channel Header */}
        <div className="px-4 py-2.5 bg-[#EAE5DA] dark:bg-[#1D2024] border-b border-[#C8C2B6] dark:border-[#2E3136] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile Director Selector */}
            {mode === 'single' && (
              <select
                aria-label="选择通讯主任"
                value={activeDirector.id}
                onChange={(e) => onSelectDirector(e.target.value)}
                className="md:hidden px-2 py-1 text-xs font-mono font-bold bg-[#F3EFE6] dark:bg-[#15171A] border border-[#1A1B1D] dark:border-[#EAE6DC]"
              >
                {RHINE_DIRECTORS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.sectionCode})
                  </option>
                ))}
              </select>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#E05320] dark:text-[#F0622D]">
                  {mode === 'council' ? 'JOINT COUNCIL' : activeDirector.sectionCode}
                </span>
                <h2 className="text-sm font-bold truncate">
                  {mode === 'council'
                    ? `多主任联席会议 (${councilMembers.length} 位出席)`
                    : `${activeDirector.name} · ${activeDirector.sectionName}`}
                </h2>
              </div>
              <p className="text-[11px] font-mono text-[#6A6862] dark:text-[#8E8B82] truncate">
                {mode === 'council'
                  ? councilMembers
                      .map((id) => RHINE_DIRECTORS.find((d) => d.id === id)?.name)
                      .filter(Boolean)
                      .join(' · ')
                  : `${activeDirector.status} · 专长: ${activeDirector.specialty}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold border cursor-pointer ${
                mode === 'single'
                  ? 'bg-[#1A1B1D] text-[#F3EFE6] border-[#1A1B1D] dark:bg-[#EAE6DC] dark:text-[#111315]'
                  : 'bg-[#F3EFE6] dark:bg-[#15171A] border-[#C8C2B6] dark:border-[#2E3136]'
              }`}
            >
              <User className="w-3 h-3" />
              <span>单线通讯</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('council')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold border cursor-pointer ${
                mode === 'council'
                  ? 'bg-[#E05320] text-white border-[#E05320]'
                  : 'bg-[#F3EFE6] dark:bg-[#15171A] border-[#C8C2B6] dark:border-[#2E3136]'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>联席会议</span>
            </button>

            <select
              aria-label="推理深度与 Gemini 模型档位"
              data-testid="gemini-tier-select"
              value={thinkingDepth}
              onChange={(e) => {
                const val = e.target.value as GeminiTaskTier | 'local';
                setThinkingDepth(val);
                if (val === 'local') {
                  saveServerlessMode(true);
                } else {
                  saveServerlessMode(false);
                  const modelForTier = resolveGeminiModelByTaskTier(val);
                  savePreferredModel(modelForTier);
                }
              }}
              className="px-2 py-1 text-[11px] font-mono bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136] cursor-pointer"
            >
              <option value="fast">极速: gemini-3.1-flash-lite</option>
              <option value="standard">通用: gemini-4-hydrogen</option>
              <option value="interactive">交互: gemini-4-argon</option>
              <option value="deep">深推: gemini-4-carbon</option>
              <option value="local">离线: 本地自由对话内核</option>
            </select>

            <button
              type="button"
              data-testid="toggle-memory-drawer-btn"
              onClick={() => {
                setProfile(loadResearcherProfile());
                setMemoryDrawerOpen((v) => !v);
              }}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono border cursor-pointer ${
                memoryDrawerOpen
                  ? 'bg-[#2B7A5B] text-white border-[#2B7A5B]'
                  : 'bg-[#F3EFE6] dark:bg-[#15171A] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320]'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>记忆/便签 ({profile.notes.length})</span>
            </button>

            <button
              type="button"
              data-testid="export-comms-btn"
              onClick={async () => {
                const md = formatThreadAsMarkdown({
                  title:
                    mode === 'council'
                      ? '多主任联席会议'
                      : `${activeDirector.name} · ${activeDirector.sectionName}`,
                  sectionCode:
                    mode === 'council' ? 'COUNCIL' : activeDirector.sectionCode,
                  messages: currentMessages,
                });
                try {
                  const blob = new Blob([md], {
                    type: 'text/markdown;charset=utf-8',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `rhine-comms-${threadKey}.md`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  setExportNotice('已导出 Markdown 通讯纪要');
                  window.setTimeout(() => setExportNotice(null), 2500);
                } catch {
                  setExportNotice('导出完成');
                }
              }}
              title="导出当前对话为 Markdown 科研纪要"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] hover:border-[#E05320] cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">
                {exportNotice ?? '导出纪要'}
              </span>
            </button>

            <button
              type="button"
              onClick={clearCurrentThread}
              title="清空当前对话记录"
              className="p-1.5 border border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] hover:border-[#C83232] hover:text-[#C83232] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Researcher Profile & Local Memory Notes Drawer */}
        {memoryDrawerOpen && (
          <div
            data-testid="researcher-memory-drawer"
            className="px-4 py-2.5 bg-[#EAE5DA]/85 dark:bg-[#181B1F] border-b border-[#C8C2B6] dark:border-[#2E3136] text-xs font-mono shrink-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="font-bold text-[11px] text-[#E05320]">
                LOCAL MEMORY &amp; RESEARCHER PROFILE · 本地自由对话记忆与科研便签
              </span>
              <span className="text-[10px] text-[#6A6862] dark:text-[#8E8B82]">
                离线对话引擎会自动读取您的称呼、研究方向与便签内容
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <label className="flex items-center gap-2">
                <span className="text-[11px] text-[#6A6862] shrink-0">主任对您的称呼:</span>
                <input
                  type="text"
                  data-testid="profile-callsign-input"
                  value={profile.callSign}
                  onChange={(e) => {
                    const updated = { ...profile, callSign: e.target.value };
                    setProfile(updated);
                    saveResearcherProfile(updated);
                  }}
                  placeholder="如：博士 / 林研究员"
                  className="flex-1 px-2 py-1 text-xs bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]"
                />
              </label>

              <label className="flex items-center gap-2">
                <span className="text-[11px] text-[#6A6862] shrink-0">当前研究课题:</span>
                <input
                  type="text"
                  data-testid="profile-topic-input"
                  value={profile.focusTopic}
                  onChange={(e) => {
                    const updated = { ...profile, focusTopic: e.target.value };
                    setProfile(updated);
                    saveResearcherProfile(updated);
                  }}
                  placeholder="如：水分子流形 / 高空推进"
                  className="flex-1 px-2 py-1 text-xs bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]"
                />
              </label>
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="text"
                data-testid="new-note-input"
                value={newNoteInput}
                onChange={(e) => setNewNoteInput(e.target.value)}
                placeholder="添加本地科研备忘便签（主任在安慰或讨论时会引用）..."
                className="flex-1 px-2 py-1 text-xs bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]"
              />
              <button
                type="button"
                data-testid="add-note-btn"
                onClick={() => {
                  const clean = newNoteInput.trim();
                  if (!clean) return;
                  const updated = {
                    ...profile,
                    notes: [...profile.notes, clean],
                  };
                  setProfile(updated);
                  saveResearcherProfile(updated);
                  setNewNoteInput('');
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1A1B1D] text-[#F3EFE6] dark:bg-[#EAE6DC] dark:text-[#111315] text-[11px] font-bold cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>记录便签</span>
              </button>
            </div>

            {profile.notes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                {profile.notes.map((n, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]"
                  >
                    <span>#{idx + 1} {n}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = {
                          ...profile,
                          notes: profile.notes.filter((_, i) => i !== idx),
                        };
                        setProfile(updated);
                        saveResearcherProfile(updated);
                      }}
                      className="text-[#C83232] hover:opacity-75 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Custom Role System Instruction Editor */}
            <div className="mt-2 pt-2 border-t border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-bold text-[#1A1B1D] dark:text-[#EAE6DC]">
                  角色系统指令 (System Instruction · {activeDirector.name})
                </span>
                {customPersonas[activeDirector.id] && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...customPersonas };
                      delete next[activeDirector.id];
                      setCustomPersonas(next);
                      try {
                        localStorage.setItem(
                          'rhine_custom_personas_v1',
                          JSON.stringify(next)
                        );
                      } catch {
                        // Ignore
                      }
                    }}
                    className="text-[10px] text-[#E05320] hover:underline cursor-pointer"
                  >
                    恢复默认角色设定
                  </button>
                )}
              </div>
              <textarea
                aria-label="角色系统指令 System Instruction"
                data-testid="system-instruction-textarea"
                rows={2}
                value={
                  customPersonas[activeDirector.id] ?? activeDirector.systemPersona
                }
                onChange={(e) => {
                  const next = {
                    ...customPersonas,
                    [activeDirector.id]: e.target.value,
                  };
                  setCustomPersonas(next);
                  try {
                    localStorage.setItem(
                      'rhine_custom_personas_v1',
                      JSON.stringify(next)
                    );
                  } catch {
                    // Ignore
                  }
                }}
                className="w-full p-2 text-[11px] leading-relaxed bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] focus:outline-none focus:border-[#E05320]"
              />
            </div>
          </div>
        )}

        {/* Context Attachment Strip & Free-Chat Topic Matrix */}
        <div className="px-4 py-2 bg-[#F3EFE6] dark:bg-[#15171A] border-b border-[#C8C2B6] dark:border-[#2E3136] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setAttachEco((v) => !v)}
              aria-pressed={attachEco}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono border cursor-pointer ${
                attachEco
                  ? 'bg-[#2B7A5B]/15 border-[#2B7A5B] text-[#2B7A5B] dark:text-[#3FA67E] font-semibold'
                  : 'border-[#C8C2B6] dark:border-[#2E3136] text-[#6A6862]'
              }`}
            >
              <Droplets className="w-3 h-3" />
              <span>附带 Bio-Dome 04 遥测</span>
            </button>

            <button
              type="button"
              onClick={() => setAttachCode((v) => !v)}
              aria-pressed={attachCode}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono border cursor-pointer ${
                attachCode
                  ? 'bg-[#2A6396]/15 border-[#2A6396] text-[#2A6396] dark:text-[#4E8EC7] font-semibold'
                  : 'border-[#C8C2B6] dark:border-[#2E3136] text-[#6A6862]'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>附带脚本 ({activeCodeFile.filename})</span>
            </button>

            <select
              aria-label="切换本地对话话题分类"
              data-testid="topic-category-select"
              value={topicCategory}
              onChange={(e) =>
                setTopicCategory(
                  e.target.value as
                    | 'default'
                    | 'casual'
                    | 'empathy'
                    | 'gossip'
                    | 'math'
                    | 'algo'
                )
              }
              className="px-2 py-1 text-[11px] font-mono bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] cursor-pointer"
            >
              <option value="default">话题: 角色专属</option>
              <option value="casual">话题: 日常闲聊</option>
              <option value="empathy">话题: 情绪解压</option>
              <option value="gossip">话题: 同僚互评</option>
              <option value="math">工具: 科学计算/换算</option>
              <option value="algo">工具: 算法代码生成</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
            {(mode === 'council'
              ? [
                  '请各位主任从各自科室角度评估「孤星」之后莱茵生命最急迫的科研与伦理课题',
                  '如果 Bio-Dome 04 源石溶度突破 3.2 g/L，防卫科、生态科与能量科应如何协同处置？',
                ]
              : topicCategory === 'casual'
                ? [
                    '你好呀，今天在实验室忙什么呢？平时工作之余怎么放松？',
                    '那然后呢？顺着刚才聊到的方向再展开说说你的真实想法吧',
                  ]
                : topicCategory === 'empathy'
                  ? [
                      '今天连续加班做实验有点累和迷茫，能安慰我一下吗？',
                      '实验数据又失败了，感觉压力好大，你是怎么面对挫折的？',
                    ]
                  : topicCategory === 'gossip'
                    ? [
                        activeDirector.id === 'kristen'
                          ? '你心里究竟是怎么评价塞雷娅和缪尔赛思的？'
                          : '从你的角度来看，你怎么评价总辖克丽斯腾·莱特？',
                        activeDirector.id === 'saria'
                          ? '你怎么看赫默发起的伦理宣言以及帕维斯主任？'
                          : '你平时和塞雷娅、多萝西她们相处得怎么样？',
                      ]
                    : topicCategory === 'math'
                      ? [
                          '帮我计算 (128 * 4.5) / sqrt(81) + sin(pi/2)',
                          '计算 6000m 转英尺，以及均值与标准差 [41.2, 42.8, 44.0, 43.1, 45.5]',
                        ]
                      : topicCategory === 'algo'
                        ? [
                            '用 Python 写一段 RK4 龙格库塔法求解水分子流形微分方程并画图',
                            '用 TypeScript 实现一个卡尔曼滤波源石通量降噪与安全熔断器',
                          ]
                        : activeDirector.quickPrompts
            ).map((qp, idx) => (
              <button
                key={idx}
                type="button"
                disabled={Boolean(streamingSpeaker)}
                onClick={() => handleSend(qp)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-[#C8C2B6] dark:border-[#2E3136] bg-[#F8F5EE] dark:bg-[#111315] hover:border-[#E05320] whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3 text-[#E05320]" />
                <span className="truncate max-w-[210px]">{qp}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message Stream */}
        <div
          ref={scrollRef}
          data-testid="director-chat-stream"
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {currentMessages.map((msg) => {
            const isUser = msg.role === 'user';
            const codeBlocks = !isUser
              ? extractCodeBlocksFromMarkdown(msg.content)
              : [];
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] p-3.5 border ${
                    isUser
                      ? 'bg-[#1A1B1D] text-[#F3EFE6] border-[#1A1B1D] dark:bg-[#EAE6DC] dark:text-[#111315]'
                      : msg.error
                        ? 'bg-[#C83232]/10 border-[#C83232] text-[#C83232]'
                        : 'bg-[#F3EFE6] dark:bg-[#15171A] border-[#C8C2B6] dark:border-[#2E3136]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5 font-mono text-[10px]">
                    <span
                      className={`font-bold ${
                        isUser
                          ? 'text-[#E05320]'
                          : 'text-[#E05320] dark:text-[#F0622D]'
                      }`}
                    >
                      {msg.speakerCode ? `[${msg.speakerCode}] ` : ''}
                      {msg.speakerName}
                    </span>
                    <span className="opacity-65 tabular-nums">{msg.timestamp}</span>
                  </div>

                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content || (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#6A6862]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        正在传输神经链路报文...
                      </span>
                    )}
                  </div>

                  {codeBlocks.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-[#C8C2B6] dark:border-[#2E3136] flex flex-wrap gap-1.5">
                      {codeBlocks.map((blk, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onLoadCodeInSandbox(blk, true)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#2A6396] text-white font-mono text-[11px] font-semibold hover:bg-[#1e4c75] cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          <span>载入 {blk.title} 到代码沙盒并运行</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {streamingSpeaker && (
            <div className="flex items-center gap-2 text-xs font-mono text-[#E05320]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{streamingSpeaker} 正在回复...</span>
            </div>
          )}
        </div>

        {/* Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 px-4 py-3 border-t border-[#C8C2B6] dark:border-[#2E3136] bg-[#F3EFE6] dark:bg-[#15171A] shrink-0"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              mode === 'council'
                ? '向联席会议各位主任提出科学议题、代码方案或伦理质询...'
                : `向 ${activeDirector.name} 发送消息（支持附带代码/生态舱数据）...`
            }
            className="flex-1 min-w-0 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] px-3 py-2 text-xs sm:text-[13px] text-[#1A1B1D] dark:text-[#EAE6DC] placeholder:text-[#8E8B82] focus:outline-none focus:border-[#E05320]"
          />
          <button
            type="submit"
            disabled={Boolean(streamingSpeaker) || !inputValue.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E05320] hover:bg-[#C94517] text-white font-mono text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>发送</span>
          </button>
        </form>
      </div>
    </div>
  );
};
