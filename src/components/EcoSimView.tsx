import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Waves, Terminal } from 'lucide-react';
import {
  ECO_BOUNDS,
  ECO_PRESETS,
  clampEcoParam,
  computeEcoMetrics,
  computeSpeedSchedule,
  type EcoParams,
  type EcoPresetId,
} from '../logic/ecoSimulation';

interface EcoSimViewProps {
  params: EcoParams;
  activePreset: EcoPresetId | null;
  theme: 'light' | 'dark';
  onChangeParam: <K extends keyof EcoParams>(key: K, value: number) => void;
  onApplyPreset: (presetId: EcoPresetId) => void;
  onSyncToTerminal: () => void;
}

interface WaterNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface FloraSpore {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
}

interface FluidRipple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
}

interface SliderConfig {
  key: keyof EcoParams;
  id: string;
  label: string;
  subLabel: string;
  minLabel: string;
  midLabel: string;
  maxLabel: string;
  isDangerSlider?: boolean;
  formatValue: (v: number) => string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'cohesion',
    id: 'slider-cohesion',
    label: '流形凝聚度',
    subLabel: 'Manifold Cohesion',
    minLabel: '0% 气溶弥散',
    midLabel: '50% 自由液相',
    maxLabel: '100% 拟态核心',
    formatValue: (v) => `${Math.round(v)}%`,
  },
  {
    key: 'originium',
    id: 'slider-originium',
    label: '源石微粒溶度',
    subLabel: 'Originium Solute',
    minLabel: '0.00 纯净',
    midLabel: '2.00 临界',
    maxLabel: '5.00 g/L 重度结晶',
    isDangerSlider: true,
    formatValue: (v) => `${v.toFixed(2)} g/L`,
  },
  {
    key: 'temp',
    id: 'slider-temp',
    label: '恒温舱温度',
    subLabel: 'Thermal Gradient',
    minLabel: '2.0°C 冰封',
    midLabel: '22.0°C 适宜',
    maxLabel: '42.0°C 热应激',
    formatValue: (v) => `${v.toFixed(1)} °C`,
  },
  {
    key: 'light',
    id: 'slider-light',
    label: '仿生光照通量',
    subLabel: 'Photoperiod',
    minLabel: '0 lx 暗相',
    midLabel: '6,000 lx 林冠',
    maxLabel: '12,000 lx 强光合',
    formatValue: (v) => `${Math.round(v).toLocaleString()} lx`,
  },
  {
    key: 'ph',
    id: 'slider-ph',
    label: '液相酸碱度',
    subLabel: 'pH Balance',
    minLabel: '4.5 强酸',
    midLabel: '7.0 中性',
    maxLabel: '9.0 强碱',
    formatValue: (v) => `pH ${v.toFixed(1)}`,
  },
  {
    key: 'simSpeed',
    id: 'slider-simSpeed',
    label: '模拟速率',
    subLabel: 'Simulation Speed',
    minLabel: '0.0x 暂停',
    midLabel: '1.0x 标准',
    maxLabel: '3.0x 加速',
    formatValue: (v) => `${v.toFixed(1)}x`,
  },
];

export const EcoSimView: React.FC<EcoSimViewProps> = ({
  params,
  activePreset,
  theme,
  onChangeParam,
  onApplyPreset,
  onSyncToTerminal,
}) => {
  const metrics = useMemo(() => computeEcoMetrics(params), [params]);
  const speedSchedule = useMemo(
    () => computeSpeedSchedule(params.simSpeed),
    [params.simSpeed]
  );

  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparkCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const paramsRef = useRef(params);
  const metricsRef = useRef(metrics);
  const themeRef = useRef(theme);
  const sizeRef = useRef({ width: 540, height: 340 });
  const nodesRef = useRef<WaterNode[]>([]);
  const sporesRef = useRef<FloraSpore[]>([]);
  const ripplesRef = useRef<FluidRipple[]>([]);
  const stabilityHistoryRef = useRef<number[]>(new Array(48).fill(94));
  const pointerDownRef = useRef(false);

  const speedScheduleRef = useRef(speedSchedule);
  const needsStaticRedrawRef = useRef(true);

  const [pointerCoords, setPointerCoords] = useState<{ x: number; y: number } | null>(null);
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    paramsRef.current = params;
    metricsRef.current = metrics;
    speedScheduleRef.current = speedSchedule;
    needsStaticRedrawRef.current = true;
  }, [params, metrics, speedSchedule]);

  useEffect(() => {
    themeRef.current = theme;
    needsStaticRedrawRef.current = true;
  }, [theme]);

  const initParticles = (w: number, h: number) => {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.max(50, Math.min(w, h) * 0.34);
    const nodes: WaterNode[] = [];
    for (let i = 0; i < 58; i++) {
      const angle = (i / 58) * Math.PI * 2;
      const dist = 16 + Math.random() * maxR;
      nodes.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 1.1,
        vy: (Math.random() - 0.5) * 1.1,
        r: 4 + Math.random() * 4.2,
      });
    }
    const spores: FloraSpore[] = [];
    for (let i = 0; i < 38; i++) {
      spores.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        size: 1.5 + Math.random() * 2.4,
        seed: Math.random() * 10,
      });
    }
    nodesRef.current = nodes;
    sporesRef.current = spores;
  };

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const syncSize = () => {
      const rect = frame.getBoundingClientRect();
      if (rect.width > 16 && rect.height > 16) {
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        const changed =
          Math.abs(sizeRef.current.width - w) > 2 ||
          Math.abs(sizeRef.current.height - h) > 2;
        sizeRef.current = { width: w, height: h };
        canvas.width = w;
        canvas.height = h;
        if (nodesRef.current.length === 0 || changed) {
          initParticles(w, h);
        }
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let tick = 0;
    let lastFrameTime = 0;
    let stepCount = 0;

    const drawSparkline = (isDark: boolean) => {
      const sc = sparkCanvasRef.current;
      if (!sc) return;
      const sctx = sc.getContext('2d');
      if (!sctx) return;
      const sw = sc.width;
      const sh = sc.height;
      sctx.clearRect(0, 0, sw, sh);

      sctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26,27,29,0.08)';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(0, sh / 2);
      sctx.lineTo(sw, sh / 2);
      sctx.stroke();

      const hist = stabilityHistoryRef.current;
      const latest = hist[hist.length - 1];
      sctx.strokeStyle =
        latest > 75
          ? isDark
            ? '#3FA67E'
            : '#2B7A5B'
          : latest > 45
            ? '#DDA027'
            : '#E05320';
      sctx.lineWidth = 1.8;
      sctx.beginPath();
      hist.forEach((val, idx) => {
        const x = (idx / (hist.length - 1)) * sw;
        const y = sh - (val / 100) * (sh - 6) - 3;
        if (idx === 0) sctx.moveTo(x, y);
        else sctx.lineTo(x, y);
      });
      sctx.stroke();
    };

    const renderFrame = (now: number) => {
      const sched = speedScheduleRef.current;
      const shouldAdvance =
        !sched.isPaused &&
        (lastFrameTime === 0 || now - lastFrameTime >= sched.frameIntervalMs);

      if (!shouldAdvance && !needsStaticRedrawRef.current) {
        rafId = window.requestAnimationFrame(renderFrame);
        return;
      }

      if (shouldAdvance) {
        lastFrameTime = now;
        stepCount += 1;
      }
      needsStaticRedrawRef.current = false;

      const stepScale = shouldAdvance ? sched.speedScale : 0;
      tick += 0.03 * stepScale;
      const { width: w, height: h } = sizeRef.current;
      if (w > 16 && h > 16) {
        const isDark = themeRef.current === 'dark';
        const p = paramsRef.current;
        const m = metricsRef.current;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.41;

        ctx.clearRect(0, 0, w, h);

        // Engineering Grid
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,27,29,0.05)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 32) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
          ctx.stroke();
        }
        for (let gy = 0; gy < h; gy += 32) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
          ctx.stroke();
        }

        // Containment Rings & Calibration Ticks
        ctx.strokeStyle = isDark ? 'rgba(234,230,220,0.28)' : 'rgba(26,27,29,0.24)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let a = 0; a < 24; a++) {
          const ang = (a / 24) * Math.PI * 2;
          const r1 = radius - 4;
          const r2 = radius + (a % 6 === 0 ? 8 : 4);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
          ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
          ctx.stroke();
        }

        // Ambient Bio-Light Glow
        const lightRatio = p.light / 12000;
        const origRatio = Math.min(1, p.originium / 4.0);
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
        if (origRatio > 0.6) {
          grad.addColorStop(0, `rgba(224, 83, 32, ${0.18 + origRatio * 0.18})`);
        } else if (p.temp < 7) {
          grad.addColorStop(0, `rgba(110, 190, 235, ${0.16 + lightRatio * 0.14})`);
        } else {
          grad.addColorStop(0, `rgba(43, 165, 145, ${0.1 + lightRatio * 0.2})`);
        }
        grad.addColorStop(1, 'rgba(42, 99, 150, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Ripples
        const ripples = ripplesRef.current;
        for (let i = ripples.length - 1; i >= 0; i--) {
          const rp = ripples[i];
          if (stepScale > 0) {
            rp.r += 2.6 * stepScale;
            rp.alpha *= Math.pow(0.96, stepScale);
          }
          ctx.strokeStyle = `rgba(58, 194, 212, ${rp.alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
          ctx.stroke();
          if (rp.r >= rp.maxR || rp.alpha < 0.04) ripples.splice(i, 1);
        }

        // Flowing Shape Water-Manifold Nodes & Hydrogen Bonds
        const cohesionFactor = p.cohesion / 100;
        const thermalNoise = (p.temp / 42) * 0.55;
        const baseShell = (1 - cohesionFactor) * (radius * 0.72) + 12;
        const nodeColor =
          origRatio > 0.65
            ? isDark
              ? '#F0622D'
              : '#E05320'
            : p.temp < 7
              ? '#76C7E8'
              : isDark
                ? '#3AC2D4'
                : '#1F8A9C';

        const nodes = nodesRef.current;
        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const dx = cx - n.x;
          const dy = cy - n.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ang = Math.atan2(n.y - cy, n.x - cx);

          if (stepScale > 0) {
            // Organic multi-lobe harmonic modulation so fluid forms a living flowing shape
            const lobeOffset =
              Math.sin(ang * 3 + tick * 1.1) * (10 + cohesionFactor * 14) +
              Math.cos(ang * 2 - tick * 0.8) * 8;
            const nodeTargetR = Math.max(
              6,
              baseShell * (0.45 + (i % 5) * 0.14) + lobeOffset
            );
            const pull = (dist - nodeTargetR) * (0.008 + cohesionFactor * 0.025);
            const forceScale = Math.min(2.0, stepScale);
            n.vx +=
              ((dx / dist) * pull -
                (dy / dist) * 0.045 * (0.4 + cohesionFactor) +
                (Math.random() - 0.5) * thermalNoise) *
              forceScale;
            n.vy +=
              ((dy / dist) * pull +
                (dx / dist) * 0.045 * (0.4 + cohesionFactor) +
                (Math.random() - 0.5) * thermalNoise) *
              forceScale;

            const baseDamp = p.temp < 7 ? 0.86 : 0.93;
            const damp = Math.pow(baseDamp, Math.min(2.2, stepScale));
            n.vx *= damp;
            n.vy *= damp;
            n.x += n.vx * stepScale;
            n.y += n.vy * stepScale;

            const postDist = Math.hypot(n.x - cx, n.y - cy);
            if (postDist > radius - 8) {
              n.x = cx + ((n.x - cx) / postDist) * (radius - 8);
              n.y = cy + ((n.y - cy) / postDist) * (radius - 8);
              n.vx *= -0.5;
              n.vy *= -0.5;
            }
          }

          const linkDist = 36 + cohesionFactor * 34;
          for (let j = i + 1; j < nodes.length; j++) {
            const mNode = nodes[j];
            const d2 = Math.hypot(n.x - mNode.x, n.y - mNode.y);
            if (d2 < linkDist) {
              const alpha = (1 - d2 / linkDist) * (0.2 + cohesionFactor * 0.55);
              ctx.strokeStyle =
                origRatio > 0.65
                  ? `rgba(224, 83, 32, ${alpha})`
                  : `rgba(42, 165, 175, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(mNode.x, mNode.y);
              ctx.stroke();
            }
          }
        }

        nodes.forEach((n) => {
          ctx.fillStyle = nodeColor;
          ctx.globalAlpha = 0.55 + cohesionFactor * 0.35;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * (0.7 + cohesionFactor * 0.45), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Flora Spores / Originium Crystals
        sporesRef.current.forEach((s) => {
          if (stepScale > 0) {
            s.x += (s.vx + Math.sin(tick + s.seed) * 0.25) * stepScale;
            s.y += (s.vy + Math.cos(tick + s.seed) * 0.25) * stepScale;
            if (Math.hypot(s.x - cx, s.y - cy) > radius - 10) {
              s.vx *= -1;
              s.vy *= -1;
              s.x = cx + (s.x - cx) * 0.92;
              s.y = cy + (s.y - cy) * 0.92;
            }
          }
          if (origRatio > 0.55 && s.seed > 5) {
            ctx.fillStyle = '#E05320';
            ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
          } else {
            ctx.fillStyle = `rgba(63, 186, 130, ${(m.stability / 100) * (0.3 + lightRatio * 0.7)})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Update sparkline periodically
        if (shouldAdvance && stepCount % 12 === 0) {
          stabilityHistoryRef.current.push(m.stability);
          if (stabilityHistoryRef.current.length > 48) {
            stabilityHistoryRef.current.shift();
          }
          drawSparkline(isDark);
        } else if (stepCount === 0) {
          drawSparkline(isDark);
        }
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const spawnRipple = (clientX: number, clientY: number, strength = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setPointerCoords({ x: Math.round(x), y: Math.round(y) });
    needsStaticRedrawRef.current = true;
    ripplesRef.current.push({ x, y, r: 4, maxR: 130 * strength, alpha: 0.9 });
    nodesRef.current.forEach((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 130) {
        const force = ((130 - d) / 130) * 3.6 * strength;
        n.vx += (dx / d) * force;
        n.vy += (dy / d) * force;
      }
    });
  };

  const triggerPulseWave = () => {
    needsStaticRedrawRef.current = true;
    const { width: w, height: h } = sizeRef.current;
    ripplesRef.current.push({
      x: w / 2,
      y: h / 2,
      r: 8,
      maxR: Math.min(w, h) * 0.48,
      alpha: 1,
    });
    nodesRef.current.forEach((n) => {
      const dx = n.x - w / 2;
      const dy = n.y - h / 2;
      const d = Math.hypot(dx, dy) || 1;
      n.vx += (dx / d) * 4.5;
      n.vy += (dy / d) * 4.5;
    });
    setPulseCount((c) => c + 1);
  };

  const severityColor =
    metrics.severity === 'optimal'
      ? 'text-[#2B7A5B] dark:text-[#3FA67E]'
      : metrics.severity === 'warning'
        ? 'text-[#B47811] dark:text-[#EAB33A]'
        : 'text-[#C83232] dark:text-[#E54D4D]';

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#F8F5EE] dark:bg-[#111315] text-[#1A1B1D] dark:text-[#EAE6DC]">
      {/* Lab Top Strip with Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#EAE5DA] dark:bg-[#1D2024] border-b border-[#C8C2B6] dark:border-[#2E3136] shrink-0">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="font-bold tracking-wide text-[#2B7A5B] dark:text-[#3FA67E]">
            Bio-Dome 04
          </span>
          <span className="text-[#6A6862] dark:text-[#8E8B82]" aria-hidden="true">
            ·
          </span>
          <span className="font-semibold">缪尔赛斯流形与微生态模拟舱</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="实验参数预设">
          {ECO_PRESETS.map((preset) => {
            const isAct = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onApplyPreset(preset.id);
                  triggerPulseWave();
                }}
                aria-pressed={isAct}
                className={`px-2.5 py-1.5 text-xs font-mono border transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2B7A5B] ${
                  isAct
                    ? 'bg-[#2B7A5B] text-white border-[#2B7A5B] dark:bg-[#3FA67E] dark:text-[#0D0E10] dark:border-[#3FA67E] font-semibold'
                    : 'bg-[#F3EFE6] dark:bg-[#15171A] text-[#1A1B1D] dark:text-[#EAE6DC] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#2B7A5B]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Simulation Viewport & Parameter Console */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto xl:grid xl:grid-cols-[1.2fr_1fr] xl:overflow-hidden">
        {/* Left: Interactive Canvas + Muelsyse Observation */}
        <div className="flex flex-col gap-3 p-3 sm:p-4 border-b xl:border-b-0 xl:border-r border-[#C8C2B6] dark:border-[#2E3136] shrink-0 xl:shrink xl:min-h-0">
          <div
            ref={frameRef}
            data-testid="eco-chamber-frame"
            data-pulse-count={pulseCount}
            data-sim-speed={params.simSpeed.toFixed(1)}
            data-target-fps={speedSchedule.targetFps}
            className="relative h-[250px] shrink-0 xl:h-auto xl:flex-1 xl:min-h-[260px] bg-[#F3EFE6] dark:bg-[#15171A] border border-[#1A1B1D] dark:border-[#EAE6DC] overflow-hidden cursor-crosshair select-none"
          >
            <canvas
              ref={canvasRef}
              data-testid="eco-chamber-canvas"
              className="w-full h-full block touch-none"
              onPointerDown={(e) => {
                pointerDownRef.current = true;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore in synthetic environments
                }
                spawnRipple(e.clientX, e.clientY, 1.15);
              }}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPointerCoords({
                  x: Math.round(e.clientX - rect.left),
                  y: Math.round(e.clientY - rect.top),
                });
                if (pointerDownRef.current && Math.random() < 0.45) {
                  spawnRipple(e.clientX, e.clientY, 0.75);
                }
              }}
              onPointerUp={() => {
                pointerDownRef.current = false;
              }}
              onPointerCancel={() => {
                pointerDownRef.current = false;
              }}
              onPointerLeave={() => {
                pointerDownRef.current = false;
                setPointerCoords(null);
              }}
            />

            <div className="absolute top-2.5 left-3 pointer-events-none font-mono text-[11px] leading-snug text-[#6A6862] dark:text-[#8E8B82]">
              <div>点击或拖拽液相可注入流形扰动</div>
              {pointerCoords && (
                <div className="tabular-nums text-[#1F8A9C] dark:text-[#3AC2D4]">
                  X: {pointerCoords.x} · Y: {pointerCoords.y}
                </div>
              )}
            </div>

            <div
              data-testid="hud-speed"
              className="absolute top-2.5 right-3 pointer-events-none font-mono text-[11px] tabular-nums font-semibold text-[#1A1B1D] dark:text-[#EAE6DC]"
            >
              {speedSchedule.isPaused
                ? 'PAUSED · 0.0x'
                : `${params.simSpeed.toFixed(1)}x · ${speedSchedule.targetFps} FPS`}
            </div>

            <div className="absolute bottom-2.5 right-3 pointer-events-none font-mono text-[11px] font-semibold text-[#1F8A9C] dark:text-[#3AC2D4]">
              {metrics.phaseLabel}
            </div>
          </div>

          {/* Muelsyse Observation Card */}
          <div className="p-3.5 bg-[#F3EFE6] dark:bg-[#15171A] border border-[#C8C2B6] dark:border-[#2E3136]">
            <div className="flex items-center justify-between gap-2 text-xs font-mono mb-1.5">
              <span className="font-semibold text-[#2B7A5B] dark:text-[#3FA67E]">
                生态科主任 · 缪尔赛斯观察记录
              </span>
              <span className={`font-semibold ${severityColor}`}>{metrics.statusLabel}</span>
            </div>
            <p className="text-xs sm:text-[13px] leading-relaxed text-[#1A1B1D] dark:text-[#EAE6DC]">
              {metrics.note}
            </p>
          </div>
        </div>

        {/* Right: KPI Metrics + 5 Precision Sliders + Sparkline + Actions */}
        <div className="flex flex-col gap-2 p-3.5 bg-[#F3EFE6] dark:bg-[#15171A] xl:overflow-y-auto">
          {/* KPI Strip */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="px-2.5 py-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="text-[11px] text-[#6A6862] dark:text-[#8E8B82]">生态稳定性</div>
              <div
                data-testid="kpi-stability"
                className={`text-base font-mono font-bold tabular-nums mt-0.5 ${severityColor}`}
              >
                {metrics.stability.toFixed(1)}%
              </div>
            </div>
            <div className="px-2.5 py-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="text-[11px] text-[#6A6862] dark:text-[#8E8B82]">流形拟态度</div>
              <div
                data-testid="kpi-manifold"
                className="text-base font-mono font-bold tabular-nums mt-0.5 text-[#1F8A9C] dark:text-[#3AC2D4]"
              >
                {metrics.manifold.toFixed(1)}%
              </div>
            </div>
            <div className="px-2.5 py-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="text-[11px] text-[#6A6862] dark:text-[#8E8B82]">溶解氧 (DO)</div>
              <div
                data-testid="kpi-oxygen"
                className="text-base font-mono font-bold tabular-nums mt-0.5 text-[#2A6396] dark:text-[#4E8EC7]"
              >
                {metrics.oxygen.toFixed(1)} mg/L
              </div>
            </div>
          </div>

          {/* 6 Precision Parameter Sliders (2x3 console grid on sm+) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            {SLIDER_CONFIGS.map((cfg) => {
              const bounds = ECO_BOUNDS[cfg.key];
              const val = params[cfg.key];
              return (
                <div
                  key={cfg.key}
                  className="px-2.5 py-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]"
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <label htmlFor={cfg.id} className="text-xs font-semibold truncate">
                      {cfg.label}
                    </label>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`减小${cfg.label}`}
                        onClick={() =>
                          onChangeParam(
                            cfg.key,
                            clampEcoParam(cfg.key, val - bounds.step)
                          )
                        }
                        className="w-5 h-5 flex items-center justify-center border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#1A1B1D] dark:hover:border-[#EAE6DC] cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <span
                        data-testid={`val-${cfg.key}`}
                        className={`min-w-[58px] text-right font-mono text-xs font-bold tabular-nums ${
                          cfg.isDangerSlider && val >= 2.8
                            ? 'text-[#E05320] dark:text-[#F0622D]'
                            : 'text-[#2B7A5B] dark:text-[#3FA67E]'
                        }`}
                      >
                        {cfg.formatValue(val)}
                      </span>

                      <button
                        type="button"
                        aria-label={`增加${cfg.label}`}
                        onClick={() =>
                          onChangeParam(
                            cfg.key,
                            clampEcoParam(cfg.key, val + bounds.step)
                          )
                        }
                        className="w-5 h-5 flex items-center justify-center border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#1A1B1D] dark:hover:border-[#EAE6DC] cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <input
                    id={cfg.id}
                    type="range"
                    min={bounds.min}
                    max={bounds.max}
                    step={bounds.step}
                    value={val}
                    onChange={(e) =>
                      onChangeParam(
                        cfg.key,
                        clampEcoParam(cfg.key, Number(e.target.value))
                      )
                    }
                    className={`rl-slider ${cfg.isDangerSlider ? 'rl-slider-orange' : ''}`}
                  />

                  <div className="flex justify-between text-[10px] font-mono text-[#6A6862] dark:text-[#8E8B82] mt-1">
                    <span>{cfg.minLabel}</span>
                    <span className="hidden 2xl:inline">{cfg.midLabel}</span>
                    <span>{cfg.maxLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stability Trend Sparkline */}
          <div className="px-2.5 py-1.5 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136] shrink-0">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#6A6862] dark:text-[#8E8B82] mb-1">
              <span>稳定性实时趋势曲线</span>
              <span>● 采样中</span>
            </div>
            <canvas
              ref={sparkCanvasRef}
              width={320}
              height={32}
              className="w-full h-[32px] block"
            />
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-auto pt-0.5 shrink-0">
            <button
              type="button"
              onClick={triggerPulseWave}
              className="flex items-center justify-center gap-2 px-3 py-2 border border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#EAE5DA] dark:bg-[#1D2024] hover:bg-[#2B7A5B] hover:text-white hover:border-[#2B7A5B] dark:hover:bg-[#3FA67E] dark:hover:text-[#0D0E10] text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              <Waves className="w-3.5 h-3.5" />
              <span>注入共振脉冲</span>
            </button>
            <button
              type="button"
              onClick={onSyncToTerminal}
              className="flex items-center justify-center gap-2 px-3 py-2 border border-[#1A1B1D] dark:border-[#EAE6DC] bg-[#1A1B1D] dark:bg-[#EAE6DC] text-[#F3EFE6] dark:text-[#111315] hover:bg-[#E05320] hover:border-[#E05320] hover:text-white dark:hover:bg-[#F0622D] dark:hover:border-[#F0622D] dark:hover:text-white text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>同步报告至终端</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
