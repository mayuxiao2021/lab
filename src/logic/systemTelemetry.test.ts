import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTargetLoad,
  createInitialTelemetryHistory,
  stepTelemetryHistory,
  summarizeTelemetry,
  TELEMETRY_WINDOW_SIZE,
  type ActivitySignals,
} from './systemTelemetry';

const idleSignals: ActivitySignals = {
  aiActive: false,
  codeRunning: false,
  activeView: 'terminal',
  simSpeed: 1.0,
  originium: 0.35,
  scanActive: false,
};

test('createInitialTelemetryHistory seeds a fixed rolling window within bounds', () => {
  const hist = createInitialTelemetryHistory(idleSignals);
  assert.equal(hist.length, TELEMETRY_WINDOW_SIZE);
  for (const s of hist) {
    assert.ok(s.cpu >= 2 && s.cpu <= 99);
    assert.ok(s.memory >= 2 && s.memory <= 99);
    assert.ok(s.neuralLoad >= 2 && s.neuralLoad <= 99);
  }
});

test('AI activity spikes neuralLoad and codeRunning spikes CPU', () => {
  const idleTarget = computeTargetLoad(idleSignals, 0);
  const aiTarget = computeTargetLoad({ ...idleSignals, aiActive: true }, 0);
  const codeTarget = computeTargetLoad({ ...idleSignals, codeRunning: true }, 0);

  assert.ok(aiTarget.neuralLoad > idleTarget.neuralLoad + 40);
  assert.ok(codeTarget.cpu > idleTarget.cpu + 35);
});

test('stepTelemetryHistory caps window length and summarizeTelemetry reports workload status', () => {
  let hist = createInitialTelemetryHistory(idleSignals);
  const activeSignals: ActivitySignals = { ...idleSignals, aiActive: true };
  for (let i = 0; i < 6; i++) {
    hist = stepTelemetryHistory(hist, activeSignals, i * 0.5);
  }
  assert.equal(hist.length, TELEMETRY_WINDOW_SIZE);

  const summary = summarizeTelemetry(hist, activeSignals);
  assert.equal(summary.workloadLabel, 'NEURAL CORE // STREAMING');
  assert.ok(summary.peakNeural >= summary.latest.neuralLoad);
  assert.ok(summary.latest.neuralLoad > 55);
});
