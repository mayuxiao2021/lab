import React, { useMemo, useState } from 'react';
import {
  Play,
  Sparkles,
  Wrench,
  BookOpen,
  Plus,
  Radio,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  TerminalSquare,
} from 'lucide-react';
import {
  CODE_TEMPLATES,
  type CodeLanguage,
} from '../logic/codeTemplates';
import {
  executeBrowserScript,
  executeLocalPython,
  executeLocalTypeScript,
  parseStructuredStdout,
  type PlotSeries,
  type SandboxExecutionResult,
} from '../logic/browserSandbox';
import type { EcoParams } from '../logic/ecoSimulation';
import {
  BackendUnreachableError,
  diagnoseConnectionIssue,
  fetchWithTimeout,
  isBackendUnreachableError,
  runOfflineCodeAssist,
} from '../logic/localOfflineCore';
import { nextTerminalId } from '../logic/terminalEngine';
import {
  loadPreferredModel,
  resolveApiUrl,
  shouldUseLocalServerlessOnly,
} from '../logic/workspaceStorage';

export interface CodeBufferFile {
  id: string;
  filename: string;
  language: CodeLanguage;
  code: string;
}

interface CodeLabViewProps {
  files: CodeBufferFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onUpdateFile: (id: string, patch: Partial<CodeBufferFile>) => void;
  onAddFile: (file: CodeBufferFile) => void;
  onDeleteFile: (id: string) => void;
  ecoParams: EcoParams;
  onPatchEcoParams: (patch: Partial<EcoParams>) => void;
  onSendToDirectorReview: (file: CodeBufferFile, lastOutput?: string) => void;
  autoRunToken: number;
  onActivityChange?: (activity: { running: boolean; aiBusy: boolean }) => void;
}

const RUNTIME_OPTIONS: {
  id: CodeLanguage;
  label: string;
  badge: string;
}[] = [
  { id: 'javascript', label: 'Eco-Bridge JS (浏览器联动)', badge: 'BROWSER + ECO-API' },
  { id: 'python', label: 'Python 3 (服务端 / 包内 WASM)', badge: 'PYTHON 3.x + PYODIDE' },
  { id: 'typescript', label: 'TypeScript (Node / 本地 Sucrase)', badge: 'TS / SANDBOX' },
];

const TelemetryPlotCard: React.FC<{ series: PlotSeries }> = ({ series }) => {
  const { points, title } = series;
  if (!points || points.length === 0) return null;

  const width = 460;
  const height = 150;
  const padX = 38;
  const padY = 20;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const coords = points.map((p) => {
    const px = padX + ((p.x - minX) / spanX) * (width - padX * 1.4);
    const py = height - padY - ((p.y - minY) / spanY) * (height - padY * 2);
    return { px, py, raw: p };
  });

  const polyline = coords.map((c) => `${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ');

  return (
    <div className="p-2.5 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
      <div className="flex items-center justify-between text-[11px] font-mono font-bold mb-1.5">
        <span className="text-[#2A6396] dark:text-[#4E8EC7]">{title}</span>
        <span className="text-[#6A6862] dark:text-[#8E8B82] tabular-nums">
          [{minY.toFixed(2)} ~ {maxY.toFixed(2)}]
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[145px] block">
        <line
          x1={padX}
          y1={height - padY}
          x2={width - 14}
          y2={height - padY}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <line
          x1={padX}
          y1={padY}
          x2={padX}
          y2={height - padY}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <text x={4} y={padY + 6} fontSize="10" fill="currentColor" opacity="0.65">
          {maxY.toFixed(1)}
        </text>
        <text x={4} y={height - padY} fontSize="10" fill="currentColor" opacity="0.65">
          {minY.toFixed(1)}
        </text>
        <polyline
          fill="none"
          stroke="#E05320"
          strokeWidth="2.2"
          points={polyline}
        />
        {coords.map((c, idx) => (
          <circle key={idx} cx={c.px} cy={c.py} r="2.8" fill="#2A6396" />
        ))}
      </svg>
    </div>
  );
};

export const CodeLabView: React.FC<CodeLabViewProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onUpdateFile,
  onAddFile,
  onDeleteFile,
  ecoParams,
  onPatchEcoParams,
  onSendToDirectorReview,
  autoRunToken,
  onActivityChange,
}) => {
  const activeFile =
    files.find((f) => f.id === activeFileId) ?? files[0];

  const [running, setRunning] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [result, setResult] = useState<SandboxExecutionResult | null>(null);
  const [showStdin, setShowStdin] = useState(false);
  const [stdinText, setStdinText] = useState('');
  const [copiedOutput, setCopiedOutput] = useState(false);
  const lastAutoRunRef = React.useRef(autoRunToken);

  const copyTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    onActivityChange?.({ running, aiBusy });
  }, [running, aiBusy, onActivityChange]);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, activeFile.code.split('\n').length);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [activeFile.code]);

  const handleRunCode = React.useCallback(async () => {
    if (running) return;
    setRunning(true);
    const apiUrl = resolveApiUrl('/api/code/run');
    try {
      if (activeFile.language === 'javascript') {
        const res = await executeBrowserScript(activeFile.code, {
          getParams: () => ecoParams,
          onSetParams: onPatchEcoParams,
        });
        setResult(res);
      } else if (shouldUseLocalServerlessOnly()) {
        if (activeFile.language === 'typescript') {
          const localRes = await executeLocalTypeScript(activeFile.code, {
            getParams: () => ecoParams,
            onSetParams: onPatchEcoParams,
          });
          setResult(localRes);
          setAiNote('✓ [SERVERLESS] 已使用包体内置 Sucrase TypeScript 沙盒完成本地演算。');
        } else {
          setAiNote('正在初始化包体内置 Pyodide Python 3 WASM 引擎...');
          const localPyRes = await executeLocalPython(activeFile.code, stdinText);
          setResult(localPyRes);
          setAiNote(
            localPyRes.ok
              ? '✓ [SERVERLESS] 已使用包体内置 Pyodide Python 3 WASM 引擎完成本地演算。'
              : '已使用包体内置 Pyodide Python 3 WASM 引擎执行（仅含 Python 标准库）。'
          );
        }
      } else {
        const resp = await fetchWithTimeout(
          apiUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language: activeFile.language,
              code: activeFile.code,
              stdin: stdinText,
            }),
          },
          7000
        );
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new BackendUnreachableError(`HTTP ${resp.status}`, {
            status: resp.status,
            targetUrl: apiUrl,
          });
        }
        const data = (await resp.json().catch(() => ({ ok: false }))) as {
          ok: boolean;
          stdout?: string;
          stderr?: string;
          durationMs?: number;
        };
        if (!resp.ok && !data.stderr) {
          if (resp.status === 404 || resp.status >= 502) {
            throw new BackendUnreachableError(`HTTP ${resp.status}`, {
              status: resp.status,
              targetUrl: apiUrl,
            });
          }
          throw new Error(`Sandbox HTTP ${resp.status}`);
        }
        const parsed = parseStructuredStdout(data.stdout ?? '');
        setResult({
          ok: Boolean(data.ok),
          stdout: parsed.cleanStdout,
          stderr: data.stderr ?? '',
          durationMs: data.durationMs ?? 0,
          plots: parsed.plots,
          tables: [],
        });
      }
    } catch (err) {
      if (activeFile.language === 'typescript' && isBackendUnreachableError(err)) {
        const localRes = await executeLocalTypeScript(activeFile.code, {
          getParams: () => ecoParams,
          onSetParams: onPatchEcoParams,
        });
        setResult(localRes);
        setAiNote('✓ 远端 Node 沙盒未连接，已自动切换至包体内置 Sucrase TypeScript 沙盒完成运算。');
      } else if (activeFile.language === 'python' && isBackendUnreachableError(err)) {
        setAiNote('正在初始化包体内置 Pyodide Python 3 WASM 引擎...');
        const localPyRes = await executeLocalPython(activeFile.code, stdinText);
        setResult(localPyRes);
        setAiNote(
          localPyRes.ok
            ? '✓ 远端沙盒未连接，已使用包体内置 Pyodide Python 3 WASM 引擎完成离线运算。'
            : '已使用本地 Pyodide Python 3 WASM 引擎执行（若依赖非标准库模块，请配置远端服务端节点）。'
        );
      } else {
        setResult({
          ok: false,
          stdout: '',
          stderr: isBackendUnreachableError(err)
            ? diagnoseConnectionIssue(err, apiUrl)
            : err instanceof Error
              ? err.message
              : String(err),
          durationMs: 0,
          plots: [],
          tables: [],
        });
      }
    } finally {
      setRunning(false);
    }
  }, [activeFile.code, activeFile.language, ecoParams, onPatchEcoParams, running, stdinText]);

  React.useEffect(() => {
    if (autoRunToken !== lastAutoRunRef.current) {
      lastAutoRunRef.current = autoRunToken;
      handleRunCode();
    }
  }, [autoRunToken, handleRunCode]);

  const handleAiAssist = async (
    mode: 'generate' | 'fix' | 'explain' | 'optimize'
  ) => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiNote(null);
    const apiUrl = resolveApiUrl('/api/ai/code-assist');
    try {
      if (shouldUseLocalServerlessOnly()) {
        const offline = runOfflineCodeAssist({
          mode,
          language: activeFile.language,
          code: activeFile.code,
          errorOutput: result?.stderr || '',
          prompt: aiPrompt.trim(),
        });
        if (mode !== 'explain' && offline.code) {
          onUpdateFile(activeFile.id, { code: offline.code });
        }
        setAiNote(offline.explanation);
        return;
      }
      const resp = await fetchWithTimeout(
        apiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            language: activeFile.language,
            code: activeFile.code,
            errorOutput: result?.stderr || '',
            prompt:
              aiPrompt.trim() ||
              (mode === 'generate'
                ? '生成一个莱茵生命科学计算或 Bio-Dome 04 遥测分析脚本'
                : ''),
            directorId: activeFile.language === 'javascript' ? 'muelsyse' : 'ptilopsis',
            model: loadPreferredModel(),
          }),
        },
        8000
      );
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new BackendUnreachableError(`HTTP ${resp.status}`, {
          status: resp.status,
          targetUrl: apiUrl,
        });
      }
      const data = (await resp.json()) as {
        ok: boolean;
        speakerName?: string;
        explanation?: string;
        code?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        if (resp.status === 404 || resp.status >= 502) {
          throw new BackendUnreachableError(`HTTP ${resp.status}`, {
            status: resp.status,
            targetUrl: apiUrl,
          });
        }
        throw new Error(data.error || 'AI 辅助请求失败');
      }
      if (mode !== 'explain' && data.code) {
        onUpdateFile(activeFile.id, { code: data.code });
      }
      setAiNote(`[${data.speakerName || '白面鸮'}] ${data.explanation}`);
    } catch (err) {
      if (isBackendUnreachableError(err)) {
        const offline = runOfflineCodeAssist({
          mode,
          language: activeFile.language,
          code: activeFile.code,
          errorOutput: result?.stderr || '',
          prompt: aiPrompt.trim(),
        });
        if (mode !== 'explain' && offline.code) {
          onUpdateFile(activeFile.id, { code: offline.code });
        }
        setAiNote(`[LOCAL CORE] ${offline.explanation}`);
      } else {
        setAiNote(
          `[AI ERROR] ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      setAiBusy(false);
    }
  };

  const handleNewBlankScript = () => {
    const idx = files.length + 1;
    const ext =
      activeFile.language === 'python'
        ? 'py'
        : activeFile.language === 'typescript'
          ? 'ts'
          : 'js';
    onAddFile({
      id: nextTerminalId('custom'),
      filename: `experiment_${idx}.${ext}`,
      language: activeFile.language,
      code:
        activeFile.language === 'python'
          ? `import math\n\nprint("RHINE LAB PYTHON SANDBOX READY")\n`
          : activeFile.language === 'typescript'
            ? `const msg: string = "RHINE LAB TS SANDBOX READY";\nconsole.log(msg);\n`
            : `const params = rhine.eco.getParams();\nconsole.log("Bio-Dome 04:", params);\n`,
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#F8F5EE] dark:bg-[#111315] text-[#1A1B1D] dark:text-[#EAE6DC]">
      {/* Top File Tabs & Template Bar */}
      <div className="px-3 sm:px-4 py-2 bg-[#EAE5DA] dark:bg-[#1D2024] border-b border-[#C8C2B6] dark:border-[#2E3136] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {files.map((f) => {
            const isActive = f.id === activeFile.id;
            return (
              <div
                key={f.id}
                className={`flex items-center border text-xs font-mono shrink-0 ${
                  isActive
                    ? 'bg-[#F8F5EE] dark:bg-[#111315] border-[#1A1B1D] dark:border-[#EAE6DC] font-bold'
                    : 'bg-[#F3EFE6]/60 dark:bg-[#15171A]/60 border-[#C8C2B6] dark:border-[#2E3136] text-[#6A6862]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectFile(f.id)}
                  className="px-2.5 py-1 cursor-pointer"
                >
                  {f.filename}
                </button>
                {files.length > 1 && (
                  <button
                    type="button"
                    aria-label={`关闭 ${f.filename}`}
                    onClick={() => onDeleteFile(f.id)}
                    className="pr-1.5 text-[#6A6862] hover:text-[#C83232] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleNewBlankScript}
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-dashed border-[#6A6862] hover:border-[#E05320] cursor-pointer shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>新建</span>
          </button>
        </div>

        {/* Preset Templates Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="载入莱茵实验脚本模板"
            value=""
            onChange={(e) => {
              const tpl = CODE_TEMPLATES.find((t) => t.id === e.target.value);
              if (tpl) {
                const existing = files.find(
                  (f) => f.id === tpl.id || f.filename === tpl.filename
                );
                if (existing) {
                  onSelectFile(existing.id);
                } else {
                  onAddFile({
                    id: tpl.id,
                    filename: tpl.filename,
                    language: tpl.language,
                    code: tpl.code,
                  });
                }
              }
            }}
            className="px-2 py-1 text-xs font-mono bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136] cursor-pointer"
          >
            <option value="">+ 载入实验模板...</option>
            {CODE_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                [{tpl.language.toUpperCase()}] {tpl.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              onSendToDirectorReview(
                activeFile,
                result ? `${result.stdout}\n${result.stderr}`.trim() : undefined
              )
            }
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold border border-[#E05320] text-[#E05320] bg-[#F3EFE6] dark:bg-[#15171A] hover:bg-[#E05320] hover:text-white cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">发送主任评审</span>
          </button>
        </div>
      </div>

      {/* Runtime & Execution Toolbar */}
      <div className="px-3 sm:px-4 py-2 bg-[#F3EFE6] dark:bg-[#15171A] border-b border-[#C8C2B6] dark:border-[#2E3136] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="code-lang-select" className="text-[11px] font-mono font-semibold text-[#6A6862]">
            运行环境:
          </label>
          <select
            id="code-lang-select"
            value={activeFile.language}
            onChange={(e) => {
              const lang = e.target.value as CodeLanguage;
              const ext = lang === 'python' ? 'py' : lang === 'typescript' ? 'ts' : 'js';
              const base = activeFile.filename.replace(/\.(py|ts|js)$/i, '');
              onUpdateFile(activeFile.id, {
                language: lang,
                filename: `${base}.${ext}`,
              });
            }}
            className="px-2 py-1 text-xs font-mono font-semibold bg-[#EAE5DA] dark:bg-[#1D2024] border border-[#1A1B1D] dark:border-[#EAE6DC] cursor-pointer"
          >
            {RUNTIME_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {activeFile.language !== 'javascript' && (
            <button
              type="button"
              onClick={() => setShowStdin((v) => !v)}
              aria-pressed={showStdin}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-semibold border cursor-pointer ${
                showStdin
                  ? 'bg-[#1A1B1D] text-[#F3EFE6] border-[#1A1B1D] dark:bg-[#EAE6DC] dark:text-[#111315]'
                  : 'bg-[#EAE5DA] dark:bg-[#1D2024] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320]'
              }`}
            >
              <TerminalSquare className="w-3.5 h-3.5" />
              <span>stdin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const blob = new Blob([activeFile.code], {
                type: 'text/plain;charset=utf-8',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = activeFile.filename;
              a.click();
              URL.revokeObjectURL(url);
            }}
            title="下载当前脚本文件"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-semibold border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#2A6396] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">导出</span>
          </button>

          <button
            type="button"
            data-testid="run-code-btn"
            disabled={running}
            onClick={handleRunCode}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#2A6396] hover:bg-[#1e4c75] text-white font-mono text-xs font-bold border border-[#1A1B1D] cursor-pointer disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>运行代码 (Ctrl+Enter)</span>
          </button>
        </div>
      </div>

      {showStdin && activeFile.language !== 'javascript' && (
        <div className="px-3 sm:px-4 py-2 bg-[#EAE5DA] dark:bg-[#1D2024] border-b border-[#C8C2B6] dark:border-[#2E3136] flex items-start gap-2 shrink-0">
          <span className="font-mono text-[11px] font-bold text-[#6A6862] mt-1 shrink-0">
            STDIN:
          </span>
          <textarea
            rows={2}
            value={stdinText}
            onChange={(e) => setStdinText(e.target.value)}
            placeholder="输入标准输入数据 (将通过 stdin 传入 Python 3 / Node 进程)..."
            className="flex-1 px-2 py-1 text-xs font-mono bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] focus:outline-none focus:border-[#E05320]"
          />
        </div>
      )}

      {/* Main Split: Code Editor (Left) + Execution Console & Plots (Right) */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1.25fr_1fr] overflow-hidden">
        {/* Code Editor Pane */}
        <div className="relative flex flex-col min-h-[240px] flex-1 border-b lg:border-b-0 lg:border-r border-[#C8C2B6] dark:border-[#2E3136] overflow-hidden">
          <div className="relative flex flex-1 min-h-0 overflow-auto bg-[#F8F5EE] dark:bg-[#0D0E10] font-mono text-[13px] leading-[1.55]">
            <div
              key={`scan-editor-${activeFile.id}-${autoRunToken}`}
              aria-hidden="true"
              className="rl-scan-overlay"
            >
              <div className="rl-scan-raster" />
              <div className="rl-scan-beam" />
            </div>
            <div
              aria-hidden="true"
              className="py-3 px-2.5 text-right select-none text-[#8E8B82] bg-[#EAE5DA]/60 dark:bg-[#15171A] border-r border-[#C8C2B6] dark:border-[#2E3136] shrink-0"
            >
              {lineNumbers.map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>

            <textarea
              aria-label="代码编辑器"
              data-testid="code-editor"
              value={activeFile.code}
              onChange={(e) => onUpdateFile(activeFile.id, { code: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleRunCode();
                } else if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const next =
                    activeFile.code.slice(0, start) +
                    '  ' +
                    activeFile.code.slice(end);
                  onUpdateFile(activeFile.id, { code: next });
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }}
              spellCheck={false}
              className="flex-1 min-w-0 w-full h-full p-3 bg-transparent resize-none focus:outline-none text-[#1A1B1D] dark:text-[#EAE6DC] font-mono text-[13px] leading-[1.55] whitespace-pre overflow-x-auto"
            />
          </div>

          {/* AI Code Co-Pilot Bar */}
          <div className="p-2.5 bg-[#F3EFE6] dark:bg-[#15171A] border-t border-[#C8C2B6] dark:border-[#2E3136] space-y-2 shrink-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAiAssist('generate');
                  }
                }}
                placeholder="AI 编程指令：例如 '用蒙特卡洛方法计算源石扩散概率并输出曲线'..."
                className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs font-mono bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] focus:outline-none focus:border-[#E05320]"
              />
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => handleAiAssist('generate')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-semibold bg-[#E05320] text-white hover:bg-[#c84618] cursor-pointer disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>AI 生成</span>
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => handleAiAssist('fix')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-semibold border cursor-pointer disabled:opacity-50 ${
                  result && !result.ok
                    ? 'bg-[#C83232] text-white border-[#C83232]'
                    : 'bg-[#EAE5DA] dark:bg-[#1D2024] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320]'
                }`}
              >
                <Wrench className="w-3 h-3" />
                <span>AI 修复</span>
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => handleAiAssist('explain')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-semibold border bg-[#EAE5DA] dark:bg-[#1D2024] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#2A6396] cursor-pointer disabled:opacity-50"
              >
                <BookOpen className="w-3 h-3" />
                <span>解释</span>
              </button>
            </div>

            {aiNote && (
              <div className="p-2 text-xs bg-[#EAE5DA] dark:bg-[#1D2024] border-l-2 border-[#E05320] text-[#1A1B1D] dark:text-[#EAE6DC] whitespace-pre-wrap">
                {aiNote}
              </div>
            )}
          </div>
        </div>

        {/* Output Console & Telemetry Plot Pane */}
        <div
          data-testid="code-output-pane"
          className="flex flex-col min-h-[200px] bg-[#F3EFE6] dark:bg-[#15171A] overflow-y-auto p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-[#C8C2B6] dark:border-[#2E3136] pb-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              EXECUTION STDOUT // 运行控制台
            </span>
            <div className="flex items-center gap-2">
              {result && (result.stdout || result.stderr) && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(`${result.stdout}\n${result.stderr}`.trim())
                      .then(() => {
                        setCopiedOutput(true);
                        if (copyTimerRef.current !== null) {
                          window.clearTimeout(copyTimerRef.current);
                        }
                        copyTimerRef.current = window.setTimeout(() => {
                          setCopiedOutput(false);
                          copyTimerRef.current = null;
                        }, 1600);
                      })
                      .catch(() => {});
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#2A6396] cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedOutput ? '已复制' : '复制输出'}</span>
                </button>
              )}
              {result && (
                <span
                  className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold tabular-nums ${
                    result.ok
                      ? 'text-[#2B7A5B] dark:text-[#3FA67E]'
                      : 'text-[#C83232] dark:text-[#E54D4D]'
                  }`}
                >
                  {result.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {result.ok ? 'EXIT 0' : 'ERR'} · {result.durationMs} ms
                  </span>
                </span>
              )}
            </div>
          </div>

          {!result && (
            <div className="text-xs font-mono text-[#6A6862] dark:text-[#8E8B82] space-y-2 py-4">
              <p>点击「运行代码」或按下 Ctrl+Enter 执行当前脚本。</p>
              <p>
                • <strong>Eco-Bridge JS</strong> 可直接读写 Bio-Dome 04 参数（`rhine.eco`）并实时绘图（`rhine.plot`）。
              </p>
              <p>
                • <strong>Python 3 / TypeScript</strong> 优先调用服务端沙盒；在离线或 Android APK 独立运行时自动切换至包体内置 <strong>Pyodide WASM / Sucrase</strong> 本地引擎。
              </p>
            </div>
          )}

          {result?.updatedEcoParams && (
            <div className="px-2.5 py-1.5 text-[11px] font-mono font-semibold bg-[#2B7A5B]/12 border border-[#2B7A5B]/50 text-[#2B7A5B] dark:text-[#3FA67E]">
              ✓ 已同步生态舱参数: {JSON.stringify(result.updatedEcoParams)}
            </div>
          )}

          {result?.stdout && (
            <div className="relative overflow-hidden border border-[#C8C2B6] dark:border-[#2E3136] bg-[#F8F5EE] dark:bg-[#0D0E10]">
              <div
                key={`scan-stdout-${result.durationMs}-${result.stdout.length}`}
                aria-hidden="true"
                className="rl-scan-overlay"
              >
                <div className="rl-scan-raster" />
                <div className="rl-scan-beam" />
              </div>
              <pre className="relative z-10 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                {result.stdout}
              </pre>
            </div>
          )}

          {result?.stderr && (
            <pre className="p-3 bg-[#C83232]/10 border border-[#C83232] text-[#C83232] dark:text-[#E54D4D] font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
              {result.stderr}
            </pre>
          )}

          {result?.plots && result.plots.length > 0 && (
            <div className="space-y-2">
              {result.plots.map((pl, idx) => (
                <TelemetryPlotCard key={idx} series={pl} />
              ))}
            </div>
          )}

          {result?.tables &&
            result.tables.map((rows, idx) => {
              if (!rows.length) return null;
              const cols = Object.keys(rows[0]);
              return (
                <div
                  key={idx}
                  className="overflow-x-auto border border-[#C8C2B6] dark:border-[#2E3136]"
                >
                  <table className="w-full text-left font-mono text-[11px] border-collapse">
                    <thead className="bg-[#EAE5DA] dark:bg-[#1D2024]">
                      <tr>
                        {cols.map((c) => (
                          <th key={c} className="px-2 py-1.5 border-b border-[#C8C2B6] dark:border-[#2E3136]">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, rIdx) => (
                        <tr key={rIdx} className="border-b border-[#C8C2B6]/40 dark:border-[#2E3136]/40">
                          {cols.map((c) => (
                            <td key={c} className="px-2 py-1 tabular-nums">
                              {String(r[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
