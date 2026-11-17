import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type Schema,
} from '@google/genai';
import { RHINE_DIRECTORS, type DirectorProfile } from '../data/rhineLore.ts';

export type AiProviderId = 'gemini' | 'openai';

export interface StandardChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type?: string; text?: string }>;
  name?: string;
  speaker?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
  error?: boolean;
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ResolvedProviderConfig {
  activeProvider: AiProviderId;
  geminiConfigured: boolean;
  geminiBaseUrl?: string;
  geminiPrimaryModel: string;
  geminiFallbackModel: string;
  geminiEmbeddingModel: string;
  openaiConfigured: boolean;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiEmbeddingModel: string;
}

export const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';

const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

/**
 * Resolves AI provider configuration strictly from server environment variables.
 * Never exposes secrets to callers.
 */
export function resolveProviderConfig(
  env: Record<string, string | undefined> = process.env
): ResolvedProviderConfig {
  const geminiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const openaiBaseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/+$/, '');
  const openaiConfigured = Boolean(openaiKey && openaiBaseUrl);

  const requested = (env.AI_PROVIDER || '').trim().toLowerCase();
  let activeProvider: AiProviderId = 'gemini';
  if (requested === 'openai' || requested === 'openai-compatible') {
    activeProvider = 'openai';
  } else if (requested === 'gemini') {
    activeProvider = 'gemini';
  } else if (!geminiConfigured && openaiConfigured) {
    activeProvider = 'openai';
  }

  return {
    activeProvider,
    geminiConfigured,
    geminiBaseUrl: env.GEMINI_BASE_URL?.trim() || undefined,
    geminiPrimaryModel:
      env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_PRIMARY_MODEL,
    geminiFallbackModel:
      env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_GEMINI_FALLBACK_MODEL,
    geminiEmbeddingModel:
      env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_GEMINI_EMBEDDING_MODEL,
    openaiConfigured,
    openaiBaseUrl,
    openaiModel: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    openaiEmbeddingModel:
      env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small',
  };
}

/**
 * Resolves model identifiers and `rlos-<directorId>` persona aliases.
 */
export function resolveModelAndPersona(
  requestedModel?: string,
  config: ResolvedProviderConfig = resolveProviderConfig()
): {
  model: string;
  providerOverride?: AiProviderId;
  director?: DirectorProfile;
} {
  const raw = (requestedModel || '').trim();
  if (!raw) {
    return {
      model:
        config.activeProvider === 'openai'
          ? config.openaiModel
          : config.geminiPrimaryModel,
    };
  }

  if (raw.toLowerCase().startsWith('rlos-')) {
    const slug = raw.slice(5).toLowerCase();
    const director =
      RHINE_DIRECTORS.find((d) => d.id.toLowerCase() === slug) ??
      RHINE_DIRECTORS[0];
    return {
      model:
        config.activeProvider === 'openai'
          ? config.openaiModel
          : config.geminiPrimaryModel,
      director,
    };
  }

  if (raw.startsWith('gemini:')) {
    const inner = raw.slice('gemini:'.length).trim();
    return {
      model: DEPRECATED_GEMINI_MODELS.has(inner)
        ? config.geminiPrimaryModel
        : inner || config.geminiPrimaryModel,
      providerOverride: 'gemini',
    };
  }

  if (raw.startsWith('openai:')) {
    const inner = raw.slice('openai:'.length).trim();
    return {
      model: inner || config.openaiModel,
      providerOverride: 'openai',
    };
  }

  if (DEPRECATED_GEMINI_MODELS.has(raw)) {
    return { model: config.geminiPrimaryModel, providerOverride: 'gemini' };
  }

  if (raw.startsWith('gemini-') || raw.startsWith('lyria-')) {
    return { model: raw, providerOverride: 'gemini' };
  }

  if (config.activeProvider === 'openai') {
    return { model: raw, providerOverride: 'openai' };
  }

  // Fallback for OpenAI-style names (e.g. gpt-*, deepseek-*) if Gemini is active and OpenAI isn't configured
  return {
    model: config.openaiConfigured ? raw : config.geminiPrimaryModel,
    providerOverride: config.openaiConfigured ? 'openai' : 'gemini',
  };
}

export function extractTextContent(
  content: StandardChatMessage['content']
): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Normalizes chat history into valid Gemini Content turns:
 * - Extracts system messages into systemInstruction
 * - Filters out error/empty messages
 * - Drops leading model/assistant greetings so conversation starts with 'user'
 * - Merges consecutive turns of the same role
 */
export function normalizeChatMessages(messages: StandardChatMessage[]): {
  systemInstruction: string;
  contents: Content[];
} {
  const systemParts: string[] = [];
  const rawTurns: { role: 'user' | 'model'; text: string }[] = [];

  for (const m of messages) {
    if (!m || m.error) continue;
    const rawText = extractTextContent(m.content).trim();
    if (!rawText) continue;

    if (m.role === 'system') {
      systemParts.push(rawText);
      continue;
    }

    const role: 'user' | 'model' =
      m.role === 'assistant' ? 'model' : 'user';
    const text =
      role === 'model' && m.speaker
        ? `[${m.speaker}]: ${rawText}`
        : rawText;
    rawTurns.push({ role, text });
  }

  // Drop leading assistant/model greetings so turns start cleanly with user
  while (rawTurns.length > 0 && rawTurns[0].role === 'model') {
    rawTurns.shift();
  }

  const contents: Content[] = [];
  for (const turn of rawTurns) {
    const prev = contents[contents.length - 1];
    if (prev && prev.role === turn.role && prev.parts) {
      prev.parts.push({ text: turn.text });
    } else {
      contents.push({
        role: turn.role,
        parts: [{ text: turn.text }],
      });
    }
  }

  return {
    systemInstruction: systemParts.join('\n\n'),
    contents,
  };
}

/**
 * Parses JSON outputs returned by LLMs, gracefully stripping optional ```json markdown fences.
 */
export function parseAiJsonResponse<T = Record<string, unknown>>(
  rawText: string | undefined,
  fallback: T
): T {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) return fallback;

  const tryParse = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct !== null) return direct;

  const fencedMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  if (fencedMatch) {
    const unfenced = tryParse(fencedMatch[1].trim());
    if (unfenced !== null) return unfenced;
  }

  const objStart = trimmed.indexOf('{');
  const objEnd = trimmed.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    const sliced = tryParse(trimmed.slice(objStart, objEnd + 1));
    if (sliced !== null) return sliced;
  }

  return fallback;
}

export function mapJsonSchemaType(typeStr?: string): Type {
  switch ((typeStr || '').toLowerCase()) {
    case 'string':
      return Type.STRING;
    case 'number':
      return Type.NUMBER;
    case 'integer':
      return Type.INTEGER;
    case 'boolean':
      return Type.BOOLEAN;
    case 'array':
      return Type.ARRAY;
    default:
      return Type.OBJECT;
  }
}

export function convertJsonSchemaToGeminiSchema(
  schema?: Record<string, unknown>
): Schema | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const out: Schema = {
    type: mapJsonSchemaType(
      typeof schema.type === 'string' ? schema.type : 'object'
    ),
  };
  if (typeof schema.description === 'string') {
    out.description = schema.description;
  }
  if (Array.isArray(schema.enum)) {
    out.enum = schema.enum.map(String);
  }
  if (schema.properties && typeof schema.properties === 'object') {
    const props: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(
      schema.properties as Record<string, Record<string, unknown>>
    )) {
      const converted = convertJsonSchemaToGeminiSchema(v);
      if (converted) props[k] = converted;
    }
    if (Object.keys(props).length > 0) {
      out.properties = props;
    }
  }
  if (schema.items && typeof schema.items === 'object') {
    out.items = convertJsonSchemaToGeminiSchema(
      schema.items as Record<string, unknown>
    );
  }
  if (Array.isArray(schema.required)) {
    out.required = schema.required.map(String);
  }
  return out;
}

export function convertOpenAIToolsToGemini(
  tools?: OpenAIToolDefinition[]
): FunctionDeclaration[] {
  if (!Array.isArray(tools)) return [];
  const decls: FunctionDeclaration[] = [];
  for (const t of tools) {
    if (t?.type !== 'function' || !t.function?.name) continue;
    decls.push({
      name: t.function.name,
      description: t.function.description,
      parameters: convertJsonSchemaToGeminiSchema(t.function.parameters),
    });
  }
  return decls;
}

export function formatOpenAIChatResponse(opts: {
  id: string;
  model: string;
  content: string | null;
  toolCalls?: OpenAIToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length';
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}) {
  const promptTokens = opts.usage?.promptTokens ?? 0;
  const completionTokens = opts.usage?.completionTokens ?? 0;
  const totalTokens =
    opts.usage?.totalTokens ?? promptTokens + completionTokens;

  return {
    id: opts.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: opts.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: opts.content,
          ...(opts.toolCalls && opts.toolCalls.length > 0
            ? { tool_calls: opts.toolCalls }
            : {}),
        },
        finish_reason:
          opts.finishReason ??
          (opts.toolCalls && opts.toolCalls.length > 0 ? 'tool_calls' : 'stop'),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  };
}

export function formatOpenAIChatChunk(opts: {
  id: string;
  model: string;
  deltaContent?: string;
  deltaRole?: 'assistant';
  finishReason?: 'stop' | 'tool_calls' | null;
}) {
  return {
    id: opts.id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: opts.model,
    choices: [
      {
        index: 0,
        delta: {
          ...(opts.deltaRole ? { role: opts.deltaRole } : {}),
          ...(opts.deltaContent !== undefined
            ? { content: opts.deltaContent }
            : {}),
        },
        finish_reason: opts.finishReason ?? null,
      },
    ],
  };
}

export function mapThinkingDepthToLevel(
  depth?:
    | 'fast'
    | 'standard'
    | 'interactive'
    | 'deep'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
): ThinkingLevel {
  switch (depth) {
    case 'fast':
    case 'low':
      return ThinkingLevel.LOW;
    case 'deep':
    case 'high':
    case 'xhigh':
      return ThinkingLevel.HIGH;
    case 'interactive':
    case 'standard':
    case 'medium':
    default:
      return ThinkingLevel.MEDIUM;
  }
}

export function getAvailableModels(
  config: ResolvedProviderConfig = resolveProviderConfig()
) {
  const created = 1735689600;
  const models: {
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
    description: string;
  }[] = [
    {
      id: config.geminiPrimaryModel,
      object: 'model',
      created,
      owned_by: 'google-gemini',
      description: 'General tasks — Gemini 4 Hydrogen fast reasoning model',
    },
    {
      id: config.geminiFallbackModel,
      object: 'model',
      created,
      owned_by: 'google-gemini',
      description: 'Fast tasks — Gemini 3.1 Flash Lite high-throughput model',
    },
    {
      id: 'gemini-4-argon',
      object: 'model',
      created,
      owned_by: 'google-gemini',
      description: 'Complex interactive & STEM tasks — Gemini 4 Argon',
    },
    {
      id: 'gemini-4-carbon',
      object: 'model',
      created,
      owned_by: 'google-gemini',
      description: 'Deep reasoning & architectural auditing — Gemini 4 Carbon',
    },
    {
      id: config.geminiEmbeddingModel,
      object: 'model',
      created,
      owned_by: 'google-gemini',
      description: 'Vector embedding model',
    },
  ];

  if (config.openaiConfigured) {
    models.push({
      id: config.openaiModel,
      object: 'model',
      created,
      owned_by: 'openai-compatible',
      description: `Configured OpenAI-compatible upstream (${config.openaiBaseUrl})`,
    });
  }

  for (const dir of RHINE_DIRECTORS) {
    models.push({
      id: `rlos-${dir.id}`,
      object: 'model',
      created,
      owned_by: 'rhine-lab-rlos',
      description: `${dir.name} (${dir.sectionCode}) — ${dir.title}`,
    });
  }

  return models;
}

export function getProviderCatalogSummary(
  config: ResolvedProviderConfig = resolveProviderConfig()
) {
  return {
    activeProvider: config.activeProvider,
    providers: {
      gemini: {
        configured: config.geminiConfigured,
        primaryModel: config.geminiPrimaryModel,
        fallbackModel: config.geminiFallbackModel,
        embeddingModel: config.geminiEmbeddingModel,
        customBaseUrl: Boolean(config.geminiBaseUrl),
      },
      openai: {
        configured: config.openaiConfigured,
        baseUrl: config.openaiBaseUrl,
        defaultModel: config.openaiModel,
        embeddingModel: config.openaiEmbeddingModel,
      },
    },
    standardEndpoints: [
      { method: 'GET', path: '/v1/models', format: 'OpenAI Models' },
      {
        method: 'POST',
        path: '/v1/chat/completions',
        format: 'OpenAI Chat / SSE',
      },
      { method: 'GET', path: '/api/v1/ai/providers', format: 'Provider Catalog' },
      {
        method: 'POST',
        path: '/api/v1/ai/generate',
        format: 'REST JSON / Text',
      },
      { method: 'POST', path: '/api/v1/ai/stream', format: 'REST SSE Stream' },
      { method: 'POST', path: '/api/v1/ai/embeddings', format: 'Embeddings' },
    ],
  };
}

export function getGeminiClient(
  config: ResolvedProviderConfig = resolveProviderConfig()
): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(config.geminiBaseUrl ? { baseUrl: config.geminiBaseUrl } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isRetryableOrFallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('403') ||
    msg.includes('404') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('NOT_FOUND')
  );
}

export async function withGeminiRetry<T>(
  fn: (modelId: string) => Promise<T>,
  primaryModel = DEFAULT_GEMINI_PRIMARY_MODEL,
  fallbackModel = DEFAULT_GEMINI_FALLBACK_MODEL
): Promise<T> {
  const attempts: { model: string; delayMs: number }[] = [
    { model: primaryModel, delayMs: 0 },
    ...(primaryModel !== DEFAULT_GEMINI_PRIMARY_MODEL
      ? [{ model: DEFAULT_GEMINI_PRIMARY_MODEL, delayMs: 250 }]
      : [{ model: primaryModel, delayMs: 550 }]),
    { model: fallbackModel, delayMs: 350 },
  ];
  let lastErr: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((r) => setTimeout(r, attempt.delayMs));
    }
    try {
      return await fn(attempt.model);
    } catch (err) {
      lastErr = err;
      if (!isRetryableOrFallbackError(err)) {
        throw err;
      }
    }
  }
  throw lastErr;
}

export interface UnifiedGenerateOptions {
  prompt?: string;
  messages?: StandardChatMessage[];
  systemInstruction?: string;
  model?: string;
  provider?: AiProviderId;
  thinkingLevel?: ThinkingLevel;
  responseMimeType?: string;
  responseSchema?: Schema;
  tools?: FunctionDeclaration[];
  openAiTools?: OpenAIToolDefinition[];
  jsonMode?: boolean;
}

export interface UnifiedGenerateResult {
  text: string;
  model: string;
  provider: AiProviderId;
  toolCalls: OpenAIToolCall[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

function supportsThinkingLevel(modelId: string): boolean {
  return (
    modelId.startsWith('gemini-4-') ||
    modelId.startsWith('gemini-3.') ||
    modelId.startsWith('gemini-3-')
  );
}

export async function executeUnifiedGenerate(
  opts: UnifiedGenerateOptions
): Promise<UnifiedGenerateResult> {
  const config = resolveProviderConfig();
  const resolved = resolveModelAndPersona(opts.model, config);
  const provider: AiProviderId =
    opts.provider ?? resolved.providerOverride ?? config.activeProvider;

  const personaPrefix = resolved.director
    ? resolved.director.systemPersona
    : '';

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured in server environment.'
      );
    }
    const upstreamMessages: { role: string; content: string }[] = [];
    const combinedSys = [personaPrefix, opts.systemInstruction]
      .filter(Boolean)
      .join('\n\n');
    if (combinedSys) {
      upstreamMessages.push({ role: 'system', content: combinedSys });
    }
    if (opts.messages && opts.messages.length > 0) {
      for (const m of opts.messages) {
        if (!m || m.error) continue;
        const text = extractTextContent(m.content).trim();
        if (!text) continue;
        upstreamMessages.push({ role: m.role, content: text });
      }
    } else if (opts.prompt) {
      upstreamMessages.push({ role: 'user', content: opts.prompt });
    }

    const upstreamResp = await fetch(
      `${config.openaiBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: resolved.model || config.openaiModel,
          messages: upstreamMessages,
          ...(opts.jsonMode || opts.responseMimeType === 'application/json'
            ? { response_format: { type: 'json_object' } }
            : {}),
          ...(opts.openAiTools && opts.openAiTools.length > 0
            ? { tools: opts.openAiTools }
            : {}),
        }),
      }
    );

    const payload = (await upstreamResp.json()) as {
      model?: string;
      choices?: {
        message?: { content?: string; tool_calls?: OpenAIToolCall[] };
      }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      error?: { message?: string };
    };

    if (!upstreamResp.ok) {
      throw new Error(
        payload.error?.message ||
          `Upstream OpenAI-compatible HTTP ${upstreamResp.status}`
      );
    }

    const choice = payload.choices?.[0]?.message;
    return {
      text: choice?.content ?? '',
      model: payload.model || resolved.model || config.openaiModel,
      provider: 'openai',
      toolCalls: choice?.tool_calls ?? [],
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
    };
  }

  // Gemini Provider
  const ai = getGeminiClient(config);
  const { systemInstruction: msgSys, contents: normalizedContents } =
    opts.messages && opts.messages.length > 0
      ? normalizeChatMessages(opts.messages)
      : {
          systemInstruction: '',
          contents: opts.prompt
            ? [{ role: 'user', parts: [{ text: opts.prompt }] }]
            : [],
        };

  if (normalizedContents.length === 0) {
    throw new Error('At least one non-empty user message or prompt is required.');
  }

  const combinedSystem = [personaPrefix, opts.systemInstruction, msgSys]
    .filter(Boolean)
    .join('\n\n');

  const geminiTools =
    opts.tools && opts.tools.length > 0
      ? opts.tools
      : convertOpenAIToolsToGemini(opts.openAiTools);

  const primaryId = resolved.model || config.geminiPrimaryModel;
  const fallbackId = config.geminiFallbackModel;

  const effectiveThinking =
    opts.thinkingLevel ??
    (primaryId === DEFAULT_GEMINI_PRIMARY_MODEL ? ThinkingLevel.LOW : undefined);

  const response = await withGeminiRetry(
    (modelId) =>
      ai.models.generateContent({
        model: modelId,
        contents: normalizedContents,
        config: {
          ...(combinedSystem ? { systemInstruction: combinedSystem } : {}),
          ...(effectiveThinking &&
          supportsThinkingLevel(modelId) &&
          modelId !== DEFAULT_GEMINI_FALLBACK_MODEL
            ? { thinkingConfig: { thinkingLevel: effectiveThinking } }
            : {}),
          ...(opts.responseMimeType || opts.jsonMode
            ? {
                responseMimeType:
                  opts.responseMimeType || 'application/json',
              }
            : {}),
          ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
          ...(geminiTools.length > 0
            ? { tools: [{ functionDeclarations: geminiTools }] }
            : {}),
        },
      }),
    primaryId,
    fallbackId
  );

  const toolCalls: OpenAIToolCall[] = (response.functionCalls ?? []).map(
    (fc, idx) => ({
      id: fc.id || `call_${Date.now()}_${idx}`,
      type: 'function',
      function: {
        name: fc.name || 'unknown',
        arguments: JSON.stringify(fc.args ?? {}),
      },
    })
  );

  return {
    text: response.text ?? '',
    model: primaryId,
    provider: 'gemini',
    toolCalls,
    usage: response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount,
        }
      : undefined,
  };
}

export async function executeUnifiedStream(
  opts: UnifiedGenerateOptions,
  onChunk: (text: string) => void
): Promise<{ model: string; provider: AiProviderId }> {
  const config = resolveProviderConfig();
  const resolved = resolveModelAndPersona(opts.model, config);
  const provider: AiProviderId =
    opts.provider ?? resolved.providerOverride ?? config.activeProvider;
  const personaPrefix = resolved.director
    ? resolved.director.systemPersona
    : '';

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured in server environment.'
      );
    }

    const upstreamMessages: { role: string; content: string }[] = [];
    const combinedSys = [personaPrefix, opts.systemInstruction]
      .filter(Boolean)
      .join('\n\n');
    if (combinedSys) {
      upstreamMessages.push({ role: 'system', content: combinedSys });
    }
    if (opts.messages && opts.messages.length > 0) {
      for (const m of opts.messages) {
        if (!m || m.error) continue;
        const text = extractTextContent(m.content).trim();
        if (!text) continue;
        upstreamMessages.push({ role: m.role, content: text });
      }
    } else if (opts.prompt) {
      upstreamMessages.push({ role: 'user', content: opts.prompt });
    }

    const modelId = resolved.model || config.openaiModel;
    const upstreamResp = await fetch(
      `${config.openaiBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          stream: true,
          messages: upstreamMessages,
        }),
      }
    );

    if (!upstreamResp.ok || !upstreamResp.body) {
      const errText = await upstreamResp.text().catch(() => '');
      throw new Error(
        errText || `Upstream stream HTTP ${upstreamResp.status}`
      );
    }

    const reader = upstreamResp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch {
          // Ignore partial SSE chunk
        }
      }
    }

    return { model: modelId, provider: 'openai' };
  }

  // Gemini Streaming
  const ai = getGeminiClient(config);
  const { systemInstruction: msgSys, contents: normalizedContents } =
    opts.messages && opts.messages.length > 0
      ? normalizeChatMessages(opts.messages)
      : {
          systemInstruction: '',
          contents: opts.prompt
            ? [{ role: 'user', parts: [{ text: opts.prompt }] }]
            : [],
        };

  if (normalizedContents.length === 0) {
    throw new Error('At least one non-empty user message or prompt is required.');
  }

  const combinedSystem = [personaPrefix, opts.systemInstruction, msgSys]
    .filter(Boolean)
    .join('\n\n');

  const primaryId = resolved.model || config.geminiPrimaryModel;
  const fallbackId = config.geminiFallbackModel;

  const effectiveThinking =
    opts.thinkingLevel ??
    (primaryId === DEFAULT_GEMINI_PRIMARY_MODEL ? ThinkingLevel.LOW : undefined);

  const stream = await withGeminiRetry(
    (modelId) =>
      ai.models.generateContentStream({
        model: modelId,
        contents: normalizedContents,
        config: {
          ...(combinedSystem ? { systemInstruction: combinedSystem } : {}),
          ...(effectiveThinking &&
          supportsThinkingLevel(modelId) &&
          modelId !== DEFAULT_GEMINI_FALLBACK_MODEL
            ? { thinkingConfig: { thinkingLevel: effectiveThinking } }
            : {}),
        },
      }),
    primaryId,
    fallbackId
  );

  for await (const chunk of stream) {
    if (chunk.text) {
      onChunk(chunk.text);
    }
  }

  return { model: primaryId, provider: 'gemini' };
}

export async function executeUnifiedEmbeddings(opts: {
  input: string | string[];
  model?: string;
  provider?: AiProviderId;
  dimensions?: number;
}) {
  const config = resolveProviderConfig();
  const provider = opts.provider ?? config.activeProvider;
  const inputs = Array.isArray(opts.input) ? opts.input : [opts.input];

  if (inputs.length === 0 || inputs.every((s) => !s || !s.trim())) {
    throw new Error('Embedding input must contain at least one non-empty string.');
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured in server environment.'
      );
    }
    const model = opts.model || config.openaiEmbeddingModel;
    const resp = await fetch(`${config.openaiBaseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: inputs,
        ...(opts.dimensions ? { dimensions: opts.dimensions } : {}),
      }),
    });
    const payload = (await resp.json()) as {
      data?: { embedding: number[]; index: number }[];
      model?: string;
      error?: { message?: string };
    };
    if (!resp.ok) {
      throw new Error(
        payload.error?.message || `Upstream embeddings HTTP ${resp.status}`
      );
    }
    return {
      object: 'list',
      model: payload.model || model,
      provider: 'openai' as const,
      data: (payload.data ?? []).map((item, idx) => ({
        object: 'embedding' as const,
        index: item.index ?? idx,
        embedding: item.embedding,
      })),
    };
  }

  const ai = getGeminiClient(config);
  const model =
    opts.model && !opts.model.startsWith('text-embedding')
      ? opts.model
      : config.geminiEmbeddingModel;

  const response = await ai.models.embedContent({
    model,
    contents: inputs,
    ...(opts.dimensions
      ? { config: { outputDimensionality: opts.dimensions } }
      : {}),
  });

  const embeddings = response.embeddings ?? [];
  return {
    object: 'list',
    model,
    provider: 'gemini' as const,
    data: embeddings.map((e, idx) => ({
      object: 'embedding' as const,
      index: idx,
      embedding: e.values ?? [],
    })),
  };
}
