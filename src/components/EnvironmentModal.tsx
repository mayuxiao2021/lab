import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Server,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import {
  DEFAULT_CLOUD_API_BASE,
  isNativeCapacitorRuntime,
  loadApiBaseUrl,
  loadPreferredModel,
  MAINSTREAM_MODEL_PRESETS,
  normalizeApiBaseUrl,
  resolveApiUrl,
  saveApiBaseUrl,
  savePreferredModel,
  saveServerlessMode,
  shouldUseLocalServerlessOnly,
} from '../logic/workspaceStorage';
import {
  BackendUnreachableError,
  diagnoseConnectionIssue,
  fetchWithTimeout,
} from '../logic/localOfflineCore';
import { usePWAInstall } from '../logic/usePWAInstall';

interface EnvStatusResponse {
  ok: boolean;
  nodeVersion: string;
  pythonVersion: string;
  javaVersion: string;
  platform: string;
  geminiConfigured: boolean;
  primaryModel: string;
  aiGateway?: {
    activeProvider: 'gemini' | 'openai';
    providers: {
      gemini: { configured: boolean; primaryModel: string };
      openai: { configured: boolean; defaultModel: string };
    };
    standardEndpoints: { method: string; path: string; format: string }[];
  };
  sandboxEngines: string[];
  androidBuild: {
    available: boolean;
    filename: string;
    downloadUrl: string;
    packageId: string;
    versionCode?: number;
    versionName: string;
    minSdk: number;
    targetSdk: number;
    sizeBytes?: number;
    sha256?: string;
    signed?: boolean;
    signatureSchemes?: string[];
    buildType?: 'release' | 'debug';
  };
}

interface EnvironmentModalProps {
  open: boolean;
  onClose: () => void;
  onResetWorkspace: () => void;
  fileCount: number;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  open,
  onClose,
  onResetWorkspace,
  fileCount,
}) => {
  const [status, setStatus] = useState<EnvStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiInput, setApiInput] = useState(() => loadApiBaseUrl());
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [serverlessOnly, setServerlessOnly] = useState(() =>
    shouldUseLocalServerlessOnly()
  );
  const [preferredModel, setPreferredModel] = useState(() =>
    loadPreferredModel()
  );
  const [copiedEnvPreset, setCopiedEnvPreset] = useState(false);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isNative = isNativeCapacitorRuntime();
  const activePreset =
    MAINSTREAM_MODEL_PRESETS.find((item) => item.id === preferredModel) ||
    MAINSTREAM_MODEL_PRESETS[0];

  const fetchDiagnostics = useCallback(
    async (overrideBase?: string, forceRemote = false) => {
      const activeServerless =
        !forceRemote &&
        (overrideBase === undefined
          ? shouldUseLocalServerlessOnly()
          : !overrideBase.trim() && shouldUseLocalServerlessOnly());
      setServerlessOnly(activeServerless);
      if (activeServerless) {
        setLoading(false);
        setErrorMsg(null);
        setPingMs(null);
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      const start = performance.now();
      const url = resolveApiUrl('/api/env/status', overrideBase);
      try {
        const resp = await fetchWithTimeout(url, undefined, 6000);
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new BackendUnreachableError(`HTTP ${resp.status}`, {
            status: resp.status,
            targetUrl: url,
          });
        }
        if (!resp.ok) {
          if (resp.status === 404 || resp.status >= 502) {
            throw new BackendUnreachableError(`HTTP ${resp.status}`, {
              status: resp.status,
              targetUrl: url,
            });
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as EnvStatusResponse;
        setStatus(data);
        setPingMs(Math.round(performance.now() - start));
      } catch (err) {
        setErrorMsg(diagnoseConnectionIssue(err, url));
        setPingMs(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open) {
      setApiInput(loadApiBaseUrl());
      setServerlessOnly(shouldUseLocalServerlessOnly());
      setPreferredModel(loadPreferredModel());
      setCopiedEnvPreset(false);
      setSaveNotice(null);
      fetchDiagnostics();
    }
  }, [open, fetchDiagnostics]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleEnableServerless = () => {
    saveServerlessMode(true);
    setServerlessOnly(true);
    setErrorMsg(null);
    setPingMs(null);
    setSaveNotice('已启用无服务器独立模式：所有计算与本地内核均直接运行于包体内，不再请求远端服务器。');
  };

  const handleSaveApiBase = () => {
    try {
      const normalized = normalizeApiBaseUrl(apiInput);
      saveApiBaseUrl(normalized);
      saveServerlessMode(false);
      setServerlessOnly(false);
      setApiInput(normalized);
      setSaveNotice(
        normalized
          ? `已切换为远程节点模式并测试连接: ${normalized}`
          : isNative
            ? `已启用远程节点测试: ${DEFAULT_CLOUD_API_BASE}`
            : '已切换为同源 Web 后端 (/api)'
      );
      fetchDiagnostics(normalized, true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const apkSizeMb = status?.androidBuild?.sizeBytes
    ? `${(status.androidBuild.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
    : '未知';

  const apkHref = resolveApiUrl(
    status?.androidBuild?.downloadUrl ?? '/api/android/download-apk'
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2.5 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="运行环境与安卓打包中心"
        data-testid="environment-modal"
        className="w-full max-w-[680px] max-h-[90vh] overflow-y-auto bg-[#F3EFE6] dark:bg-[#15171A] border-2 border-[#1A1B1D] dark:border-[#EAE6DC] shadow-[8px_8px_0_rgba(0,0,0,0.22)] text-[#1A1B1D] dark:text-[#EAE6DC]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#EAE5DA] dark:bg-[#1D2024]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#E05320]" />
            <h2 className="font-mono text-xs sm:text-sm font-bold tracking-wider uppercase">
              R.L.OS ENVIRONMENT &amp; ANDROID BUILD CENTER
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭环境中心"
            onClick={onClose}
            className="p-1 border border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 1. Android APK Packaging & Download */}
          <section className="p-3.5 bg-[#F8F5EE] dark:bg-[#111315] border border-[#1A1B1D] dark:border-[#EAE6DC]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#2B7A5B] dark:text-[#3FA67E]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                  ANDROID APK // 移动客户端打包分发
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 font-mono text-[10px] font-bold border ${
                  status?.androidBuild?.available || serverlessOnly
                    ? 'bg-[#2B7A5B]/15 text-[#2B7A5B] dark:text-[#3FA67E] border-[#2B7A5B]'
                    : 'bg-[#B47811]/15 text-[#B47811] border-[#B47811]'
                }`}
              >
                {loading
                  ? 'CHECKING...'
                  : serverlessOnly
                    ? 'SERVERLESS STANDALONE · v4.2.1'
                    : status?.androidBuild?.available
                      ? status.androidBuild.signed
                        ? `RELEASE SIGNED · v${status.androidBuild.versionName}`
                        : 'APK READY'
                      : isNative
                        ? 'ANDROID LOCAL RUNTIME'
                        : 'CAPACITOR PROJECT'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 font-mono text-[11px]">
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">PACKAGE ID</div>
                <div className="font-bold truncate">
                  {status?.androidBuild?.packageId ?? 'com.rhinelab.rlos'}
                </div>
              </div>
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">SIGNING SCHEME</div>
                <div className="font-bold truncate">
                  {status?.androidBuild?.signatureSchemes?.length
                    ? status.androidBuild.signatureSchemes.join(' + ')
                    : status?.androidBuild?.signed
                      ? 'PKCS12 Release'
                      : 'Android SDK 36'}
                </div>
              </div>
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">MIN / TARGET SDK</div>
                <div className="font-bold">
                  API {status?.androidBuild?.minSdk ?? 24} → {status?.androidBuild?.targetSdk ?? 36}
                </div>
              </div>
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">APK SIZE</div>
                <div className="font-bold tabular-nums">{apkSizeMb}</div>
              </div>
            </div>

            {status?.androidBuild?.sha256 && (
              <div className="mb-3 px-2.5 py-1.5 bg-[#EAE5DA] dark:bg-[#1D2024] font-mono text-[10px] text-[#6A6862] dark:text-[#8E8B82] break-all">
                SHA-256: {status.androidBuild.sha256}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {status?.androidBuild?.available ? (
                <a
                  href={apkHref}
                  download="rhine-lab-rlos.apk"
                  data-testid="download-apk-link"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#E05320] hover:bg-[#C94517] text-white font-mono text-xs font-bold border border-[#1A1B1D] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 Android APK ({apkSizeMb})</span>
                </a>
              ) : (
                <span className="font-mono text-xs text-[#6A6862]">
                  工程已配置 Capacitor Android（`android/`），执行构建后即可直接下载 APK。
                </span>
              )}

              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#2A6396] hover:bg-[#1f4d75] text-white font-mono text-xs font-bold border border-[#1A1B1D] cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>安装为独立 App (PWA)</span>
                </button>
              )}

              {isIOS && !isInstalled && (
                <button
                  type="button"
                  onClick={() => setShowIOSGuide((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#EAE5DA] dark:bg-[#1D2024] font-mono text-xs font-semibold border border-[#1A1B1D] dark:border-[#EAE6DC] cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>iOS 安装指引</span>
                </button>
              )}

              {isInstalled && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 font-mono text-[11px] font-semibold bg-[#2B7A5B]/15 text-[#2B7A5B] dark:text-[#3FA67E] border border-[#2B7A5B]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>当前已运行于独立应用模式</span>
                </span>
              )}
            </div>

            {showIOSGuide && (
              <div className="mt-2.5 p-2.5 text-xs font-mono bg-[#EAE5DA] dark:bg-[#1D2024] border border-[#C8C2B6] dark:border-[#2E3136]">
                1. 点击 Safari 底部或顶部的「分享」按钮；2. 下滑选择「添加到主屏幕」即可离线/全屏运行。
              </div>
            )}
          </section>

          {/* 2. Runtime Environment Matrix */}
          <section className="p-3.5 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#2A6396] dark:text-[#4E8EC7]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                  RUNTIME ENVIRONMENT // 沙盒与工作区状态
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fetchDiagnostics()}
                disabled={loading}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold border border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320] cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                <span>刷新检测</span>
              </button>
            </div>

            {errorMsg && (
              <div className="mb-2.5 p-2 text-xs font-mono bg-[#C83232]/10 border border-[#C83232] text-[#C83232]">
                [DIAGNOSTIC ERROR] {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">JS / TYPESCRIPT RUNTIME</div>
                <div className="font-bold">
                  {serverlessOnly
                    ? 'Eco-Bridge JS + Sucrase TS (包内就绪)'
                    : `${status?.nodeVersion ?? '检测中...'} (${status?.platform ?? '...'})`}
                </div>
              </div>
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">PYTHON SANDBOX</div>
                <div className="font-bold">
                  {serverlessOnly
                    ? 'Pyodide Python 3 WASM (包内离线就绪)'
                    : status?.pythonVersion ?? '检测中...'}
                </div>
              </div>
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">EXECUTION ARCHITECTURE</div>
                <div className="font-bold truncate">
                  {serverlessOnly
                    ? '无服务器独立运行 (Zero-Server)'
                    : status?.javaVersion ?? '检测中...'}
                </div>
              </div>
              <div className="p-2 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
                <div className="text-[9.5px] text-[#6A6862]">NEURAL CORE</div>
                <div className="font-bold flex items-center gap-1.5">
                  <span>
                    {serverlessOnly
                      ? 'R.L.OS Local Neural Core'
                      : status?.primaryModel ?? 'gemini-4-hydrogen'}
                  </span>
                  {pingMs !== null && !serverlessOnly && (
                    <span className="text-[#2B7A5B] dark:text-[#3FA67E]">
                      ({pingMs} ms)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-[#C8C2B6] dark:border-[#2E3136] space-y-2">
              <div className="flex items-center justify-between text-[10.5px] font-mono">
                <span className="font-bold text-[#6A6862] dark:text-[#8E8B82] uppercase">
                  STANDARD AI BACKEND INTERFACES (PROVIDER:{' '}
                  {status?.aiGateway?.activeProvider?.toUpperCase() ?? 'GEMINI'})
                </span>
                <span className="text-[#2B7A5B] dark:text-[#3FA67E] font-semibold">
                  OpenAI + REST Ready
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px]">
                {(
                  status?.aiGateway?.standardEndpoints ?? [
                    { method: 'POST', path: '/v1/chat/completions', format: 'OpenAI Chat' },
                    { method: 'GET', path: '/v1/models', format: 'Models List' },
                    { method: 'POST', path: '/api/v1/ai/generate', format: 'REST Generate' },
                    { method: 'POST', path: '/api/v1/ai/stream', format: 'REST SSE Stream' },
                    { method: 'POST', path: '/api/v1/ai/embeddings', format: 'Embeddings' },
                    { method: 'GET', path: '/api/v1/ai/providers', format: 'Provider Catalog' },
                  ]
                ).map((ep) => (
                  <div
                    key={ep.path}
                    title={`${ep.method} ${ep.path} — ${ep.format}`}
                    className="min-w-0 overflow-hidden px-2 py-1.5 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136] flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate font-semibold text-[#1A1B1D] dark:text-[#EAE6DC]">
                      <span className="text-[#E05320] mr-1">{ep.method}</span>
                      {ep.path}
                    </span>
                    <span className="text-[9.5px] text-[#6A6862] truncate max-w-[44%] shrink-0">
                      {ep.format}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-[#C8C2B6] dark:border-[#2E3136] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-[#6A6862] dark:text-[#8E8B82]">
                <HardDrive className="w-3.5 h-3.5 text-[#2B7A5B]" />
                <span>本地持久化工作区：已缓存 {fileCount} 个代码脚本与生态舱参数</span>
              </div>
              <button
                type="button"
                onClick={onResetWorkspace}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#C83232] hover:text-[#C83232] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>重置默认模板</span>
              </button>
            </div>
          </section>

          {/* 3. Cloud / Android Backend Endpoint Routing */}
          <section className="p-3.5 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#E05320]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                  SERVERLESS MODE &amp; API GATEWAY // 运行模式切换
                </h3>
              </div>
              <span className="flex items-center gap-1 font-mono text-[10px] text-[#6A6862]">
                <Wifi className="w-3 h-3" />
                <span>
                  {serverlessOnly
                    ? 'SERVERLESS STANDALONE'
                    : isNative
                      ? 'ANDROID + REMOTE'
                      : 'WEB WORKSTATION'}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-2.5 font-mono text-[11px]">
              <button
                type="button"
                data-testid="toggle-serverless-btn"
                onClick={handleEnableServerless}
                className={`px-2.5 py-1.5 font-bold border cursor-pointer ${
                  serverlessOnly
                    ? 'bg-[#2B7A5B] text-white border-[#1A1B1D]'
                    : 'bg-[#EAE5DA] dark:bg-[#1D2024] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#2B7A5B]'
                }`}
              >
                {serverlessOnly ? '✓ 当前：无服务器纯本地模式' : '切换为无服务器纯本地模式'}
              </button>
              <button
                type="button"
                data-testid="toggle-remote-btn"
                onClick={() => {
                  saveServerlessMode(false);
                  setServerlessOnly(false);
                  fetchDiagnostics(apiInput, true);
                }}
                className={`px-2.5 py-1.5 font-semibold border cursor-pointer ${
                  !serverlessOnly
                    ? 'bg-[#1A1B1D] text-[#F3EFE6] dark:bg-[#EAE6DC] dark:text-[#111315] border-[#1A1B1D]'
                    : 'bg-[#EAE5DA] dark:bg-[#1D2024] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320]'
                }`}
              >
                {!serverlessOnly ? '✓ 当前：远程 / 本地服务端节点' : '启用远程后端节点 (可选)'}
              </button>
            </div>

            <p className="text-[11px] font-mono text-[#6A6862] dark:text-[#8E8B82] mb-2">
              {serverlessOnly
                ? '已开启无服务器纯本地运行：Python 3 (Pyodide WASM)、TypeScript (Sucrase)、Eco-Bridge JS、Bio-Dome 04 与本地智能内核均 100% 在包体内执行，不发送任何网络请求。'
                : '远程模式下可通过服务端 .env 安全接入 Gemini / OpenAI / DeepSeek / 通义千问 / OpenRouter / Ollama（密钥仅保存于服务端 .env，不进入 APK 或前端界面）。'}
            </p>

            {/* Mainstream Model Routing & Server .env Preset Selector (No client-side API key inputs) */}
            <div className="mb-3 p-2.5 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#1A1B1D] dark:text-[#EAE6DC]">
                  MODEL ROUTER &amp; SERVER .ENV PRESET // 主流模型路由与服务端配置预设
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#EAE5DA] dark:bg-[#1D2024] border border-[#C8C2B6] dark:border-[#2E3136] text-[#E05320]">
                  {activePreset.vendor} · {activePreset.provider.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-2">
                <select
                  aria-label="选择目标主流模型路由"
                  data-testid="preferred-model-select"
                  value={preferredModel}
                  onChange={(e) => {
                    const nextModel = e.target.value;
                    setPreferredModel(nextModel);
                    savePreferredModel(nextModel);
                    setCopiedEnvPreset(false);
                    setSaveNotice(`已切换默认模型路由: ${nextModel}`);
                  }}
                  className="flex-1 min-w-[220px] px-2.5 py-1.5 text-xs font-mono bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] focus:outline-none focus:border-[#E05320]"
                >
                  {MAINSTREAM_MODEL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label} [{preset.id}]
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="copy-env-preset-btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activePreset.envSnippet);
                      setCopiedEnvPreset(true);
                      setSaveNotice(`已复制 ${activePreset.label} 服务端 .env 模板`);
                    } catch {
                      setSaveNotice('请直接复制下方服务端 .env 配置片段');
                    }
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-mono font-bold border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#E05320] cursor-pointer"
                >
                  {copiedEnvPreset ? '✓ 已复制 .env 模板' : '复制服务端 .env 模板'}
                </button>
              </div>

              <pre className="p-2 text-[10px] font-mono leading-relaxed bg-[#EAE5DA]/60 dark:bg-[#0D0E10] border border-[#D8D3C8] dark:border-[#24272B] overflow-x-auto text-[#4E4C47] dark:text-[#A3A098]">
                {activePreset.envSnippet}
              </pre>
              <div className="mt-1.5 text-[10px] font-mono text-[#6A6862] dark:text-[#8E8B82]">
                安全架构约束：遵循零客户端密钥泄露原则，前端与 APK 包体不提供明文 API Key 输入框或本地密钥存储；所有密钥统一保存在服务端 <span className="text-[#1A1B1D] dark:text-[#EAE6DC]">.env</span> 并通过 <span className="text-[#1A1B1D] dark:text-[#EAE6DC]">/api/*</span> 代理网关转发。
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-2 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => {
                  const preset = 'http://127.0.0.1:3000';
                  saveApiBaseUrl(preset);
                  saveServerlessMode(false);
                  setServerlessOnly(false);
                  setApiInput(preset);
                  setSaveNotice(`已切换至 USB ADB 转发地址: ${preset}`);
                  fetchDiagnostics(preset, true);
                }}
                className="px-2 py-1 border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#E05320] cursor-pointer"
              >
                USB ADB (127.0.0.1:3000)
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = 'http://10.0.2.2:3000';
                  saveApiBaseUrl(preset);
                  saveServerlessMode(false);
                  setServerlessOnly(false);
                  setApiInput(preset);
                  setSaveNotice(`已切换至 Android 模拟器宿主机: ${preset}`);
                  fetchDiagnostics(preset, true);
                }}
                className="px-2 py-1 border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#E05320] cursor-pointer"
              >
                模拟器宿主机 (10.0.2.2:3000)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={apiInput}
                onChange={(e) => setApiInput(e.target.value)}
                placeholder={
                  isNative
                    ? 'http://192.168.1.x:3000 或 https://your-server.run.app'
                    : '留空使用同源后端，或输入 http://192.168.x.x:3000'
                }
                className="flex-1 min-w-[220px] px-2.5 py-1.5 text-xs font-mono bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136] focus:outline-none focus:border-[#E05320]"
              />
              <button
                type="button"
                onClick={handleSaveApiBase}
                className="px-3 py-1.5 text-xs font-mono font-bold bg-[#1A1B1D] dark:bg-[#EAE6DC] text-[#F3EFE6] dark:text-[#111315] hover:bg-[#E05320] hover:text-white cursor-pointer"
              >
                应用并测试
              </button>
              {apiInput && (
                <button
                  type="button"
                  onClick={() => {
                    setApiInput('');
                    saveApiBaseUrl('');
                    setSaveNotice('已清除自定义后端地址');
                    fetchDiagnostics('');
                  }}
                  className="px-2.5 py-1.5 text-xs font-mono border border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320] cursor-pointer"
                >
                  重置
                </button>
              )}
            </div>

            {saveNotice && (
              <div className="mt-2 text-[11px] font-mono text-[#2B7A5B] dark:text-[#3FA67E]">
                ✓ {saveNotice}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
