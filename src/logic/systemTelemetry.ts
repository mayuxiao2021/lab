import type { WorkspaceView } from './terminalEngine';

export interface TelemetrySample {
  seq: number;
  cpu: number;
  memory: number;
  neuralLoad: number;
}

export interface ActivitySignals {
  aiActive: boolean;
  codeRunning: boolean;
  activeView: WorkspaceView;
  simSpeed: number;
  originium: number;
  scanActive: boolean;
}

export interface TelemetrySummary {
  latest: TelemetrySample;
  peakCpu: number;
  peakMemory: number;
  peakNeural: number;
  avgCpu: number;
  avgNeural: number;
  workloadLabel: string;
}

export const TELEMETRY_WINDOW_SIZE = 28;

export function clampPercent(val: number): number {
  return Math.max(2, Math.min(99, Math.round(val * 10) / 10));
}

export function computeTargetLoad(
  signals: ActivitySignals,
  phase: number
): { cpu: number; memory: number; neuralLoad: number } {
  // Base workstation footprint by active module
  let baseCpu = 16;
  let baseMem = 38;
  let baseNeural = 14;

  if (signals.activeView === 'eco') {
    const speedFactor = Math.max(0, signals.simSpeed);
    baseCpu += 10 + speedFactor * 6.5;
    baseMem += 8 + speedFactor * 2.5;
    baseNeural += 6 + signals.originium * 3.2;
  } else if (signals.activeView === 'code') {
    baseCpu += 6;
    baseMem += 10;
    baseNeural += 4;
  } else if (signals.activeView === 'comms') {
    baseCpu += 5;
    baseMem += 7;
    baseNeural += 14;
  }

  if (signals.codeRunning) {
    baseCpu += 48;
    baseMem += 22;
    baseNeural += 12;
  }

  if (signals.aiActive) {
    baseCpu += 24;
    baseMem += 14;
    baseNeural += 62;
  }

  if (signals.scanActive) {
    baseCpu += 16;
    baseNeural += 18;
  }

  // Organic deterministic micro-oscillation so idle charts stay alive
  const waveA = Math.sin(phase * 1.3) * 3.4 + Math.cos(phase * 0.7) * 1.8;
  const waveB = Math.cos(phase * 0.9) * 2.1 + Math.sin(phase * 0.45) * 1.2;
  const waveC = Math.sin(phase * 1.7 + 1.1) * 4.2;

  return {
    cpu: clampPercent(baseCpu + waveA),
    memory: clampPercent(baseMem + waveB),
    neuralLoad: clampPercent(baseNeural + waveC),
  };
}

export function stepTelemetryHistory(
  history: TelemetrySample[],
  signals: ActivitySignals,
  phase: number,
  maxSamples = TELEMETRY_WINDOW_SIZE
): TelemetrySample[] {
  const target = computeTargetLoad(signals, phase);
  const prev = history[history.length - 1] ?? {
    seq: 0,
    cpu: target.cpu,
    memory: target.memory,
    neuralLoad: target.neuralLoad,
  };

  // Faster upward attack when workload spikes, smoother decay when returning to idle
  const cpuAlpha = target.cpu > prev.cpu ? 0.52 : 0.28;
  const memAlpha = target.memory > prev.memory ? 0.42 : 0.22;
  const neuralAlpha = target.neuralLoad > prev.neuralLoad ? 0.58 : 0.26;

  const next: TelemetrySample = {
    seq: prev.seq + 1,
    cpu: clampPercent(prev.cpu + (target.cpu - prev.cpu) * cpuAlpha),
    memory: clampPercent(prev.memory + (target.memory - prev.memory) * memAlpha),
    neuralLoad: clampPercent(
      prev.neuralLoad + (target.neuralLoad - prev.neuralLoad) * neuralAlpha
    ),
  };

  const updated = [...history, next];
  if (updated.length > maxSamples) {
    return updated.slice(updated.length - maxSamples);
  }
  return updated;
}

export function createInitialTelemetryHistory(
  signals: ActivitySignals,
  count = TELEMETRY_WINDOW_SIZE
): TelemetrySample[] {
  let history: TelemetrySample[] = [];
  for (let i = 0; i < count; i++) {
    history = stepTelemetryHistory(history, signals, i * 0.45, count);
  }
  return history;
}

export function summarizeTelemetry(
  history: TelemetrySample[],
  signals: ActivitySignals
): TelemetrySummary {
  const fallback: TelemetrySample = { seq: 0, cpu: 16, memory: 38, neuralLoad: 14 };
  if (history.length === 0) {
    return {
      latest: fallback,
      peakCpu: fallback.cpu,
      peakMemory: fallback.memory,
      peakNeural: fallback.neuralLoad,
      avgCpu: fallback.cpu,
      avgNeural: fallback.neuralLoad,
      workloadLabel: 'NOMINAL // STANDBY',
    };
  }

  const latest = history[history.length - 1];
  let peakCpu = 0;
  let peakMemory = 0;
  let peakNeural = 0;
  let sumCpu = 0;
  let sumNeural = 0;

  for (const s of history) {
    if (s.cpu > peakCpu) peakCpu = s.cpu;
    if (s.memory > peakMemory) peakMemory = s.memory;
    if (s.neuralLoad > peakNeural) peakNeural = s.neuralLoad;
    sumCpu += s.cpu;
    sumNeural += s.neuralLoad;
  }

  let workloadLabel = 'NOMINAL // STANDBY';
  if (signals.aiActive && signals.codeRunning) {
    workloadLabel = 'HYBRID // AI + SANDBOX';
  } else if (signals.aiActive) {
    workloadLabel = 'NEURAL CORE // STREAMING';
  } else if (signals.codeRunning) {
    workloadLabel = 'SANDBOX // EXECUTING';
  } else if (signals.scanActive) {
    workloadLabel = 'ARC-01 // TELEMETRY SCAN';
  } else if (signals.activeView === 'eco') {
    workloadLabel = 'BIO-DOME 04 // FLUID SIM';
  }

  return {
    latest,
    peakCpu: clampPercent(peakCpu),
    peakMemory: clampPercent(peakMemory),
    peakNeural: clampPercent(peakNeural),
    avgCpu: clampPercent(sumCpu / history.length),
    avgNeural: clampPercent(sumNeural / history.length),
    workloadLabel,
  };
}
