import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLOUD_API_BASE,
  loadPreferredModel,
  MAINSTREAM_MODEL_PRESETS,
  normalizeApiBaseUrl,
  resolveApiUrl,
  resolveGeminiModelByTaskTier,
  saveApiBaseUrl,
  savePreferredModel,
  saveServerlessMode,
  shouldUseLocalServerlessOnly,
} from './workspaceStorage';

test('normalizeApiBaseUrl strips trailing slashes and validates protocol', () => {
  assert.equal(normalizeApiBaseUrl(''), '');
  assert.equal(
    normalizeApiBaseUrl(' https://example.run.app/// '),
    'https://example.run.app'
  );
  assert.throws(() => normalizeApiBaseUrl('ftp://bad-host'), /http/);
});

test('resolveApiUrl keeps relative paths on standard web and prefixes explicit bases', () => {
  assert.equal(resolveApiUrl('/api/health', ''), '/api/health');
  assert.equal(resolveApiUrl('api/code/run', ''), '/api/code/run');
  assert.equal(
    resolveApiUrl('/api/ai/terminal', 'https://custom.rhinelab.org/'),
    'https://custom.rhinelab.org/api/ai/terminal'
  );
});

test('resolveApiUrl falls back to cloud API base when native Capacitor runtime is detected', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    location: { protocol: 'https:' },
    Capacitor: { isNativePlatform: () => true },
  };
  try {
    assert.equal(
      resolveApiUrl('/api/env/status', ''),
      `${DEFAULT_CLOUD_API_BASE}/api/env/status`
    );
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});

test('shouldUseLocalServerlessOnly defaults to true in native APK and respects explicit overrides', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevStorage = (globalThis as { localStorage?: Storage }).localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  (globalThis as { window?: unknown }).window = {
    location: { protocol: 'capacitor:' },
    Capacitor: { isNativePlatform: () => true },
  };

  try {
    assert.equal(shouldUseLocalServerlessOnly(), true);
    saveApiBaseUrl('http://192.168.1.50:3000');
    assert.equal(shouldUseLocalServerlessOnly(), false);
    saveServerlessMode(true);
    assert.equal(shouldUseLocalServerlessOnly(), true);
    saveServerlessMode(false);
    assert.equal(shouldUseLocalServerlessOnly(), false);

    assert.equal(loadPreferredModel(), 'gemini-4-hydrogen');
    savePreferredModel('openai:deepseek-chat');
    assert.equal(loadPreferredModel(), 'openai:deepseek-chat');
    savePreferredModel('');
    assert.equal(loadPreferredModel(), 'gemini-4-hydrogen');
    assert.equal(MAINSTREAM_MODEL_PRESETS.length >= 8, true);

    assert.equal(resolveGeminiModelByTaskTier('fast'), 'gemini-3.1-flash-lite');
    assert.equal(resolveGeminiModelByTaskTier('standard'), 'gemini-4-hydrogen');
    assert.equal(resolveGeminiModelByTaskTier('interactive'), 'gemini-4-argon');
    assert.equal(resolveGeminiModelByTaskTier('deep'), 'gemini-4-carbon');
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
    (globalThis as { localStorage?: Storage }).localStorage = prevStorage;
  }
});



