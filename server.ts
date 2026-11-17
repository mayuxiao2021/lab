import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { transform as esbuildTransform } from 'esbuild';
import {
  ThinkingLevel,
  Type,
  type FunctionDeclaration,
} from '@google/genai';
import { RHINE_DIRECTORS, RHINE_SECTIONS } from './src/data/rhineLore.ts';
import { clampEcoParam, type EcoParams } from './src/logic/ecoSimulation.ts';
import { inspectApkSignature } from './src/server/apkInspector.ts';
import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_PRIMARY_MODEL,
  convertJsonSchemaToGeminiSchema,
  executeUnifiedEmbeddings,
  executeUnifiedGenerate,
  executeUnifiedStream,
  formatOpenAIChatChunk,
  formatOpenAIChatResponse,
  getAvailableModels,
  getGeminiClient,
  getProviderCatalogSummary,
  mapThinkingDepthToLevel,
  normalizeChatMessages,
  parseAiJsonResponse,
  resolveModelAndPersona,
  resolveProviderConfig,
  withGeminiRetry,
  type AiProviderId,
  type OpenAIToolDefinition,
  type StandardChatMessage,
} from './src/server/aiGateway.ts';

const execFileAsync = promisify(execFile);

function parseCliFlag(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) return args[i + 1];
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}

const PORT = Number(parseCliFlag('--port') || process.env.PORT) || 3000;
const HOST = parseCliFlag('--host') || process.env.HOST || '0.0.0.0';
const PRIMARY_MODEL = DEFAULT_GEMINI_PRIMARY_MODEL;
const FALLBACK_MODEL = DEFAULT_GEMINI_FALLBACK_MODEL;

function runChildWithStdin(
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv },
  stdinText?: string
): Promise<{
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeout);

    const appendChunk = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      const str = chunk.toString('utf8');
      if (target === 'stdout') {
        if (stdout.length + str.length <= options.maxBuffer) stdout += str;
      } else {
        if (stderr.length + str.length <= options.maxBuffer) stderr += str;
      }
    };

    child.stdout.on('data', (chunk: Buffer) => appendChunk('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => appendChunk('stderr', chunk));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: 1,
        stdout,
        stderr: stderr || err.message,
        timedOut: false,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const exitCode = typeof code === 'number' ? code : 1;
      resolve({
        ok: !timedOut && exitCode === 0,
        exitCode,
        stdout,
        stderr: timedOut
          ? `[TIMEOUT] Execution exceeded ${options.timeout}ms limit.\n${stderr}`.trim()
          : stderr,
        timedOut,
      });
    });

    if (stdinText) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

async function resolveApkPath(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), 'downloads/rhine-lab-rlos.apk'),
    path.resolve(
      process.cwd(),
      'android/app/build/outputs/apk/release/app-release.apk'
    ),
    path.resolve(process.cwd(), 'public/downloads/rhine-lab-rlos.apk'),
    path.resolve(
      process.cwd(),
      'android/app/build/outputs/apk/debug/app-debug.apk'
    ),
  ];
  for (const p of candidates) {
    try {
      const st = await fs.stat(p);
      if (st.isFile() && st.size > 0) return p;
    } catch {
      // Not found
    }
  }
  return null;
}

// AI client and retry utilities live in ./src/server/aiGateway.ts

function buildEcoTelemetryContext(ecoParams?: Partial<EcoParams>): string {
  if (!ecoParams) return '';
  return [
    `[Bio-Dome 04 生态模拟舱当前实时遥测]`,
    `- 流形凝聚度 (cohesion): ${ecoParams.cohesion ?? 86}%`,
    `- 源石微粒溶度 (originium): ${ecoParams.originium ?? 0.35} g/L`,
    `- 舱室温度 (temp): ${ecoParams.temp ?? 22.0} °C`,
    `- 光照通量 (light): ${ecoParams.light ?? 7200} lx`,
    `- 液相酸碱度 (ph): pH ${ecoParams.ph ?? 7.1}`,
    `- 模拟速率 (simSpeed): ${ecoParams.simSpeed ?? 1.0}x`,
  ].join('\n');
}

const terminalTools: FunctionDeclaration[] = [
  {
    name: 'set_eco_params',
    description:
      'Adjust Bio-Dome 04 ecological manifold simulation parameters in real time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cohesion: {
          type: Type.NUMBER,
          description: 'Manifold cohesion percentage (0 to 100)',
        },
        originium: {
          type: Type.NUMBER,
          description: 'Originium solute concentration in g/L (0 to 5)',
        },
        temp: {
          type: Type.NUMBER,
          description: 'Chamber temperature in Celsius (2 to 42)',
        },
        light: {
          type: Type.NUMBER,
          description: 'Photoperiod lux (0 to 12000)',
        },
        ph: {
          type: Type.NUMBER,
          description: 'Fluid pH balance (4.5 to 9.0)',
        },
        simSpeed: {
          type: Type.NUMBER,
          description: 'Simulation playback speed multiplier (0 to 3)',
        },
      },
    },
  },
  {
    name: 'inspect_section',
    description:
      'Focus a Rhine Lab section in the workstation sidebar (CMPT, STRU, NRG, ORIG, ECO, SCIEN, BSN, DEF, ENG, HRI).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sectionShort: {
          type: Type.STRING,
          description: 'Short code such as ECO, CMPT, STRU, NRG, ORIG, DEF, ENG',
        },
      },
      required: ['sectionShort'],
    },
  },
  {
    name: 'load_code_in_sandbox',
    description:
      'Send runnable Python, TypeScript, or Browser Eco-Bridge JS code into the Rhine Lab Code Execution Sandbox.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        language: {
          type: Type.STRING,
          description: 'python, typescript, or javascript',
        },
        title: {
          type: Type.STRING,
          description: 'Short filename or script title',
        },
        code: {
          type: Type.STRING,
          description: 'Complete runnable source code',
        },
      },
      required: ['language', 'title', 'code'],
    },
  },
  {
    name: 'run_telemetry_scan',
    description:
      'Trigger an Arc-01 high-altitude Originium flux telemetry scan.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'Reason for triggering telemetry scan',
        },
      },
    },
  },
];

export interface ToolActionPayload {
  type: 'set_eco_params' | 'inspect_section' | 'load_code' | 'trigger_scan';
  label: string;
  data?: Record<string, unknown>;
}

function extractFencedCodeBlocks(text: string) {
  const blocks: {
    language: 'python' | 'typescript' | 'javascript';
    title: string;
    code: string;
  }[] = [];
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
      title: `ai_snippet_${idx}.${ext}`,
      code: match[2].trim(),
    });
  }
  return blocks;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Malformed JSON request body handler
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
          ok: false,
          error: { message: 'Malformed JSON request body.', type: 'invalid_request_error' },
        });
      }
      next(err);
    }
  );

  // Allow cross-origin & Private Network Access requests from Capacitor Android WebView & external clients
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With'
    );
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    const cfg = resolveProviderConfig();
    res.json({
      ok: true,
      provider: cfg.activeProvider,
      model:
        cfg.activeProvider === 'openai'
          ? cfg.openaiModel
          : cfg.geminiPrimaryModel,
    });
  });

  // Standard OpenAI-Compatible & REST AI Gateway Endpoints
  const handleListModels = (_req: express.Request, res: express.Response) => {
    res.json({
      object: 'list',
      data: getAvailableModels(),
    });
  };
  app.get('/v1/models', handleListModels);
  app.get('/api/v1/models', handleListModels);

  app.get('/api/v1/ai/providers', (_req, res) => {
    res.json({
      ok: true,
      ...getProviderCatalogSummary(),
    });
  });

  const handleChatCompletions = async (
    req: express.Request,
    res: express.Response
  ) => {
    const body = req.body as {
      model?: string;
      messages?: StandardChatMessage[];
      stream?: boolean;
      provider?: AiProviderId;
      reasoning_effort?: 'low' | 'medium' | 'high';
      response_format?: {
        type?: string;
        json_schema?: { schema?: Record<string, unknown> };
      };
      tools?: OpenAIToolDefinition[];
    };

    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: "'messages' must be a non-empty array.",
          type: 'invalid_request_error',
        },
      });
    }

    const thinkingLevel = body.reasoning_effort
      ? mapThinkingDepthToLevel(body.reasoning_effort)
      : undefined;

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let clientClosed = false;
      res.on('close', () => {
        if (!res.writableEnded) {
          clientClosed = true;
        }
      });

      const id = `chatcmpl-${crypto.randomUUID()}`;
      const modelLabel = body.model || PRIMARY_MODEL;
      let roleSent = false;

      try {
        const meta = await executeUnifiedStream(
          {
            model: body.model,
            messages: body.messages,
            provider: body.provider,
            thinkingLevel,
          },
          (chunkText) => {
            if (clientClosed || res.writableEnded) return;
            const payload = formatOpenAIChatChunk({
              id,
              model: modelLabel,
              deltaRole: roleSent ? undefined : 'assistant',
              deltaContent: chunkText,
            });
            roleSent = true;
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        );

        if (!clientClosed && !res.writableEnded) {
          const finalChunk = formatOpenAIChatChunk({
            id,
            model: meta.model || modelLabel,
            finishReason: 'stop',
          });
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!clientClosed && !res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ error: { message, type: 'server_error' } })}\n\n`
          );
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
      return;
    }

    try {
      const jsonMode =
        body.response_format?.type === 'json_object' ||
        body.response_format?.type === 'json_schema';
      const responseSchema =
        body.response_format?.type === 'json_schema'
          ? convertJsonSchemaToGeminiSchema(
              body.response_format.json_schema?.schema
            )
          : undefined;

      const result = await executeUnifiedGenerate({
        model: body.model,
        messages: body.messages,
        provider: body.provider,
        thinkingLevel,
        jsonMode,
        responseSchema,
        openAiTools: body.tools,
      });

      return res.json(
        formatOpenAIChatResponse({
          id: `chatcmpl-${crypto.randomUUID()}`,
          model: body.model || result.model,
          content:
            result.toolCalls.length > 0 && !result.text
              ? null
              : result.text,
          toolCalls: result.toolCalls,
          usage: result.usage,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        error: { message, type: 'server_error' },
      });
    }
  };
  app.post('/v1/chat/completions', handleChatCompletions);
  app.post('/api/v1/chat/completions', handleChatCompletions);

  app.post('/api/v1/ai/generate', async (req, res) => {
    try {
      const {
        prompt,
        messages,
        systemInstruction,
        model,
        provider,
        thinkingDepth,
        responseSchema,
        jsonMode,
      } = req.body as {
        prompt?: string;
        messages?: StandardChatMessage[];
        systemInstruction?: string;
        model?: string;
        provider?: AiProviderId;
        thinkingDepth?: 'fast' | 'standard' | 'deep';
        responseSchema?: Record<string, unknown>;
        jsonMode?: boolean;
      };

      if (!prompt && (!Array.isArray(messages) || messages.length === 0)) {
        return res.status(400).json({
          ok: false,
          error: 'Either prompt or non-empty messages array is required.',
        });
      }

      const result = await executeUnifiedGenerate({
        prompt,
        messages,
        systemInstruction,
        model,
        provider,
        thinkingLevel: thinkingDepth
          ? mapThinkingDepthToLevel(thinkingDepth)
          : undefined,
        jsonMode: jsonMode || Boolean(responseSchema),
        responseSchema: convertJsonSchemaToGeminiSchema(responseSchema),
      });

      return res.json({
        ok: true,
        provider: result.provider,
        model: result.model,
        text: result.text,
        data:
          jsonMode || responseSchema
            ? parseAiJsonResponse(result.text, null)
            : undefined,
        toolCalls: result.toolCalls,
        usage: result.usage,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/v1/ai/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const {
        prompt,
        messages,
        systemInstruction,
        model,
        provider,
        thinkingDepth,
      } = req.body as {
        prompt?: string;
        messages?: StandardChatMessage[];
        systemInstruction?: string;
        model?: string;
        provider?: AiProviderId;
        thinkingDepth?: 'fast' | 'standard' | 'deep';
      };

      if (!prompt && (!Array.isArray(messages) || messages.length === 0)) {
        sendEvent({ error: 'Either prompt or non-empty messages array is required.' });
        return res.end();
      }

      const meta = await executeUnifiedStream(
        {
          prompt,
          messages,
          systemInstruction,
          model,
          provider,
          thinkingLevel: thinkingDepth
            ? mapThinkingDepthToLevel(thinkingDepth)
            : undefined,
        },
        (chunk) => sendEvent({ chunk })
      );

      sendEvent({ done: true, provider: meta.provider, model: meta.model });
      if (!res.writableEnded) res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent({ error: message });
      if (!res.writableEnded) res.end();
    }
  });

  app.post('/api/v1/ai/embeddings', async (req, res) => {
    try {
      const { input, model, provider, dimensions } = req.body as {
        input?: string | string[];
        model?: string;
        provider?: AiProviderId;
        dimensions?: number;
      };
      if (!input || (typeof input !== 'string' && !Array.isArray(input))) {
        return res.status(400).json({
          ok: false,
          error: "'input' must be a non-empty string or array of strings.",
        });
      }
      const result = await executeUnifiedEmbeddings({
        input,
        model,
        provider,
        dimensions,
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.get('/api/env/status', async (_req, res) => {
    let pythonVersion = 'Unavailable';
    try {
      const py = await execFileAsync('python3', ['--version'], { timeout: 2500 });
      pythonVersion = (py.stdout || py.stderr).trim();
    } catch {
      pythonVersion = 'Unavailable';
    }

    let javaVersion = 'Unavailable';
    for (const javaBin of ['java', '/usr/lib/jvm/java-21-openjdk-amd64/bin/java']) {
      try {
        const jv = await execFileAsync(javaBin, ['-version'], { timeout: 2500 });
        const parsed = ((jv.stderr || jv.stdout).split('\n')[0] || '').trim();
        if (parsed) {
          javaVersion = parsed;
          break;
        }
      } catch {
        // Try next candidate
      }
    }

    const apkPath = await resolveApkPath();
    let androidBuild: {
      available: boolean;
      filename: string;
      downloadUrl: string;
      packageId: string;
      versionCode: number;
      versionName: string;
      minSdk: number;
      targetSdk: number;
      sizeBytes?: number;
      sha256?: string;
      signed?: boolean;
      signatureSchemes?: string[];
      buildType?: 'release' | 'debug';
    } = {
      available: false,
      filename: 'rhine-lab-rlos.apk',
      downloadUrl: '/api/android/download-apk',
      packageId: 'com.rhinelab.rlos',
      versionCode: 3,
      versionName: '4.2.1',
      minSdk: 24,
      targetSdk: 36,
    };

    if (apkPath) {
      try {
        const buf = await fs.readFile(apkPath);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        const sig = inspectApkSignature(buf);
        const isDebugApk = apkPath.includes('app-debug.apk');
        androidBuild = {
          ...androidBuild,
          available: true,
          sizeBytes: buf.length,
          sha256,
          signed: sig.isSigned,
          signatureSchemes: sig.schemes,
          buildType: isDebugApk ? 'debug' : 'release',
        };
      } catch {
        // Ignore read error
      }
    }

    res.json({
      ok: true,
      nodeVersion: process.version,
      pythonVersion,
      javaVersion,
      platform: `${os.platform()} ${os.arch()}`,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      primaryModel: PRIMARY_MODEL,
      aiGateway: getProviderCatalogSummary(),
      sandboxEngines: [
        'Eco-Bridge JS (Client WebView)',
        'Sucrase TypeScript (Client/APK Offline)',
        'Pyodide Python 3 WASM (Client/APK Offline)',
        pythonVersion,
        `Node ${process.version} + esbuild (TypeScript)`,
      ],
      androidBuild,
    });
  });

  app.get('/api/android/download-apk', async (_req, res) => {
    const apkPath = await resolveApkPath();
    if (!apkPath) {
      return res.status(404).json({
        ok: false,
        error: 'Android APK 尚未编译生成，请先执行安卓打包流程。',
      });
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="rhine-lab-rlos.apk"'
    );
    return res.sendFile(apkPath);
  });

  // 1. Intelligent AI Terminal with Function Calling
  app.post('/api/ai/terminal', async (req, res) => {
    try {
      const {
        prompt,
        directorId = 'rlos',
        activeSectionShort = 'CMPT',
        ecoParams,
        history = [],
        model: requestedModel,
      } = req.body as {
        prompt: string;
        directorId?: string;
        activeSectionShort?: string;
        ecoParams?: Partial<EcoParams>;
        history?: { role: 'user' | 'model'; text: string }[];
        model?: string;
      };

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const director =
        RHINE_DIRECTORS.find((d) => d.id === directorId) ?? RHINE_DIRECTORS[0];
      const activeSection =
        RHINE_SECTIONS.find((s) => s.short === activeSectionShort) ??
        RHINE_SECTIONS[0];

      const systemInstruction = [
        director.systemPersona,
        `当前终端所在业务科室: ${activeSection.name} (${activeSection.code})`,
        buildEcoTelemetryContext(ecoParams),
        `指令规则:`,
        `- 你正在莱茵生命 R.L.OS 智能科学终端内响应研究员。回答使用清晰简洁的中文（可带精准工程术语），不要使用过度冗长的客套话。`,
        `- 如果用户请求调整生态舱参数、查看特定科室、进行遥测扫描或编写可运行代码，优先调用对应的工具函数 (set_eco_params, inspect_section, load_code_in_sandbox, run_telemetry_scan)。`,
        `- 如果提供了代码，也可以在回复中附带标准的 Markdown 代码块（python / typescript / javascript）以便终端一键载入沙盒运行。`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const { contents: conversationContents } = normalizeChatMessages([
        ...history
          .slice(-6)
          .map((h) => ({
            role: (h.role === 'model' ? 'assistant' : 'user') as
              | 'assistant'
              | 'user',
            content: h.text,
          })),
        { role: 'user', content: prompt },
      ]);

      const cfg = resolveProviderConfig();
      const resolvedModel = resolveModelAndPersona(requestedModel, cfg);
      const useOpenAi =
        (resolvedModel.providerOverride === 'openai' && cfg.openaiConfigured) ||
        (cfg.activeProvider === 'openai' && !cfg.geminiConfigured);
      if (useOpenAi) {
        // Unified OpenAI-compatible path
        const unified = await executeUnifiedGenerate({
          provider: 'openai',
          model: resolvedModel.model,
          systemInstruction,
          messages: [
            ...history.slice(-6).map((h) => ({
              role: (h.role === 'model' ? 'assistant' : 'user') as
                | 'assistant'
                | 'user',
              content: h.text,
            })),
            { role: 'user', content: prompt },
          ],
          openAiTools: terminalTools.map((t) => ({
            type: 'function',
            function: {
              name: t.name!,
              description: t.description,
              parameters: t.parameters as unknown as Record<string, unknown>,
            },
          })),
        });
        const toolActions: ToolActionPayload[] = [];
        const injectedCodeBlocks: {
          language: 'python' | 'typescript' | 'javascript';
          title: string;
          code: string;
        }[] = [];

        for (const call of unified.toolCalls) {
          const args = parseAiJsonResponse<Record<string, unknown>>(
            call.function.arguments,
            {}
          );
          if (call.function.name === 'set_eco_params') {
            const patch: Partial<EcoParams> = {};
            const keys: (keyof EcoParams)[] = [
              'cohesion',
              'originium',
              'temp',
              'light',
              'ph',
              'simSpeed',
            ];
            for (const k of keys) {
              if (typeof args[k] === 'number' && Number.isFinite(args[k])) {
                patch[k] = clampEcoParam(k, args[k] as number);
              }
            }
            toolActions.push({
              type: 'set_eco_params',
              label: `已更新 Bio-Dome 04 生态参数 (${Object.entries(patch)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')})`,
              data: patch,
            });
          } else if (call.function.name === 'inspect_section') {
            const code = String(args.sectionShort || 'ECO').toUpperCase();
            const sec = RHINE_SECTIONS.find((s) => s.short === code);
            toolActions.push({
              type: 'inspect_section',
              label: sec
                ? `已切换焦点科室至 ${sec.name} (${sec.short})`
                : `尝试定位科室 ${code}`,
              data: { sectionShort: sec ? sec.short : code },
            });
          } else if (call.function.name === 'load_code_in_sandbox') {
            const rawLang = String(args.language || 'python').toLowerCase();
            const language: 'python' | 'typescript' | 'javascript' =
              rawLang.includes('type')
                ? 'typescript'
                : rawLang.includes('java')
                  ? 'javascript'
                  : 'python';
            const title = String(
              args.title || `script.${language === 'python' ? 'py' : 'ts'}`
            );
            const code = String(args.code || '');
            injectedCodeBlocks.push({ language, title, code });
            toolActions.push({
              type: 'load_code',
              label: `已生成可执行脚本「${title}」并准备载入代码沙盒`,
              data: { language, title, code },
            });
          } else if (call.function.name === 'run_telemetry_scan') {
            toolActions.push({
              type: 'trigger_scan',
              label: '已启动 Arc-01 高空源石通量脉冲扫描',
            });
          }
        }

        const fencedBlocks = extractFencedCodeBlocks(unified.text);
        const allCodeBlocks = [...injectedCodeBlocks];
        for (const fb of fencedBlocks) {
          if (!allCodeBlocks.some((b) => b.code === fb.code)) {
            allCodeBlocks.push(fb);
          }
        }
        return res.json({
          reply: unified.text.trim() || '操作已执行完毕。',
          speakerId: director.id,
          speakerName: director.name,
          speakerCode: director.sectionCode,
          toolActions,
          codeBlocks: allCodeBlocks,
        });
      }

      const ai = getGeminiClient(cfg);
      const primaryGeminiModel =
        resolvedModel.providerOverride === 'gemini' && resolvedModel.model
          ? resolvedModel.model
          : PRIMARY_MODEL;
      const response1 = await withGeminiRetry(
        (modelId) =>
          ai.models.generateContent({
            model: modelId,
            contents: conversationContents,
            config: {
              systemInstruction,
              ...(modelId === PRIMARY_MODEL
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              tools: [{ functionDeclarations: terminalTools }],
            },
          }),
        primaryGeminiModel,
        FALLBACK_MODEL
      );

      const toolActions: ToolActionPayload[] = [];
      const injectedCodeBlocks: {
        language: 'python' | 'typescript' | 'javascript';
        title: string;
        code: string;
      }[] = [];

      const firstContent = response1.candidates?.[0]?.content;
      const calls = response1.functionCalls ?? [];

      let finalReply = response1.text ?? '';

      if (calls.length > 0 && firstContent) {
        const functionResponseParts: {
          functionResponse: {
            id?: string;
            name?: string;
            response: Record<string, unknown>;
          };
        }[] = [];

        for (const call of calls) {
          const args = (call.args ?? {}) as Record<string, unknown>;
          if (call.name === 'set_eco_params') {
            const patch: Partial<EcoParams> = {};
            const keys: (keyof EcoParams)[] = [
              'cohesion',
              'originium',
              'temp',
              'light',
              'ph',
              'simSpeed',
            ];
            for (const k of keys) {
              if (typeof args[k] === 'number' && Number.isFinite(args[k])) {
                patch[k] = clampEcoParam(k, args[k] as number);
              }
            }
            toolActions.push({
              type: 'set_eco_params',
              label: `已更新 Bio-Dome 04 生态参数 (${Object.entries(patch)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')})`,
              data: patch,
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { ok: true, applied: patch },
              },
            });
          } else if (call.name === 'inspect_section') {
            const code = String(args.sectionShort || 'ECO').toUpperCase();
            const sec = RHINE_SECTIONS.find((s) => s.short === code);
            toolActions.push({
              type: 'inspect_section',
              label: sec
                ? `已切换焦点科室至 ${sec.name} (${sec.short})`
                : `尝试定位科室 ${code}`,
              data: { sectionShort: sec ? sec.short : code },
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: sec
                  ? { ok: true, section: sec }
                  : { ok: false, error: 'Section not found' },
              },
            });
          } else if (call.name === 'load_code_in_sandbox') {
            const rawLang = String(args.language || 'python').toLowerCase();
            const language: 'python' | 'typescript' | 'javascript' =
              rawLang.includes('type')
                ? 'typescript'
                : rawLang.includes('java')
                  ? 'javascript'
                  : 'python';
            const title = String(args.title || `script.${language === 'python' ? 'py' : 'ts'}`);
            const code = String(args.code || '');
            injectedCodeBlocks.push({ language, title, code });
            toolActions.push({
              type: 'load_code',
              label: `已生成可执行脚本「${title}」并准备载入代码沙盒`,
              data: { language, title, code },
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { ok: true, title, language, bytes: code.length },
              },
            });
          } else if (call.name === 'run_telemetry_scan') {
            toolActions.push({
              type: 'trigger_scan',
              label: '已启动 Arc-01 高空源石通量脉冲扫描',
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  ok: true,
                  altitudeM: 6000,
                  fluxMsv: 43.6,
                  starpodResonanceMhz: 1420.405,
                },
              },
            });
          }
        }

        const response2 = await withGeminiRetry((modelId) =>
          ai.models.generateContent({
            model: modelId,
            contents: [
              ...conversationContents,
              firstContent,
              { role: 'user', parts: functionResponseParts },
            ],
            config: {
              systemInstruction,
              ...(modelId === PRIMARY_MODEL
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          })
        );
        finalReply = response2.text ?? finalReply;
      }

      const fencedBlocks = extractFencedCodeBlocks(finalReply);
      const allCodeBlocks = [...injectedCodeBlocks];
      for (const fb of fencedBlocks) {
        if (!allCodeBlocks.some((b) => b.code === fb.code)) {
          allCodeBlocks.push(fb);
        }
      }

      res.json({
        reply: finalReply.trim() || '操作已执行完毕。',
        speakerId: director.id,
        speakerName: director.name,
        speakerCode: director.sectionCode,
        toolActions,
        codeBlocks: allCodeBlocks,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // 2. Streaming SSE Chat with Section Directors (1-on-1 or Joint Council)
  app.post('/api/ai/chat', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const {
        directorId = 'muelsyse',
        messages = [],
        ecoParams,
        activeCode,
        councilContext,
        customSystemInstruction,
        thinkingDepth = 'standard',
        model: requestedModel,
      } = req.body as {
        directorId: string;
        messages: {
          role: 'user' | 'assistant';
          speaker?: string;
          content: string;
          error?: boolean;
        }[];
        ecoParams?: Partial<EcoParams>;
        activeCode?: { filename: string; language: string; code: string };
        councilContext?: string;
        customSystemInstruction?: string;
        thinkingDepth?: 'fast' | 'standard' | 'interactive' | 'deep';
        model?: string;
      };

      const director =
        RHINE_DIRECTORS.find((d) => d.id === directorId) ?? RHINE_DIRECTORS[0];

      const effectiveModel =
        requestedModel && requestedModel.trim()
          ? requestedModel.trim()
          : thinkingDepth === 'fast'
            ? 'gemini-3.1-flash-lite'
            : thinkingDepth === 'interactive'
              ? 'gemini-4-argon'
              : thinkingDepth === 'deep'
                ? 'gemini-4-carbon'
                : 'gemini-4-hydrogen';

      const systemParts = [
        customSystemInstruction?.trim() || director.systemPersona,
        buildEcoTelemetryContext(ecoParams),
        activeCode
          ? `[研究员当前代码沙盒文件: ${activeCode.filename} (${activeCode.language})]\n\`\`\`${activeCode.language}\n${activeCode.code.slice(0, 3500)}\n\`\`\``
          : '',
        councilContext ? `[多主任联席会议上下文]\n${councilContext}` : '',
        '请完全以该角色的身份、口吻和专业视野用中文回应（保留莱茵生命科学感与角色性格特征）。如果讨论到代码或算法，可给出可直接运行的改进建议。',
      ].filter(Boolean);

      const streamMeta = await executeUnifiedStream(
        {
          model: effectiveModel,
          systemInstruction: systemParts.join('\n\n'),
          messages: messages.slice(-14),
          thinkingLevel: mapThinkingDepthToLevel(thinkingDepth),
        },
        (chunkText) => {
          sendEvent({ chunk: chunkText });
        }
      );

      sendEvent({
        done: true,
        directorId: director.id,
        model: streamMeta.model,
        provider: streamMeta.provider,
      });
      if (!res.writableEnded) res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent({ error: message });
      if (!res.writableEnded) res.end();
    }
  });

  // 3. AI Code Lab Assistant (Generate / Fix / Explain / Optimize)
  app.post('/api/ai/code-assist', async (req, res) => {
    try {
      const {
        mode = 'generate',
        language = 'python',
        code = '',
        errorOutput = '',
        prompt = '',
        directorId = 'ptilopsis',
        model: requestedModel,
      } = req.body as {
        mode?: 'generate' | 'fix' | 'explain' | 'optimize';
        language?: 'python' | 'typescript' | 'javascript';
        code?: string;
        errorOutput?: string;
        prompt?: string;
        directorId?: string;
        model?: string;
      };

      const director =
        RHINE_DIRECTORS.find((d) => d.id === directorId) ?? RHINE_DIRECTORS[0];

      const userPrompt = [
        `任务模式: ${mode}`,
        `目标语言: ${language}`,
        language === 'javascript'
          ? '注意：当前处于浏览器 Eco-Bridge JS 沙盒，可使用全局对象 rhine.eco.getParams(), rhine.eco.setParams(patch), rhine.plot(title, [{x,y}]), rhine.table(rows) 以及 console.log。'
          : language === 'python'
            ? '注意：运行在标准 Python 3 沙盒（仅使用标准库如 math, json, random, statistics, collections 等，不要依赖未安装的第三方包如 numpy/matplotlib）。如需绘图可 print("__RHINE_PLOT__:" + json.dumps({"title": "...", "points": [{"x": ..., "y": ...}]})). '
            : '注意：运行在 Node.js + esbuild TypeScript 沙盒（使用标准 TS/JS 语法和 console.log/console.table）。如需绘图可 console.log("__RHINE_PLOT__:" + JSON.stringify({title: "...", points: [{x, y}]})).',
        prompt ? `用户要求: ${prompt}` : '',
        code ? `现有代码:\n\`\`\`${language}\n${code}\n\`\`\`` : '',
        errorOutput ? `运行报错输出:\n${errorOutput}` : '',
        '严格以合法 JSON 对象格式返回，包含字段: explanation, suggestedFilename, code。',
      ]
        .filter(Boolean)
        .join('\n\n');

      const result = await executeUnifiedGenerate({
        model: requestedModel,
        prompt: userPrompt,
        systemInstruction: `${director.systemPersona}\n你正在莱茵生命代码演算沙盒中协助研究员编写、修复与优化科学程序。请以 JSON 返回简洁精准的中文技术说明与完整可运行代码。`,
        thinkingLevel: ThinkingLevel.MEDIUM,
        jsonMode: true,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: {
              type: Type.STRING,
              description:
                'Concise explanation of the algorithm, fix, or analysis in Chinese.',
            },
            suggestedFilename: {
              type: Type.STRING,
              description: 'Suggested filename matching the language.',
            },
            code: {
              type: Type.STRING,
              description: 'Complete runnable source code.',
            },
          },
          required: ['explanation', 'suggestedFilename', 'code'],
        },
      });

      const parsed = parseAiJsonResponse<{
        explanation?: string;
        suggestedFilename?: string;
        code?: string;
      }>(result.text, {});

      res.json({
        ok: true,
        speakerName: director.name,
        explanation:
          parsed.explanation ||
          (result.text && !parsed.code ? result.text.slice(0, 600) : '已完成代码分析与重构。'),
        suggestedFilename: parsed.suggestedFilename ?? '',
        code: parsed.code ?? code,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // 4. Real Code Execution Sandbox (Python 3 / TypeScript / Node.js)
  app.post('/api/code/run', async (req, res) => {
    const { language, code, stdin = '', timeoutMs = 5000 } = req.body as {
      language?: 'python' | 'typescript' | 'javascript';
      code?: string;
      stdin?: string;
      timeoutMs?: number;
    };

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, stderr: 'No code provided.' });
    }
    if (code.length > 64_000) {
      return res
        .status(400)
        .json({ ok: false, stderr: 'Source code exceeds 64KB limit.' });
    }

    const safeTimeout = Math.max(500, Math.min(8000, Number(timeoutMs) || 5000));
    const runId = crypto.randomUUID();
    const tmpDir = os.tmpdir();
    let tempFilePath = '';
    const start = performance.now();

    try {
      if (language === 'python') {
        tempFilePath = path.join(tmpDir, `rhine-exec-${runId}.py`);
        await fs.writeFile(tempFilePath, code, 'utf8');
        const execRes = await runChildWithStdin(
          'python3',
          ['-I', '-u', tempFilePath],
          {
            timeout: safeTimeout,
            maxBuffer: 256 * 1024,
            env: {
              PATH: process.env.PATH ?? '/usr/bin:/bin',
              PYTHONIOENCODING: 'utf-8',
            },
          },
          stdin
        );
        return res.json({
          ...execRes,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        });
      }

      if (language === 'typescript' || language === 'javascript') {
        let jsCode = code;
        if (language === 'typescript') {
          const transformed = await esbuildTransform(code, {
            loader: 'ts',
            format: 'esm',
            target: 'node22',
          });
          jsCode = transformed.code;
        }
        tempFilePath = path.join(tmpDir, `rhine-exec-${runId}.mjs`);
        await fs.writeFile(tempFilePath, jsCode, 'utf8');
        const execRes = await runChildWithStdin(
          process.execPath,
          ['--no-warnings', tempFilePath],
          {
            timeout: safeTimeout,
            maxBuffer: 256 * 1024,
            env: {
              PATH: process.env.PATH ?? '/usr/bin:/bin',
              NODE_ENV: 'sandbox',
            },
          },
          stdin
        );
        return res.json({
          ...execRes,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        });
      }

      return res
        .status(400)
        .json({ ok: false, stderr: `Unsupported language: ${language}` });
    } catch (err) {
      const execErr = err as { message?: string };
      return res.json({
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: execErr.message || 'Execution failed.',
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        timedOut: false,
      });
    } finally {
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {});
      }
    }
  });

  // Return JSON 404 for unknown API / v1 endpoints before SPA fallback
  app.use(['/api', '/v1'], (req, res) => {
    res.status(404).json({
      ok: false,
      error: {
        message: `Unknown endpoint: ${req.method} ${req.originalUrl}`,
        type: 'not_found_error',
      },
    });
  });

  // Mount Vite in dev or serve static dist in production
  let viteInstance: {
    middlewares: express.RequestHandler;
    close: () => Promise<void>;
  } | null = null;
  let vitePromise: Promise<{
    middlewares: express.RequestHandler;
    close: () => Promise<void>;
  }> | null = null;

  const ensureVite = () => {
    if (!vitePromise) {
      vitePromise = import('vite')
        .then(({ createServer: createViteServer }) =>
          createViteServer({
            server: {
              middlewareMode: true,
              hmr: false,
              ws: false,
              watch: null,
            },
            optimizeDeps: {
              entries: ['index.html'],
            },
            appType: 'spa',
          })
        )
        .then((vite) => {
          viteInstance = vite;
          return vite;
        });
      vitePromise.catch((err) => {
        console.error('Failed to initialize Vite dev middleware:', err);
      });
    }
    return vitePromise;
  };

  if (process.env.NODE_ENV !== 'production') {
    // Since HMR & Vite WS are disabled (ws: false, hmr: false), prevent Vite 8's default
    // /@vite/client script from attempting a browser WebSocket connection to port 24678
    // while keeping CSS/ESM dev helpers intact.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`const sheetsMap = new Map();
const linkSheetsMap = new Map();
const cspNonce = typeof document !== "undefined"
  ? document.querySelector("meta[property=csp-nonce]")?.nonce
  : undefined;
if (typeof document !== "undefined") {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (cspNonce) style.setAttribute("nonce", cspNonce);
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll(\`link[rel="stylesheet"][data-vite-dev-id="\${CSS.escape(id)}"]\`).forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return \`\${pathname}?\${queryToInject}\${search ? "&" + search.slice(1) : ""}\${hash || ""}\`;
}
export class ErrorOverlay extends HTMLElement {
  close() { this.parentNode?.removeChild(this); }
}
if (typeof customElements !== "undefined" && !customElements.get("vite-error-overlay")) {
  customElements.define("vite-error-overlay", ErrorOverlay);
}
`);
    });

    app.use(async (req, res, next) => {
      if (req.method === 'HEAD' && !viteInstance) {
        res.status(200).end();
        return;
      }
      try {
        const vite = viteInstance ?? (await ensureVite());
        return vite.middlewares(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Rhine Lab R.L.OS server listening on http://${HOST}:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
      setImmediate(() => {
        void ensureVite();
      });
    }
  });

  const shutdown = () => {
    server.close(() => {
      Promise.resolve(viteInstance?.close())
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
