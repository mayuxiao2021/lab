import { clampEcoParam, type EcoParams } from './ecoSimulation';
import type { WorkspaceView } from './terminalEngine';

export interface StoredCodeFile {
  id: string;
  filename: string;
  language: 'python' | 'typescript' | 'javascript';
  code: string;
}

export const DEFAULT_CLOUD_API_BASE =
  'https://ais-pre-eqkgbjqxg5bugcs2oppqhi-1003252282964.asia-east1.run.app';

export const STORAGE_KEYS = {
  codeFiles: 'rhine_workspace_code_files_v1',
  activeCodeFileId: 'rhine_workspace_active_file_v1',
  ecoParams: 'rhine_workspace_eco_params_v1',
  theme: 'rhine_workspace_theme_v1',
  apiBaseUrl: 'rhine_workspace_api_base_v1',
  activeView: 'rhine_workspace_active_view_v1',
  serverlessMode: 'rhine_workspace_serverless_v1',
  preferredModel: 'rhine_workspace_preferred_model_v1',
} as const;

export interface MainstreamModelPreset {
  id: string;
  label: string;
  vendor: string;
  provider: 'gemini' | 'openai';
  envSnippet: string;
}

export const MAINSTREAM_MODEL_PRESETS: MainstreamModelPreset[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (通用标准任务)',
    vendor: 'Google Gemini',
    provider: 'gemini',
    envSnippet: 'AI_PROVIDER="gemini"\nGEMINI_MODEL="gemini-4-hydrogen"\nGEMINI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite (极速响应任务)',
    vendor: 'Google Gemini',
    provider: 'gemini',
    envSnippet: 'AI_PROVIDER="gemini"\nGEMINI_MODEL="gemini-3.1-flash-lite"\nGEMINI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon (复杂交互与科学计算)',
    vendor: 'Google Gemini',
    provider: 'gemini',
    envSnippet: 'AI_PROVIDER="gemini"\nGEMINI_MODEL="gemini-4-argon"\nGEMINI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon (深度推理与架构审计)',
    vendor: 'Google Gemini',
    provider: 'gemini',
    envSnippet: 'AI_PROVIDER="gemini"\nGEMINI_MODEL="gemini-4-carbon"\nGEMINI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'openai:deepseek-chat',
    label: 'DeepSeek-V3 / Chat',
    vendor: 'DeepSeek',
    provider: 'openai',
    envSnippet:
      'AI_PROVIDER="openai"\nOPENAI_BASE_URL="https://api.deepseek.com/v1"\nOPENAI_MODEL="deepseek-chat"\nOPENAI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'openai:gpt-4o-mini',
    label: 'GPT-4o mini',
    vendor: 'OpenAI',
    provider: 'openai',
    envSnippet:
      'AI_PROVIDER="openai"\nOPENAI_BASE_URL="https://api.openai.com/v1"\nOPENAI_MODEL="gpt-4o-mini"\nOPENAI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'openai:qwen-plus',
    label: '通义千问 Qwen-Plus',
    vendor: 'Alibaba DashScope',
    provider: 'openai',
    envSnippet:
      'AI_PROVIDER="openai"\nOPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"\nOPENAI_MODEL="qwen-plus"\nOPENAI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'openai:anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4 (OpenRouter)',
    vendor: 'Anthropic / OpenRouter',
    provider: 'openai',
    envSnippet:
      'AI_PROVIDER="openai"\nOPENAI_BASE_URL="https://openrouter.ai/api/v1"\nOPENAI_MODEL="anthropic/claude-sonnet-4"\nOPENAI_API_KEY="<在服务端环境变量配置>"',
  },
  {
    id: 'openai:qwen2.5-coder:14b',
    label: 'Ollama Qwen2.5-Coder 14B (本地网关)',
    vendor: 'Ollama Local',
    provider: 'openai',
    envSnippet:
      'AI_PROVIDER="openai"\nOPENAI_BASE_URL="http://127.0.0.1:11434/v1"\nOPENAI_MODEL="qwen2.5-coder:14b"\nOPENAI_API_KEY="ollama"',
  },
];

export type GeminiTaskTier = 'fast' | 'standard' | 'interactive' | 'deep';

export function resolveGeminiModelByTaskTier(
  tier: GeminiTaskTier,
  preferredModel?: string
): string {
  if (preferredModel && preferredModel.startsWith('openai:')) {
    return preferredModel;
  }
  switch (tier) {
    case 'fast':
      return 'gemini-3.1-flash-lite';
    case 'interactive':
      return 'gemini-4-argon';
    case 'deep':
      return 'gemini-4-carbon';
    case 'standard':
    default:
      return preferredModel || 'gemini-4-hydrogen';
  }
}

export function isNativeCapacitorRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function') {
    try {
      return Boolean(cap.isNativePlatform());
    } catch {
      return false;
    }
  }
  return window.location.protocol === 'capacitor:';
}

export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) {
    throw new Error('后端地址必须以 http:// 或 https:// 开头');
  }
  return trimmed;
}

export function resolveApiUrl(path: string, configuredBase?: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const explicit = (configuredBase ?? loadApiBaseUrl()).trim().replace(/\/+$/, '');
  if (explicit) {
    return `${explicit}${cleanPath}`;
  }
  if (isNativeCapacitorRuntime()) {
    return `${DEFAULT_CLOUD_API_BASE}${cleanPath}`;
  }
  return cleanPath;
}

export function loadApiBaseUrl(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEYS.apiBaseUrl) ?? '';
  } catch {
    return '';
  }
}

export function saveApiBaseUrl(baseUrl: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const cleaned = baseUrl.trim().replace(/\/+$/, '');
    if (!cleaned) {
      localStorage.removeItem(STORAGE_KEYS.apiBaseUrl);
    } else {
      localStorage.setItem(STORAGE_KEYS.apiBaseUrl, cleaned);
    }
  } catch {
    // Ignore storage quota / restricted context
  }
}

export function loadServerlessMode(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEYS.serverlessMode);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function saveServerlessMode(enabled: boolean | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled === null) {
      localStorage.removeItem(STORAGE_KEYS.serverlessMode);
    } else {
      localStorage.setItem(STORAGE_KEYS.serverlessMode, enabled ? 'true' : 'false');
    }
  } catch {
    // Ignore storage quota / restricted context
  }
}

/**
 * Returns true when the app should run 100% locally in-package without making any backend /api fetch calls.
 * Defaults to true inside standalone Android APK / file:// builds unless user explicitly enables a remote server.
 */
export function shouldUseLocalServerlessOnly(): boolean {
  const pref = loadServerlessMode();
  if (pref !== null) return pref;
  if (loadApiBaseUrl().trim()) return false;
  if (isNativeCapacitorRuntime()) return true;
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return true;
  }
  return false;
}

export function loadPreferredModel(): string {
  try {
    if (typeof localStorage === 'undefined') return 'gemini-4-hydrogen';
    return localStorage.getItem(STORAGE_KEYS.preferredModel) || 'gemini-4-hydrogen';
  } catch {
    return 'gemini-4-hydrogen';
  }
}

export function savePreferredModel(modelId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const cleaned = modelId.trim();
    if (!cleaned) {
      localStorage.removeItem(STORAGE_KEYS.preferredModel);
    } else {
      localStorage.setItem(STORAGE_KEYS.preferredModel, cleaned);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadStoredCodeFiles(
  fallback: StoredCodeFile[]
): StoredCodeFile[] {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(STORAGE_KEYS.codeFiles);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    const valid = parsed.filter(
      (item): item is StoredCodeFile =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as StoredCodeFile).id === 'string' &&
        typeof (item as StoredCodeFile).filename === 'string' &&
        typeof (item as StoredCodeFile).code === 'string' &&
        ((item as StoredCodeFile).language === 'python' ||
          (item as StoredCodeFile).language === 'typescript' ||
          (item as StoredCodeFile).language === 'javascript')
    );
    return valid.length > 0 ? valid : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredCodeFiles(files: StoredCodeFile[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.codeFiles, JSON.stringify(files));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadStoredActiveFileId(fallback: string): string {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    return localStorage.getItem(STORAGE_KEYS.activeCodeFileId) || fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredActiveFileId(id: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.activeCodeFileId, id);
  } catch {
    // Ignore
  }
}

export function loadStoredEcoParams(fallback: EcoParams): EcoParams {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(STORAGE_KEYS.ecoParams);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EcoParams>;
    return {
      cohesion:
        typeof parsed.cohesion === 'number' && Number.isFinite(parsed.cohesion)
          ? clampEcoParam('cohesion', parsed.cohesion)
          : fallback.cohesion,
      originium:
        typeof parsed.originium === 'number' && Number.isFinite(parsed.originium)
          ? clampEcoParam('originium', parsed.originium)
          : fallback.originium,
      temp:
        typeof parsed.temp === 'number' && Number.isFinite(parsed.temp)
          ? clampEcoParam('temp', parsed.temp)
          : fallback.temp,
      light:
        typeof parsed.light === 'number' && Number.isFinite(parsed.light)
          ? clampEcoParam('light', parsed.light)
          : fallback.light,
      ph:
        typeof parsed.ph === 'number' && Number.isFinite(parsed.ph)
          ? clampEcoParam('ph', parsed.ph)
          : fallback.ph,
      simSpeed:
        typeof parsed.simSpeed === 'number' && Number.isFinite(parsed.simSpeed)
          ? clampEcoParam('simSpeed', parsed.simSpeed)
          : fallback.simSpeed,
    };
  } catch {
    return fallback;
  }
}

export function saveStoredEcoParams(params: EcoParams): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ecoParams, JSON.stringify(params));
  } catch {
    // Ignore
  }
}

export function loadStoredTheme(): 'light' | 'dark' {
  try {
    if (typeof localStorage === 'undefined') return 'light';
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    return raw === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveStoredTheme(theme: 'light' | 'dark'): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch {
    // Ignore
  }
}

export function loadStoredActiveView(): WorkspaceView {
  try {
    if (typeof localStorage === 'undefined') return 'terminal';
    const raw = localStorage.getItem(STORAGE_KEYS.activeView);
    if (raw === 'terminal' || raw === 'comms' || raw === 'code' || raw === 'eco') {
      return raw;
    }
    return 'terminal';
  } catch {
    return 'terminal';
  }
}

export function saveStoredActiveView(view: WorkspaceView): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.activeView, view);
  } catch {
    // Ignore
  }
}
