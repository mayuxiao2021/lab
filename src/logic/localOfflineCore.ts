import { RHINE_DIRECTORS, RHINE_SECTIONS } from '../data/rhineLore';
import { CODE_TEMPLATES, type CodeLanguage } from './codeTemplates';
import { clampEcoParam, type EcoParams } from './ecoSimulation';
import {
  generateLocalFreeChatResponse,
  synthesizeOfflineAlgorithm,
  type ChatTurnInput,
} from './localChatEngine';
import type { TerminalCodeBlock } from './terminalEngine';

export class BackendUnreachableError extends Error {
  readonly status?: number;
  readonly targetUrl?: string;

  constructor(message: string, opts?: { status?: number; targetUrl?: string }) {
    super(message);
    this.name = 'BackendUnreachableError';
    this.status = opts?.status;
    this.targetUrl = opts?.targetUrl;
  }
}

export function isBackendUnreachableError(err: unknown): boolean {
  if (err instanceof BackendUnreachableError) return true;
  if (!(err instanceof Error)) return false;
  const msg = `${err.name} ${err.message}`.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('cors') ||
    msg.includes('unreachable')
  );
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BackendUnreachableError(`连接后端节点超时 (${url})`, {
        targetUrl: url,
      });
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function diagnoseConnectionIssue(err: unknown, url?: string): string {
  if (err instanceof BackendUnreachableError && err.status === 404) {
    return `远端节点返回 HTTP 404（${url ?? '云端默认地址'} 尚未公开部署，或未映射 /api 接口）。请在下方配置可访问的局域网服务器地址（如 http://192.168.x.x:3000）或 ADB 转发（http://127.0.0.1:3000）。`;
  }
  if (err instanceof BackendUnreachableError) {
    return err.message;
  }
  if (isBackendUnreachableError(err)) {
    return `无法连接至后端节点${url ? ` (${url})` : ''}：可能原因包括云端预览需要浏览器鉴权、目标服务未启动，或手机与电脑未处于同一局域网。当前已自动启用 Android 本地离线路线（Python 3 Pyodide WASM / TypeScript / Eco-Bridge JS 与本地自由对话核心均可完全离线运行）。`;
  }
  return err instanceof Error ? err.message : String(err);
}

export interface OfflineTerminalAction {
  type: 'set_eco_params' | 'inspect_section' | 'load_code' | 'trigger_scan';
  label: string;
  data?: Record<string, unknown>;
}

export interface OfflineTerminalResult {
  reply: string;
  speakerId: string;
  speakerName: string;
  speakerCode: string;
  toolActions: OfflineTerminalAction[];
  codeBlocks: TerminalCodeBlock[];
}

export function runOfflineTerminalAi(params: {
  prompt: string;
  directorId: string;
  activeSectionShort: string;
  ecoParams: EcoParams;
  history?: ChatTurnInput[];
}): OfflineTerminalResult {
  const director =
    RHINE_DIRECTORS.find((d) => d.id === params.directorId) ?? RHINE_DIRECTORS[0];
  const section =
    RHINE_SECTIONS.find((s) => s.short === params.activeSectionShort) ??
    RHINE_SECTIONS[0];
  const lower = params.prompt.toLowerCase();
  const toolActions: OfflineTerminalAction[] = [];
  const codeBlocks: TerminalCodeBlock[] = [];

  // Detect explicit eco-chamber parameter tuning intent
  if (
    /调节|调优|优化|设置|修改|切换.*(?:生态|eco|bio-?dome|温度|凝结|凝聚|源石|光照|酸碱|ph|过载|低温)|(?:生态|eco|bio-?dome).*(?:调优|优化|过载|低温|稳定)/.test(
      lower
    )
  ) {
    const patch: Partial<EcoParams> = {};
    if (/过载|危险|测试|极限/.test(lower)) {
      patch.originium = 3.6;
      patch.cohesion = 46;
      patch.temp = 35.5;
    } else if (/低温|冷却|结晶|frost/.test(lower)) {
      patch.temp = 6.0;
      patch.cohesion = 72;
    } else {
      patch.cohesion = clampEcoParam('cohesion', 90);
      patch.originium = clampEcoParam('originium', 0.24);
      patch.temp = clampEcoParam('temp', 22.0);
      patch.light = clampEcoParam('light', 7400);
      patch.ph = clampEcoParam('ph', 7.1);
    }
    toolActions.push({
      type: 'set_eco_params',
      label: `已通过本地内核调节 Bio-Dome 04 (${Object.entries(patch)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')})`,
      data: patch,
    });
  }

  // Detect scan intent
  if (/启动扫描|脉冲扫描|scan|通量扫描/.test(lower)) {
    toolActions.push({
      type: 'trigger_scan',
      label: '已通过本地遥测总线启动 Arc-01 脉冲扫描',
    });
  }

  // Detect section lookup intent
  const matchedSection = RHINE_SECTIONS.find(
    (s) =>
      lower.includes(s.short.toLowerCase()) ||
      params.prompt.includes(s.name)
  );
  if (matchedSection && matchedSection.short !== section.short) {
    toolActions.push({
      type: 'inspect_section',
      label: `已切换焦点科室至 ${matchedSection.name} (${matchedSection.short})`,
      data: { sectionShort: matchedSection.short },
    });
  }

  // Detect code generation intent across JS / TS / Python (including 12+ extended algorithms)
  const customAlgo = synthesizeOfflineAlgorithm(params.prompt);
  if (customAlgo) {
    codeBlocks.push({
      language: customAlgo.language,
      title: customAlgo.filename,
      code: customAlgo.code,
    });
    toolActions.push({
      type: 'load_code',
      label: `已通过本地内核生成「${customAlgo.filename}」`,
      data: {
        language: customAlgo.language,
        title: customAlgo.filename,
        code: customAlgo.code,
      },
    });
  } else if (/代码|脚本|code|python|typescript|ts|js|算法|模拟|傅里叶|fft|蒙特卡洛|monte/.test(lower)) {
    const wantsPy = lower.includes('python') || lower.includes('蒙特卡洛') || lower.includes('轨道');
    const wantsTs = !wantsPy && (lower.includes('ts') || lower.includes('typescript') || lower.includes('fft'));
    const lang: CodeLanguage = wantsPy ? 'python' : wantsTs ? 'typescript' : 'javascript';

    if (/蒙特卡洛|monte/.test(lower) && lang === 'python') {
      const mcCode = buildMonteCarloScript('python');
      codeBlocks.push({
        language: 'python',
        title: 'originium_monte_carlo.py',
        code: mcCode,
      });
      toolActions.push({
        type: 'load_code',
        label: '已通过本地内核生成「originium_monte_carlo.py」',
        data: { language: 'python', title: 'originium_monte_carlo.py', code: mcCode },
      });
    } else {
      const tpl =
        lang === 'python'
          ? /轨道|孤星|h\.?a\.?m\.?h\.?r\.?r/.test(lower)
            ? CODE_TEMPLATES.find((t) => t.id === 'hamhrr-ascent') ?? CODE_TEMPLATES[1]
            : CODE_TEMPLATES.find((t) => t.language === 'python') ?? CODE_TEMPLATES[1]
          : lang === 'typescript'
            ? CODE_TEMPLATES.find((t) => t.language === 'typescript') ?? CODE_TEMPLATES[2]
            : CODE_TEMPLATES[0];
      codeBlocks.push({
        language: tpl.language,
        title: tpl.filename,
        code: tpl.code,
      });
      toolActions.push({
        type: 'load_code',
        label: `已生成本地可执行模板「${tpl.filename}」`,
        data: { language: tpl.language, title: tpl.filename, code: tpl.code },
      });
    }
  }

  // Generate conversational response via localChatEngine
  const chatResult = generateLocalFreeChatResponse({
    directorId: director.id,
    userMessage: params.prompt,
    history: params.history,
    ecoParams: params.ecoParams,
    includeEcoTelemetry: toolActions.some((a) => a.type === 'set_eco_params'),
  });

  // Strip fenced code from terminal text if already attached as interactive TerminalCodeBlockCard
  const cleanChatReply =
    codeBlocks.length > 0
      ? chatResult.reply.replace(/```[\s\S]*?```/g, '').trim()
      : chatResult.reply;

  const reply = [
    `[LOCAL NEURAL CORE // ${director.sectionCode} · 本地自由对话与科学计算核心]`,
    cleanChatReply,
    toolActions.length > 0
      ? `已同步执行本地动作：\n${toolActions.map((a) => `• ${a.label}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    reply,
    speakerId: director.id,
    speakerName: director.name,
    speakerCode: director.sectionCode,
    toolActions,
    codeBlocks,
  };
}

function buildMonteCarloScript(language: CodeLanguage): string {
  if (language === 'python') {
    return `import json
import random

# 莱茵生命源石微粒扩散蒙特卡洛概率模拟 (Serverless Pyodide WASM)
random.seed(42)
trials = 1200
grid_counts = []

for step in range(1, 13):
    threshold = 0.25 + step * 0.04
    breach = sum(1 for _ in range(trials) if random.gauss(0.45, 0.14) > threshold)
    pct = round((breach / trials) * 100.0, 2)
    grid_counts.append({"step": step, "threshold": round(threshold, 2), "risk_pct": pct})
    print(f"阈值 {threshold:.2f} g/L -> 越界风险 {pct:>5.2f}%")

print("__RHINE_PLOT__:" + json.dumps({
    "title": "源石微粒扩散蒙特卡洛风险曲线 (%)",
    "points": [{"x": r["threshold"], "y": r["risk_pct"]} for r in grid_counts]
}))
`;
  }
  if (language === 'typescript') {
    return `interface MonteCarloBin {
  threshold: number;
  riskPct: number;
}

const trials = 1200;
const bins: MonteCarloBin[] = [];
for (let step = 1; step <= 12; step++) {
  const threshold = Number((0.25 + step * 0.04).toFixed(2));
  let breach = 0;
  for (let i = 0; i < trials; i++) {
    const sample = (Math.random() + Math.random() + Math.random()) / 3;
    if (sample > threshold) breach++;
  }
  bins.push({ threshold, riskPct: Number(((breach / trials) * 100).toFixed(2)) });
}

console.table(bins);
console.log("__RHINE_PLOT__:" + JSON.stringify({
  title: "源石蒙特卡洛渗透率 (%)",
  points: bins.map((b) => ({ x: b.threshold, y: b.riskPct }))
}));
`;
  }
  return `const bins = [];
for (let step = 1; step <= 12; step++) {
  const threshold = Number((0.25 + step * 0.04).toFixed(2));
  let breach = 0;
  for (let i = 0; i < 800; i++) {
    const s = (Math.random() + Math.random()) / 2;
    if (s > threshold) breach++;
  }
  bins.push({ threshold, riskPct: Number(((breach / 800) * 100).toFixed(2)) });
}
rhine.table(bins);
rhine.plot("Eco-Bridge 蒙特卡洛风险分布 (%)", bins.map((b) => ({ x: b.threshold, y: b.riskPct })));
console.log("✓ 本地蒙特卡洛采样完成。");
`;
}

export function generateOfflineDirectorReply(params: {
  directorId: string;
  userMessage: string;
  history?: ChatTurnInput[];
  ecoParams: EcoParams;
  activeCode?: { filename: string; language: string; code: string };
  councilContext?: string;
  includeEcoTelemetry?: boolean;
}): string {
  const result = generateLocalFreeChatResponse({
    directorId: params.directorId,
    userMessage: params.userMessage,
    history: params.history,
    ecoParams: params.ecoParams,
    activeCode: params.activeCode,
    councilContext: params.councilContext,
    includeEcoTelemetry: params.includeEcoTelemetry,
  });
  return result.reply;
}

export function runOfflineCodeAssist(params: {
  mode: 'generate' | 'fix' | 'explain' | 'optimize';
  language: CodeLanguage;
  code: string;
  errorOutput?: string;
  prompt?: string;
}): { explanation: string; code?: string } {
  const lowerPrompt = (params.prompt ?? '').toLowerCase();

  if (params.mode === 'generate') {
    if (/蒙特卡洛|monte/.test(lowerPrompt)) {
      return {
        explanation: `[SERVERLESS 内核] 已根据指令在本地为你生成 ${params.language.toUpperCase()} 蒙特卡洛扩散仿真脚本，可直接点击「运行代码」执行并绘图。`,
        code: buildMonteCarloScript(params.language),
      };
    }
    if (params.language === 'python' && /轨道|孤星|h\.?a\.?m\.?h\.?r\.?r/.test(lowerPrompt)) {
      const orbitTpl = CODE_TEMPLATES.find((t) => t.id === 'hamhrr-ascent') ?? CODE_TEMPLATES[1];
      return {
        explanation: `[SERVERLESS 内核] 已在本地生成「${orbitTpl.title}」Pyodide WASM 可执行脚本。`,
        code: orbitTpl.code,
      };
    }
    const matched =
      CODE_TEMPLATES.find((t) => t.language === params.language) ?? CODE_TEMPLATES[0];
    return {
      explanation: `[SERVERLESS 内核] 已为你载入与 ${params.language.toUpperCase()} 匹配的莱茵科学计算标准模板「${matched.title}」。`,
      code: matched.code,
    };
  }

  if (params.mode === 'explain') {
    const lines = params.code.split('\n').length;
    const hasPlot = /plot|__RHINE_PLOT__/.test(params.code);
    const symbols = Array.from(
      params.code.matchAll(/(?:def|function|class|interface)\s+([A-Za-z0-9_]+)/g)
    )
      .map((m) => m[1])
      .slice(0, 6);
    const symbolInfo =
      symbols.length > 0 ? `识别到核心符号：${symbols.join(', ')}。` : '';
    return {
      explanation: `[SERVERLESS 静态剖析] 当前脚本共 ${lines} 行（语言: ${params.language}）。${symbolInfo}${
        hasPlot
          ? '检测到遥测绘图输出指令，本地运行时将在右侧控制台渲染交互式曲线。'
          : '未检测到绘图指令，可调用 rhine.plot(...) 或输出 __RHINE_PLOT__ JSON 实现可视化。'
      }`,
    };
  }

  if (params.mode === 'fix') {
    const err = params.errorOutput ?? '';
    if (/SyntaxError|IndentationError/i.test(err)) {
      return {
        explanation: `[SERVERLESS 诊断] 捕获语法/缩进错误（${err.slice(0, 110)}）。请核对冒号、括号配对与 4 空格缩进一致性。`,
      };
    }
    if (/NameError|ReferenceError|is not defined/i.test(err)) {
      return {
        explanation: `[SERVERLESS 诊断] 捕获未定义标识符（${err.slice(0, 110)}）。请确认变量声明位置与拼写作用域。`,
      };
    }
    if (/ModuleNotFoundError|No module named/i.test(err)) {
      return {
        explanation: `[SERVERLESS 诊断] 包内 Pyodide Python 3 WASM 内置完整 Python 标准库（math / json / random / statistics 等）；第三方原生 C 扩展不可直接离线导入，建议改用标准库实现。`,
      };
    }
    return {
      explanation: `[SERVERLESS 诊断] ${
        err ? `捕获错误：${err.slice(0, 120)}。` : '当前未检测到报错输出。'
      }可点击「运行代码」验证修改后的本地沙盒执行结果。`,
    };
  }

  return {
    explanation: `[SERVERLESS 优化建议] 建议为数值积分步长添加边界钳制、合并循环采样输出，并将绘图点控制在 500 点以内以保持手机端零卡顿帧率。`,
  };
}

