import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeBrowserScript,
  executeLocalPython,
  executeLocalTypeScript,
  parseStructuredStdout,
} from './browserSandbox';
import { CODE_TEMPLATES } from './codeTemplates';
import { ECO_PRESETS, type EcoParams } from './ecoSimulation';

test('executeBrowserScript runs Eco-Bridge JS, updates params, and captures plot/table data', async () => {
  let state: EcoParams = { ...ECO_PRESETS[0].params };
  const result = await executeBrowserScript(
    `
      const before = rhine.eco.getParams();
      rhine.eco.setParams({ cohesion: 95, originium: 0.1 });
      rhine.plot("Test Curve", [{ x: 0, y: 10 }, { x: 1, y: 20 }]);
      rhine.table([{ k: "before", v: before.cohesion }]);
      console.log("Done");
    `,
    {
      getParams: () => state,
      onSetParams: (patch) => {
        state = { ...state, ...patch };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(state.cohesion, 95);
  assert.equal(state.originium, 0.1);
  assert.equal(result.plots.length, 1);
  assert.equal(result.plots[0].points.length, 2);
  assert.equal(result.tables.length, 1);
  assert.match(result.stdout, /Done/);
});

test('executeLocalTypeScript runs originium-fft TypeScript template without a Node server', async () => {
  const tsTpl = CODE_TEMPLATES.find((t) => t.id === 'originium-fft');
  assert.ok(tsTpl);
  const result = await executeLocalTypeScript(tsTpl.code, {
    getParams: () => ECO_PRESETS[0].params,
    onSetParams: () => {},
  });

  assert.equal(result.ok, true);
  assert.match(result.stdout, /DFT/);
  assert.equal(result.tables.length, 1);
  assert.equal(result.plots.length, 1);
  assert.equal(result.plots[0].points.length, 12);
});

test('executeBrowserScript catches syntax/runtime errors cleanly', async () => {
  const result = await executeBrowserScript('throw new Error("boom");', {
    getParams: () => ECO_PRESETS[0].params,
    onSetParams: () => {},
  });

  assert.equal(result.ok, false);
  assert.match(result.stderr, /boom/);
});

test('parseStructuredStdout extracts __RHINE_PLOT__ markers cleanly', () => {
  const parsed = parseStructuredStdout(
    'line 1\n__RHINE_PLOT__:{"title":"T","points":[{"x":1,"y":2}]}\nline 2'
  );
  assert.equal(parsed.cleanStdout, 'line 1\nline 2');
  assert.equal(parsed.plots.length, 1);
  assert.equal(parsed.plots[0].title, 'T');
});

test('executeLocalPython fails gracefully when invoked outside browser/WebView', async () => {
  const result = await executeLocalPython('print("hello")');
  assert.equal(result.ok, false);
  assert.match(result.stderr, /Pyodide WASM runtime is only available in browser/);
});
