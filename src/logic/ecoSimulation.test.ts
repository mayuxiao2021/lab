import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECO_PRESETS,
  clampEcoParam,
  computeEcoMetrics,
  computeSpeedSchedule,
  findMatchingEcoPreset,
} from './ecoSimulation';

test('habitat preset produces optimal stability and equilibrium state', () => {
  const habitat = ECO_PRESETS.find((p) => p.id === 'habitat')!;
  const metrics = computeEcoMetrics(habitat.params);
  assert.equal(metrics.severity, 'optimal');
  assert.ok(metrics.stability > 90);
  assert.ok(metrics.oxygen > 7);
});

test('overload preset triggers critical originium crystallization risk', () => {
  const overload = ECO_PRESETS.find((p) => p.id === 'overload')!;
  const metrics = computeEcoMetrics(overload.params);
  assert.equal(metrics.severity, 'critical');
  assert.ok(metrics.stability < 25);
  assert.match(metrics.statusLabel, /Critical/);
});

test('frost preset triggers cryogenic lattice warning without collapsing stability to 0', () => {
  const frost = ECO_PRESETS.find((p) => p.id === 'frost')!;
  const metrics = computeEcoMetrics(frost.params);
  assert.equal(metrics.severity, 'warning');
  assert.ok(metrics.stability > 50);
  assert.match(metrics.phaseLabel, /ICE CRYSTAL LATTICE/);
});

test('clampEcoParam respects scientific bounds and precision', () => {
  assert.equal(clampEcoParam('cohesion', 150), 100);
  assert.equal(clampEcoParam('cohesion', -12), 0);
  assert.equal(clampEcoParam('originium', 3.456), 3.46);
  assert.equal(clampEcoParam('ph', 2.0), 4.5);
  assert.equal(clampEcoParam('ph', 11.2), 9.0);
  assert.equal(clampEcoParam('simSpeed', 4.5), 3.0);
  assert.equal(clampEcoParam('simSpeed', -1.0), 0);
  assert.equal(clampEcoParam('simSpeed', 1.24), 1.2);
});

test('computeSpeedSchedule scales both target FPS and particle speedScale', () => {
  const paused = computeSpeedSchedule(0);
  assert.equal(paused.isPaused, true);
  assert.equal(paused.speedScale, 0);
  assert.equal(paused.targetFps, 0);

  const slow = computeSpeedSchedule(0.2);
  const normal = computeSpeedSchedule(1.0);
  const fast = computeSpeedSchedule(2.5);

  assert.equal(slow.isPaused, false);
  assert.ok(slow.targetFps < normal.targetFps);
  assert.ok(normal.targetFps <= fast.targetFps);
  assert.equal(slow.speedScale, 0.2);
  assert.equal(normal.speedScale, 1.0);
  assert.equal(fast.speedScale, 2.5);
});

test('findMatchingEcoPreset matches known presets regardless of simSpeed and returns null for custom params', () => {
  const frost = ECO_PRESETS.find((p) => p.id === 'frost')!;
  assert.equal(
    findMatchingEcoPreset({ ...frost.params, simSpeed: 2.2 }),
    'frost'
  );
  assert.equal(
    findMatchingEcoPreset({ ...frost.params, cohesion: 55 }),
    null
  );
});

