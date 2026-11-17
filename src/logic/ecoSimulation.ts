export interface EcoParams {
  /** 0 - 100 % */
  cohesion: number;
  /** 0.00 - 5.00 g/L */
  originium: number;
  /** 2.0 - 42.0 °C */
  temp: number;
  /** 0 - 12000 lx */
  light: number;
  /** 4.5 - 9.0 pH */
  ph: number;
  /** 0.0 - 3.0 x */
  simSpeed: number;
}

export type EcoPresetId = 'habitat' | 'clone' | 'frost' | 'overload';

export interface EcoPreset {
  id: EcoPresetId;
  label: string;
  params: EcoParams;
}

export interface EcoMetrics {
  stability: number;
  manifold: number;
  oxygen: number;
  severity: 'optimal' | 'warning' | 'critical';
  statusLabel: string;
  phaseLabel: string;
  note: string;
}

export interface SimulationSpeedSchedule {
  speedScale: number;
  targetFps: number;
  frameIntervalMs: number;
  isPaused: boolean;
}

export const ECO_PRESETS: EcoPreset[] = [
  {
    id: 'habitat',
    label: '标准精灵湿地',
    params: { cohesion: 72, originium: 0.45, temp: 21.5, light: 6800, ph: 7.1, simSpeed: 1.0 },
  },
  {
    id: 'clone',
    label: '流形拟态凝聚',
    params: { cohesion: 95, originium: 0.2, temp: 19.5, light: 5400, ph: 7.0, simSpeed: 1.0 },
  },
  {
    id: 'frost',
    label: '萨米极寒耐受',
    params: { cohesion: 82, originium: 0.6, temp: 3.8, light: 2800, ph: 6.9, simSpeed: 1.0 },
  },
  {
    id: 'overload',
    label: '源石过饱和警报',
    params: { cohesion: 28, originium: 3.85, temp: 36.5, light: 10800, ph: 5.2, simSpeed: 1.0 },
  },
];

export const ECO_BOUNDS = {
  cohesion: { min: 0, max: 100, step: 1 },
  originium: { min: 0, max: 5, step: 0.05 },
  temp: { min: 2, max: 42, step: 0.5 },
  light: { min: 0, max: 12000, step: 100 },
  ph: { min: 4.5, max: 9.0, step: 0.1 },
  simSpeed: { min: 0, max: 3.0, step: 0.1 },
} as const;

export function clampEcoParam<K extends keyof EcoParams>(key: K, value: number): number {
  const { min, max } = ECO_BOUNDS[key];
  const clamped = Math.max(min, Math.min(max, value));
  if (key === 'originium') return Math.round(clamped * 100) / 100;
  if (key === 'temp' || key === 'ph' || key === 'simSpeed') return Math.round(clamped * 10) / 10;
  return Math.round(clamped);
}

export function computeSpeedSchedule(simSpeed: number): SimulationSpeedSchedule {
  const clamped = clampEcoParam('simSpeed', simSpeed);
  if (clamped <= 0) {
    return {
      speedScale: 0,
      targetFps: 0,
      frameIntervalMs: Infinity,
      isPaused: true,
    };
  }
  const targetFps = Math.max(6, Math.min(60, Math.round(clamped * 45)));
  return {
    speedScale: clamped,
    targetFps,
    frameIntervalMs: 1000 / targetFps,
    isPaused: false,
  };
}

export function findMatchingEcoPreset(params: EcoParams): EcoPresetId | null {
  const match = ECO_PRESETS.find(
    (p) =>
      Math.abs(p.params.cohesion - params.cohesion) < 0.01 &&
      Math.abs(p.params.originium - params.originium) < 0.01 &&
      Math.abs(p.params.temp - params.temp) < 0.05 &&
      Math.abs(p.params.light - params.light) < 1 &&
      Math.abs(p.params.ph - params.ph) < 0.05
  );
  return match ? match.id : null;
}

export function computeEcoMetrics(params: EcoParams): EcoMetrics {
  const { cohesion, originium, temp, light, ph } = params;

  const tempPenalty = Math.abs(temp - 22) * 1.45;
  const phPenalty = Math.abs(ph - 7.1) * 14;
  const origPenalty = originium > 1.0 ? (originium - 1.0) * 16 : originium * 3;
  const lightPenalty =
    light < 2000
      ? (2000 - light) * 0.008
      : light > 10000
        ? (light - 10000) * 0.005
        : 0;

  const stability = Math.max(
    4,
    Math.min(100, 100 - tempPenalty - phPenalty - origPenalty - lightPenalty)
  );
  const manifoldRaw =
    cohesion * 0.92 +
    (100 - Math.min(100, originium * 18)) * 0.15 -
    Math.max(0, temp - 30) * 1.2;
  const manifold = Math.max(5, Math.min(100, manifoldRaw));
  const oxygenRaw =
    10.5 - (temp - 10) * 0.11 + (light / 12000) * 2.4 - originium * 0.85;
  const oxygen = Math.max(0.4, Math.min(14.5, oxygenRaw));

  let severity: EcoMetrics['severity'] = 'optimal';
  let statusLabel = '● 生态稳态 Optimal';
  let phaseLabel = 'MANIFOLD STATE: EQUILIBRIUM';
  let note =
    '“这片小小的水体就像特里蒙之外的缩影呢……保持流形凝聚与溶氧均衡，这些生命就会安静地舒展开来。”';

  if (originium >= 2.8) {
    severity = 'critical';
    statusLabel = '✖ 源石过饱和 Critical';
    phaseLabel = 'CRITICAL · ORIGINIUM OVERLOAD';
    note =
      '“唔……源石溶度太高了！水分子链正在被活性源石结晶撕裂，请立刻稀释溶液，不然样本会失活的。”';
  } else if (temp <= 6.0) {
    severity = 'warning';
    statusLabel = '▲ 低温晶格化 Warning';
    phaseLabel = 'PHASE: ICE CRYSTAL LATTICE';
    note =
      '“好冷……就像萨米科考站传回来的冰原水样。水分子开始晶格化了，我的流形展开速度变慢了不少呢。”';
  } else if (temp >= 34.0) {
    severity = 'warning';
    statusLabel = '▲ 高温热应激 Warning';
    phaseLabel = 'PHASE: HIGH VAPORIZATION';
    note =
      '“温度升得太快了，溶氧正在急剧下降！再这样下去我就要蒸发成水雾咯？”';
  } else if (ph < 5.6 || ph > 8.4) {
    severity = 'warning';
    statusLabel = '▲ 酸碱失衡 Warning';
    phaseLabel = 'MEMBRANE STRESS DETECTED';
    note =
      '“酸碱度偏离生理耐受带了。即使是适应力很强的湿地苔藓，在这种液相里也很难维持细胞膜完整呢。”';
  } else if (cohesion >= 88 && originium < 1.0) {
    severity = 'optimal';
    statusLabel = '● 流形拟态锁定 Optimal';
    phaseLabel = 'COHESIVE MANIFOLD · CLONE CORE';
    note =
      '“看，水分子已经聚合成稳定的「无形之形」核心了。只要保持这个共鸣频率，随时都能凝结出分身陪你聊天哦~”';
  } else if (cohesion <= 20) {
    severity = 'warning';
    statusLabel = '▲ 气溶弥散态 Warning';
    phaseLabel = 'PHASE: AEROSOL DIFFUSION';
    note =
      '“凝聚度降得很低呀……水分子正在向整个生物舱扩散成薄雾。呼，感觉轻飘飘的。”';
  }

  return { stability, manifold, oxygen, severity, statusLabel, phaseLabel, note };
}
