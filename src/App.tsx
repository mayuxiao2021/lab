import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Droplets, Radio, Terminal, WifiOff } from 'lucide-react';
import {
  RHINE_DIRECTORS,
  RHINE_SECTIONS,
  type RhineSection,
} from './data/rhineLore';
import {
  ECO_PRESETS,
  findMatchingEcoPreset,
  type EcoParams,
  type EcoPresetId,
} from './logic/ecoSimulation';
import { CODE_TEMPLATES } from './logic/codeTemplates';
import {
  createBootEntries,
  nextTerminalId,
  resolveTerminalInput,
  runTerminalCommand,
  type TerminalCodeBlock,
  type TerminalEntry,
  type WorkspaceView,
} from './logic/terminalEngine';
import {
  BackendUnreachableError,
  fetchWithTimeout,
  isBackendUnreachableError,
  runOfflineTerminalAi,
} from './logic/localOfflineCore';
import type { ActivitySignals } from './logic/systemTelemetry';
import {
  loadPreferredModel,
  loadStoredActiveFileId,
  loadStoredActiveView,
  loadStoredCodeFiles,
  loadStoredEcoParams,
  loadStoredTheme,
  resolveApiUrl,
  saveStoredActiveFileId,
  saveStoredActiveView,
  saveStoredCodeFiles,
  saveStoredEcoParams,
  saveStoredTheme,
  shouldUseLocalServerlessOnly,
} from './logic/workspaceStorage';
import { useOnlineStatus } from './logic/usePWAInstall';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { TerminalView } from './components/TerminalView';
import { DirectorCommsView } from './components/DirectorCommsView';
import { CodeLabView, type CodeBufferFile } from './components/CodeLabView';
import { EcoSimView } from './components/EcoSimView';
import { EnvironmentModal } from './components/EnvironmentModal';

const DEFAULT_CODE_FILES: CodeBufferFile[] = CODE_TEMPLATES.map((t) => ({
  id: t.id,
  filename: t.filename,
  language: t.language,
  code: t.code,
}));

const MOBILE_NAV_ITEMS: {
  id: WorkspaceView;
  label: string;
  icon: typeof Terminal;
  activeColor: string;
}[] = [
  { id: 'terminal', label: 'AI 终端', icon: Terminal, activeColor: 'text-[#E05320] dark:text-[#F0622D]' },
  { id: 'comms', label: '主任通讯', icon: Radio, activeColor: 'text-[#E05320] dark:text-[#F0622D]' },
  { id: 'code', label: '代码沙盒', icon: Code2, activeColor: 'text-[#2A6396] dark:text-[#4E8EC7]' },
  { id: 'eco', label: '生态舱', icon: Droplets, activeColor: 'text-[#2B7A5B] dark:text-[#3FA67E]' },
];

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadStoredTheme());
  const [activeView, setActiveView] = useState<WorkspaceView>(() =>
    loadStoredActiveView()
  );
  const [activeSection, setActiveSection] = useState<RhineSection>(RHINE_SECTIONS[0]);
  const [decrypted, setDecrypted] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const isOnline = useOnlineStatus();

  // Intelligent AI Terminal State
  const [entries, setEntries] = useState<TerminalEntry[]>(() => createBootEntries());
  const [terminalDirectorId, setTerminalDirectorId] = useState<string>('rlos');
  const [terminalAiBusy, setTerminalAiBusy] = useState(false);

  // Director Comms State
  const [commsDirectorId, setCommsDirectorId] = useState<string>('muelsyse');
  const [commsDraftMessage, setCommsDraftMessage] = useState<string | null>(null);
  const [commsStreaming, setCommsStreaming] = useState(false);

  // Code Lab State (Persisted locally)
  const [codeFiles, setCodeFiles] = useState<CodeBufferFile[]>(() =>
    loadStoredCodeFiles(DEFAULT_CODE_FILES)
  );
  const [activeCodeFileId, setActiveCodeFileId] = useState<string>(() =>
    loadStoredActiveFileId(CODE_TEMPLATES[0].id)
  );
  const [autoRunToken, setAutoRunToken] = useState(0);
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeAiBusy, setCodeAiBusy] = useState(false);

  // Bio-Dome 04 Ecological Simulator State (Persisted locally)
  const [ecoParams, setEcoParams] = useState<EcoParams>(() =>
    loadStoredEcoParams(ECO_PRESETS[0].params)
  );
  const [activePreset, setActivePreset] = useState<EcoPresetId | null>(() =>
    findMatchingEcoPreset(loadStoredEcoParams(ECO_PRESETS[0].params))
  );
  const [mobileSectionsOpen, setMobileSectionsOpen] = useState(false);
  const [fluxBoost, setFluxBoost] = useState(0);
  const fluxTimerRef = useRef<number | null>(null);

  const triggerFluxBoost = useCallback(() => {
    setFluxBoost(1);
    if (fluxTimerRef.current !== null) {
      window.clearTimeout(fluxTimerRef.current);
    }
    fluxTimerRef.current = window.setTimeout(() => {
      setFluxBoost(0);
      fluxTimerRef.current = null;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (fluxTimerRef.current !== null) {
        window.clearTimeout(fluxTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveStoredActiveView(activeView);
  }, [activeView]);

  useEffect(() => {
    saveStoredCodeFiles(codeFiles);
  }, [codeFiles]);

  useEffect(() => {
    saveStoredActiveFileId(activeCodeFileId);
  }, [activeCodeFileId]);

  useEffect(() => {
    saveStoredEcoParams(ecoParams);
  }, [ecoParams]);

  useEffect(() => {
    if (activeView !== 'comms') setCommsStreaming(false);
    if (activeView !== 'code') {
      setCodeRunning(false);
      setCodeAiBusy(false);
    }
  }, [activeView]);

  const handleCodeActivityChange = useCallback(
    ({ running, aiBusy }: { running: boolean; aiBusy: boolean }) => {
      setCodeRunning(running);
      setCodeAiBusy(aiBusy);
    },
    []
  );

  const telemetrySignals = useMemo<ActivitySignals>(
    () => ({
      aiActive: terminalAiBusy || commsStreaming || codeAiBusy,
      codeRunning,
      activeView,
      simSpeed: ecoParams.simSpeed,
      originium: ecoParams.originium,
      scanActive: fluxBoost > 0,
    }),
    [
      terminalAiBusy,
      commsStreaming,
      codeAiBusy,
      codeRunning,
      activeView,
      ecoParams.simSpeed,
      ecoParams.originium,
      fluxBoost,
    ]
  );

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handlePatchEcoParams = (patch: Partial<EcoParams>) => {
    setActivePreset(null);
    setEcoParams((prev) => ({ ...prev, ...patch }));
  };

  const handleLoadCodeInSandbox = (
    block: TerminalCodeBlock,
    autoRun = false
  ) => {
    const newFile: CodeBufferFile = {
      id: nextTerminalId('ai-code'),
      filename: block.title,
      language: block.language,
      code: block.code,
    };
    setCodeFiles((prev) => [...prev, newFile]);
    setActiveCodeFileId(newFile.id);
    setActiveView('code');
    if (autoRun) {
      setAutoRunToken((t) => t + 1);
    }
  };

  const handleExecuteCommand = async (raw: string) => {
    const routing = resolveTerminalInput(raw);
    if (routing.mode === 'empty') return;

    if (routing.mode === 'cli') {
      const effect = runTerminalCommand(routing.command, {
        activeSection,
        decrypted,
        ecoParams,
      });

      if (effect.clear) {
        setEntries([]);
      } else if (effect.reboot) {
        setEntries(effect.entries);
      } else if (effect.entries.length > 0) {
        setEntries((prev) => [...prev, ...effect.entries]);
      }

      if (effect.selectSection) {
        setActiveSection(effect.selectSection);
      }
      if (effect.selectDirectorId) {
        setCommsDirectorId(effect.selectDirectorId);
      }
      if (effect.switchView) {
        setActiveView(effect.switchView);
      }
      if (effect.applyPreset) {
        const found = ECO_PRESETS.find((p) => p.id === effect.applyPreset);
        if (found) {
          setEcoParams((prev) => ({ ...found.params, simSpeed: prev.simSpeed }));
          setActivePreset(found.id);
        }
      }
      if (effect.setTheme) {
        if (effect.setTheme === 'toggle') {
          handleToggleTheme();
        } else {
          setTheme(effect.setTheme);
        }
      }
      if (effect.setDecrypted) {
        setDecrypted(true);
      }
      if (effect.triggerScan) {
        triggerFluxBoost();
      }
      if (effect.openEnvironmentModal) {
        setEnvModalOpen(true);
      }
      return;
    }

    // Intelligent AI Terminal Execution
    const targetDirectorId = routing.directorId ?? terminalDirectorId;
    if (routing.directorId) {
      setTerminalDirectorId(routing.directorId);
    }

    const cmdEcho: TerminalEntry = {
      id: nextTerminalId('cmd'),
      kind: 'command',
      promptPath: `~/${activeSection.short.toLowerCase()}`,
      text: raw.trim(),
    };
    setEntries((prev) => [...prev, cmdEcho]);
    setTerminalAiBusy(true);

    try {
      const recentHistory = entries
        .filter((e) => e.kind === 'command' || e.kind === 'ai')
        .slice(-6)
        .map((e) => ({
          role: (e.kind === 'command' ? 'user' : 'model') as 'user' | 'model',
          text: e.text ?? '',
        }));

      const localHistory = recentHistory.map((h) => ({
        role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: h.text,
      }));

      if (shouldUseLocalServerlessOnly()) {
        const offline = runOfflineTerminalAi({
          prompt: routing.prompt,
          directorId: targetDirectorId,
          activeSectionShort: activeSection.short,
          ecoParams,
          history: localHistory,
        });
        const appliedLabels: string[] = [];
        for (const act of offline.toolActions) {
          appliedLabels.push(act.label);
          if (act.type === 'set_eco_params' && act.data) {
            handlePatchEcoParams(act.data as Partial<EcoParams>);
          } else if (act.type === 'inspect_section' && act.data?.sectionShort) {
            const sec = RHINE_SECTIONS.find(
              (s) => s.short === String(act.data?.sectionShort).toUpperCase()
            );
            if (sec) setActiveSection(sec);
          } else if (act.type === 'trigger_scan') {
            triggerFluxBoost();
          }
        }
        setEntries((prev) => [
          ...prev,
          {
            id: nextTerminalId('ai'),
            kind: 'ai',
            speakerName: `${offline.speakerName} · SERVERLESS`,
            speakerCode: offline.speakerCode,
            text: offline.reply,
            toolActions: appliedLabels,
            codeBlocks: offline.codeBlocks,
          },
        ]);
        return;
      }

      const apiUrl = resolveApiUrl('/api/ai/terminal');
      const resp = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: routing.prompt,
          directorId: targetDirectorId,
          activeSectionShort: activeSection.short,
          ecoParams,
          history: recentHistory,
          model: loadPreferredModel(),
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new BackendUnreachableError(`远端节点返回非 JSON 响应 (HTTP ${resp.status})`, {
          status: resp.status,
          targetUrl: apiUrl,
        });
      }

      const data = (await resp.json()) as {
        reply?: string;
        speakerName?: string;
        speakerCode?: string;
        toolActions?: {
          type: 'set_eco_params' | 'inspect_section' | 'load_code' | 'trigger_scan';
          label: string;
          data?: Record<string, unknown>;
        }[];
        codeBlocks?: TerminalCodeBlock[];
        error?: string;
      };

      if (!resp.ok || data.error) {
        if (resp.status === 404 || resp.status >= 502) {
          throw new BackendUnreachableError(`HTTP ${resp.status}`, {
            status: resp.status,
            targetUrl: apiUrl,
          });
        }
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const appliedLabels: string[] = [];
      for (const act of data.toolActions ?? []) {
        appliedLabels.push(act.label);
        if (act.type === 'set_eco_params' && act.data) {
          handlePatchEcoParams(act.data as Partial<EcoParams>);
        } else if (act.type === 'inspect_section' && act.data?.sectionShort) {
          const sec = RHINE_SECTIONS.find(
            (s) => s.short === String(act.data?.sectionShort).toUpperCase()
          );
          if (sec) setActiveSection(sec);
        } else if (act.type === 'trigger_scan') {
          triggerFluxBoost();
        }
      }

      setEntries((prev) => [
        ...prev,
        {
          id: nextTerminalId('ai'),
          kind: 'ai',
          speakerName: data.speakerName,
          speakerCode: data.speakerCode,
          text: data.reply,
          toolActions: appliedLabels,
          codeBlocks: data.codeBlocks,
        },
      ]);
    } catch (err) {
      if (isBackendUnreachableError(err)) {
        const offline = runOfflineTerminalAi({
          prompt: routing.prompt,
          directorId: targetDirectorId,
          activeSectionShort: activeSection.short,
          ecoParams,
        });
        const appliedLabels: string[] = [];
        for (const act of offline.toolActions) {
          appliedLabels.push(act.label);
          if (act.type === 'set_eco_params' && act.data) {
            handlePatchEcoParams(act.data as Partial<EcoParams>);
          } else if (act.type === 'inspect_section' && act.data?.sectionShort) {
            const sec = RHINE_SECTIONS.find(
              (s) => s.short === String(act.data?.sectionShort).toUpperCase()
            );
            if (sec) setActiveSection(sec);
          } else if (act.type === 'trigger_scan') {
            triggerFluxBoost();
          }
        }
        setEntries((prev) => [
          ...prev,
          {
            id: nextTerminalId('ai'),
            kind: 'ai',
            speakerName: `${offline.speakerName} · LOCAL`,
            speakerCode: offline.speakerCode,
            text: offline.reply,
            toolActions: appliedLabels,
            codeBlocks: offline.codeBlocks,
          },
        ]);
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      setEntries((prev) => [
        ...prev,
        {
          id: nextTerminalId('err'),
          kind: 'line',
          tone: 'error',
          text: `[AI CORE ERROR] ${message}`,
        },
      ]);
    } finally {
      setTerminalAiBusy(false);
    }
  };

  const handleSelectSection = (section: RhineSection) => {
    setActiveSection(section);
    if (section.short === 'ECO') {
      setActiveView('eco');
    } else if (activeView === 'comms') {
      const matched = RHINE_DIRECTORS.find((d) => d.id === section.directorId);
      if (matched) setCommsDirectorId(matched.id);
    } else {
      setActiveView('terminal');
      handleExecuteCommand(`inspect ${section.short}`);
    }
  };

  const handleTalkToDirector = (directorId: string) => {
    setCommsDirectorId(directorId);
    setActiveView('comms');
  };

  const handleChangeEcoParam = <K extends keyof EcoParams>(
    key: K,
    value: number
  ) => {
    if (key !== 'simSpeed') {
      setActivePreset(null);
    }
    setEcoParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyPreset = (presetId: EcoPresetId) => {
    const found = ECO_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setEcoParams((prev) => ({ ...found.params, simSpeed: prev.simSpeed }));
      setActivePreset(found.id);
    }
  };

  const activeCodeFile =
    codeFiles.find((f) => f.id === activeCodeFileId) ?? codeFiles[0];

  return (
    <div
      data-theme={theme}
      data-view={activeView}
      className="min-h-screen w-full overflow-x-hidden flex items-center justify-center p-0 sm:p-3 lg:p-5"
    >
      <div className="relative w-full max-w-[1400px] min-w-0 h-[100dvh] sm:h-[96vh] sm:max-h-[920px] flex flex-col bg-[#F3EFE6] dark:bg-[#15171A] border-0 sm:border-2 border-[#1A1B1D] dark:border-[#EAE6DC] sm:shadow-[8px_8px_0_rgba(0,0,0,0.12)]">
        {/* Precision Corner Crosshairs */}
        <span
          aria-hidden="true"
          className="hidden sm:block pointer-events-none absolute -top-1.5 -left-1.5 w-2.5 h-2.5 before:content-[''] before:absolute before:top-1 before:left-0 before:w-2.5 before:h-[1px] before:bg-[#E05320] after:content-[''] after:absolute after:left-1 after:top-0 after:w-[1px] after:h-2.5 after:bg-[#E05320] z-20"
        />
        <span
          aria-hidden="true"
          className="hidden sm:block pointer-events-none absolute -top-1.5 -right-1.5 w-2.5 h-2.5 before:content-[''] before:absolute before:top-1 before:left-0 before:w-2.5 before:h-[1px] before:bg-[#E05320] after:content-[''] after:absolute after:left-1 after:top-0 after:w-[1px] after:h-2.5 after:bg-[#E05320] z-20"
        />
        <span
          aria-hidden="true"
          className="hidden sm:block pointer-events-none absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 before:content-[''] before:absolute before:top-1 before:left-0 before:w-2.5 before:h-[1px] before:bg-[#E05320] after:content-[''] after:absolute after:left-1 after:top-0 after:w-[1px] after:h-2.5 after:bg-[#E05320] z-20"
        />
        <span
          aria-hidden="true"
          className="hidden sm:block pointer-events-none absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 before:content-[''] before:absolute before:top-1 before:left-0 before:w-2.5 before:h-[1px] before:bg-[#E05320] after:content-[''] after:absolute after:left-1 after:top-0 after:w-[1px] after:h-2.5 after:bg-[#E05320] z-20"
        />

        <TopBar
          activeView={activeView}
          onChangeView={(view) => {
            setActiveView(view);
            if (view === 'eco') {
              const ecoSec = RHINE_SECTIONS.find((s) => s.short === 'ECO');
              if (ecoSec) setActiveSection(ecoSec);
            }
          }}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenMobileSections={() => setMobileSectionsOpen(true)}
          onOpenEnvModal={() => setEnvModalOpen(true)}
          telemetrySignals={telemetrySignals}
        />

        {!isOnline && (
          <div className="px-3 py-1 bg-[#B47811] text-white font-mono text-[11px] font-semibold flex items-center justify-center gap-2 shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
            <span>离线无服务器模式：Python 3 (Pyodide WASM)、TypeScript (Sucrase)、Eco-Bridge JS 与本地核心均正常演算</span>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <Sidebar
            activeSection={activeSection}
            activeView={activeView}
            theme={theme}
            fluxBoost={fluxBoost}
            onSelectSection={handleSelectSection}
            onTalkToDirector={handleTalkToDirector}
            mobileOpen={mobileSectionsOpen}
            onCloseMobile={() => setMobileSectionsOpen(false)}
          />

          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            {activeView === 'terminal' && (
              <TerminalView
                entries={entries}
                activeSection={activeSection}
                activeAiDirectorId={terminalDirectorId}
                aiBusy={terminalAiBusy}
                onChangeAiDirector={setTerminalDirectorId}
                onExecute={handleExecuteCommand}
                onLoadCodeInSandbox={handleLoadCodeInSandbox}
                onOpenDirectorComms={() => setActiveView('comms')}
                onOpenCodeLab={() => setActiveView('code')}
                onOpenEcoLab={() => {
                  const ecoSec = RHINE_SECTIONS.find((s) => s.short === 'ECO');
                  if (ecoSec) setActiveSection(ecoSec);
                  setActiveView('eco');
                }}
              />
            )}

            {activeView === 'comms' && (
              <DirectorCommsView
                selectedDirectorId={commsDirectorId}
                onSelectDirector={setCommsDirectorId}
                ecoParams={ecoParams}
                activeCodeFile={activeCodeFile}
                draftMessage={commsDraftMessage}
                onConsumeDraftMessage={() => setCommsDraftMessage(null)}
                onLoadCodeInSandbox={handleLoadCodeInSandbox}
                onStreamingChange={setCommsStreaming}
              />
            )}

            {activeView === 'code' && (
              <CodeLabView
                files={codeFiles}
                activeFileId={activeCodeFileId}
                onSelectFile={setActiveCodeFileId}
                onUpdateFile={(id, patch) =>
                  setCodeFiles((prev) =>
                    prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
                  )
                }
                onAddFile={(file) => {
                  setCodeFiles((prev) => [...prev, file]);
                  setActiveCodeFileId(file.id);
                }}
                onDeleteFile={(id) => {
                  setCodeFiles((prev) => {
                    const next = prev.filter((f) => f.id !== id);
                    if (activeCodeFileId === id && next.length > 0) {
                      setActiveCodeFileId(next[0].id);
                    }
                    return next;
                  });
                }}
                ecoParams={ecoParams}
                onPatchEcoParams={handlePatchEcoParams}
                onSendToDirectorReview={(file, lastOutput) => {
                  setCommsDraftMessage(
                    `请帮我评审代码文件「${file.filename}」(${file.language})，${
                      lastOutput
                        ? `最近一次运行输出如下：\n${lastOutput.slice(0, 400)}`
                        : '请给出算法安全性、结构设计与性能优化建议。'
                    }`
                  );
                  setActiveView('comms');
                }}
                autoRunToken={autoRunToken}
                onActivityChange={handleCodeActivityChange}
              />
            )}

            {activeView === 'eco' && (
              <EcoSimView
                params={ecoParams}
                activePreset={activePreset}
                theme={theme}
                onChangeParam={handleChangeEcoParam}
                onApplyPreset={handleApplyPreset}
                onSyncToTerminal={() => {
                  setActiveView('terminal');
                  handleExecuteCommand('eco status');
                }}
              />
            )}
          </main>
        </div>

        {/* Native Mobile / Android Bottom Navigation Dock */}
        <nav
          aria-label="移动端工作区切换"
          className="md:hidden grid grid-cols-4 border-t border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#EAE5DA] dark:bg-[#1D2024] shrink-0 pb-[env(safe-area-inset-bottom)]"
        >
          {MOBILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActiveView(item.id);
                  if (item.id === 'eco') {
                    const ecoSec = RHINE_SECTIONS.find((s) => s.short === 'ECO');
                    if (ecoSec) setActiveSection(ecoSec);
                  }
                }}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-mono font-semibold border-r last:border-r-0 border-[#C8C2B6] dark:border-[#2E3136] cursor-pointer ${
                  isActive
                    ? `bg-[#F8F5EE] dark:bg-[#111315] ${item.activeColor}`
                    : 'text-[#6A6862] dark:text-[#8E8B82]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <EnvironmentModal
          open={envModalOpen}
          onClose={() => setEnvModalOpen(false)}
          fileCount={codeFiles.length}
          onResetWorkspace={() => {
            setCodeFiles(DEFAULT_CODE_FILES);
            setActiveCodeFileId(DEFAULT_CODE_FILES[0].id);
            setEcoParams(ECO_PRESETS[0].params);
            setActivePreset('habitat');
          }}
        />
      </div>
    </div>
  );
}
