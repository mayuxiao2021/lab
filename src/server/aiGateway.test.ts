import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertJsonSchemaToGeminiSchema,
  convertOpenAIToolsToGemini,
  formatOpenAIChatChunk,
  formatOpenAIChatResponse,
  getAvailableModels,
  getProviderCatalogSummary,
  normalizeChatMessages,
  parseAiJsonResponse,
  resolveModelAndPersona,
  resolveProviderConfig,
} from './aiGateway.ts';

test('resolveProviderConfig defaults to gemini and falls back to openai when only OPENAI_API_KEY is set', () => {
  const geminiCfg = resolveProviderConfig({ GEMINI_API_KEY: 'gem-key' });
  assert.equal(geminiCfg.activeProvider, 'gemini');
  assert.equal(geminiCfg.geminiConfigured, true);
  assert.equal(geminiCfg.openaiConfigured, false);

  const autoOpenAi = resolveProviderConfig({
    OPENAI_API_KEY: 'sk-test',
    OPENAI_BASE_URL: 'https://api.example.com/v1/',
    OPENAI_MODEL: 'deepseek-chat',
  });
  assert.equal(autoOpenAi.activeProvider, 'openai');
  assert.equal(autoOpenAi.openaiConfigured, true);
  assert.equal(autoOpenAi.openaiBaseUrl, 'https://api.example.com/v1');
  assert.equal(autoOpenAi.openaiModel, 'deepseek-chat');

  const explicitOverride = resolveProviderConfig({
    AI_PROVIDER: 'openai',
    GEMINI_API_KEY: 'gem-key',
    OPENAI_API_KEY: 'sk-test',
  });
  assert.equal(explicitOverride.activeProvider, 'openai');
});

test('resolveModelAndPersona resolves rlos-* director aliases and blocks deprecated models', () => {
  const cfg = resolveProviderConfig({ GEMINI_API_KEY: 'gem-key' });

  const dirMatch = resolveModelAndPersona('rlos-muelsyse', cfg);
  assert.equal(dirMatch.director?.id, 'muelsyse');
  assert.equal(dirMatch.model, 'gemini-4-hydrogen');

  const deprecatedMatch = resolveModelAndPersona('gemini-1.5-flash', cfg);
  assert.equal(deprecatedMatch.model, 'gemini-4-hydrogen');

  const prefixedOpenAi = resolveModelAndPersona('openai:gpt-4.1', cfg);
  assert.equal(prefixedOpenAi.providerOverride, 'openai');
  assert.equal(prefixedOpenAi.model, 'gpt-4.1');
});

test('normalizeChatMessages strips error messages, drops leading greetings, and merges same roles', () => {
  const result = normalizeChatMessages([
    { role: 'system', content: 'System rule A' },
    { role: 'assistant', speaker: '缪尔赛思', content: 'Greeting message' },
    { role: 'user', content: 'Hello director' },
    { role: 'assistant', error: true, content: '[LINK ERROR] timeout' },
    { role: 'user', content: 'Please re-check Bio-Dome 04' },
    { role: 'assistant', speaker: '缪尔赛思', content: 'Checking now.' },
  ]);

  assert.equal(result.systemInstruction, 'System rule A');
  assert.equal(result.contents.length, 2);
  assert.equal(result.contents[0].role, 'user');
  assert.equal(result.contents[0].parts?.length, 2);
  assert.equal(result.contents[1].role, 'model');
  assert.match(result.contents[1].parts?.[0].text ?? '', /\[缪尔赛思\]: Checking now\./);
});

test('parseAiJsonResponse parses raw JSON and fenced markdown JSON blocks safely', () => {
  const raw = '{"explanation":"ok","code":"print(1)"}';
  assert.deepEqual(parseAiJsonResponse(raw, {}), {
    explanation: 'ok',
    code: 'print(1)',
  });

  const fenced = 'Here is the result:\n```json\n{\n  "explanation": "fixed",\n  "code": "x = 2"\n}\n```';
  assert.deepEqual(parseAiJsonResponse(fenced, {}), {
    explanation: 'fixed',
    code: 'x = 2',
  });

  const invalid = 'not valid json at all';
  assert.deepEqual(parseAiJsonResponse(invalid, { fallback: true }), {
    fallback: true,
  });
});

test('convertOpenAIToolsToGemini and JSON schema conversion preserve nested properties', () => {
  const schema = convertJsonSchemaToGeminiSchema({
    type: 'object',
    properties: {
      temp: { type: 'number', description: 'Temperature C' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['temp'],
  });
  assert.equal(schema?.type, 'OBJECT');
  assert.equal(schema?.properties?.temp.type, 'NUMBER');
  assert.equal(schema?.properties?.tags.type, 'ARRAY');
  assert.deepEqual(schema?.required, ['temp']);

  const decls = convertOpenAIToolsToGemini([
    {
      type: 'function',
      function: {
        name: 'scan_flux',
        description: 'Scan Originium flux',
        parameters: { type: 'object', properties: { alt: { type: 'integer' } } },
      },
    },
  ]);
  assert.equal(decls.length, 1);
  assert.equal(decls[0].name, 'scan_flux');
});

test('OpenAI response and SSE chunk formatters produce compliant payloads', () => {
  const full = formatOpenAIChatResponse({
    id: 'chatcmpl-123',
    model: 'gemini-4-hydrogen',
    content: 'Telemetry nominal.',
    usage: { promptTokens: 10, completionTokens: 5 },
  });
  assert.equal(full.object, 'chat.completion');
  assert.equal(full.choices[0].message.role, 'assistant');
  assert.equal(full.choices[0].message.content, 'Telemetry nominal.');
  assert.equal(full.usage.total_tokens, 15);

  const chunk = formatOpenAIChatChunk({
    id: 'chatcmpl-123',
    model: 'gemini-4-hydrogen',
    deltaContent: 'Hello',
    deltaRole: 'assistant',
  });
  assert.equal(chunk.object, 'chat.completion.chunk');
  assert.equal(chunk.choices[0].delta.content, 'Hello');
  assert.equal(chunk.choices[0].delta.role, 'assistant');
});

test('getAvailableModels and getProviderCatalogSummary never expose secret keys', () => {
  const cfg = resolveProviderConfig({
    GEMINI_API_KEY: 'super-secret-gemini-key',
    OPENAI_API_KEY: 'super-secret-openai-key',
    OPENAI_BASE_URL: 'https://custom-llm.internal/v1',
  });
  const models = getAvailableModels(cfg);
  assert.ok(models.some((m) => m.id === 'gemini-4-hydrogen'));
  assert.ok(models.some((m) => m.id === 'rlos-muelsyse'));
  assert.ok(models.some((m) => m.id === 'gpt-4o-mini'));

  const summary = getProviderCatalogSummary(cfg);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('super-secret'), false);
  assert.ok(summary.standardEndpoints.some((e) => e.path === '/v1/chat/completions'));
});
