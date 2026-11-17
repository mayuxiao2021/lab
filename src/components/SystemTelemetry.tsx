import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Activity, Cpu, Pause, Play, X } from 'lucide-react';
import {
  createInitialTelemetryHistory,
  stepTelemetryHistory,
  summarizeTelemetry,
  type ActivitySignals,
  type TelemetrySample,
} from '../logic/systemTelemetry';

interface SystemTelemetryProps {
  signals: ActivitySignals;
  theme: 'light' | 'dark';
}

export const SystemTelemetry: React.FC<SystemTelemetryProps> = ({
  signals,
  theme,
}) => {
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState<TelemetrySample[]>(() =>
    createInitialTelemetryHistory(signals)
  );

  const signalsRef = useRef(signals);
  const phaseRef = useRef(12);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const miniSvgRef = useRef<SVGSVGElement | null>(null);
  const detailSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    signalsRef.current = signals;
    // Immediately sample on major activity bursts so UI responds without delay
    if (signals.aiActive || signals.codeRunning || signals.scanActive) {
      phaseRef.current += 0.55;
      setHistory((prev) =>
        stepTelemetryHistory(prev, signals, phaseRef.current)
      );
    }
  }, [signals]);

  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => {
      phaseRef.current += 0.48;
      setHistory((prev) =>
        stepTelemetryHistory(prev, signalsRef.current, phaseRef.current)
      );
    }, 650);
    return () => window.clearInterval(interval);
  }, [paused]);

  // Outside click / Escape dismissal for popover
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const summary = useMemo(
    () => summarizeTelemetry(history, signals),
    [history, signals]
  );

  // D3 Mini-Chart Render (TopBar inline sparkline)
  useEffect(() => {
    const svgEl = miniSvgRef.current;
    if (!svgEl || history.length < 2) return;

    const width = 84;
    const height = 24;
    const pad = 2;

    const isDark = theme === 'dark';
    const cpuColor = isDark ? '#F0622D' : '#E05320';
    const memColor = isDark ? '#4E8EC7' : '#2A6396';
    const neuralColor = isDark ? '#3FA67E' : '#2B7A5B';

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const xScale = d3
      .scaleLinear()
      .domain([0, history.length - 1])
      .range([pad, width - pad]);

    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([height - pad, pad]);

    // Subtle 50% baseline tick
    svg
      .append('line')
      .attr('x1', pad)
      .attr('x2', width - pad)
      .attr('y1', yScale(50))
      .attr('y2', yScale(50))
      .attr('stroke', isDark ? 'rgba(255,255,255,0.12)' : 'rgba(26,27,29,0.12)')
      .attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '2,2');

    const neuralArea = d3
      .area<TelemetrySample>()
      .x((_, i) => xScale(i))
      .y0(height - pad)
      .y1((d) => yScale(d.neuralLoad))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(history)
      .attr('d', neuralArea)
      .attr('fill', neuralColor)
      .attr('fill-opacity', 0.16);

    const makeLine = (accessor: (d: TelemetrySample) => number) =>
      d3
        .line<TelemetrySample>()
        .x((_, i) => xScale(i))
        .y((d) => yScale(accessor(d)))
        .curve(d3.curveMonotoneX);

    // Memory line
    svg
      .append('path')
      .datum(history)
      .attr('d', makeLine((d) => d.memory))
      .attr('fill', 'none')
      .attr('stroke', memColor)
      .attr('stroke-width', 1.2)
      .attr('stroke-opacity', 0.85);

    // CPU line
    svg
      .append('path')
      .datum(history)
      .attr('d', makeLine((d) => d.cpu))
      .attr('fill', 'none')
      .attr('stroke', cpuColor)
      .attr('stroke-width', 1.5);

    // Neural Load line
    svg
      .append('path')
      .datum(history)
      .attr('d', makeLine((d) => d.neuralLoad))
      .attr('fill', 'none')
      .attr('stroke', neuralColor)
      .attr('stroke-width', 1.5);
  }, [history, theme]);

  // D3 Detailed Popover Dashboard Chart Render
  useEffect(() => {
    if (!open) return;
    const svgEl = detailSvgRef.current;
    if (!svgEl || history.length < 2) return;

    const width = 344;
    const height = 132;
    const margin = { top: 10, right: 10, bottom: 18, left: 30 };

    const isDark = theme === 'dark';
    const cpuColor = isDark ? '#F0622D' : '#E05320';
    const memColor = isDark ? '#4E8EC7' : '#2A6396';
    const neuralColor = isDark ? '#3FA67E' : '#2B7A5B';
    const gridStroke = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(26,27,29,0.09)';
    const labelColor = isDark ? '#8E8B82' : '#6A6862';

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const xScale = d3
      .scaleLinear()
      .domain([0, history.length - 1])
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([height - margin.bottom, margin.top]);

    // Horizontal grid & percentage labels
    [0, 25, 50, 75, 100].forEach((tick) => {
      const y = yScale(tick);
      svg
        .append('line')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', gridStroke)
        .attr('stroke-width', 1);

      svg
        .append('text')
        .attr('x', margin.left - 5)
        .attr('y', y + 3)
        .attr('text-anchor', 'end')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '9px')
        .attr('fill', labelColor)
        .text(`${tick}%`);
    });

    const neuralArea = d3
      .area<TelemetrySample>()
      .x((_, i) => xScale(i))
      .y0(yScale(0))
      .y1((d) => yScale(d.neuralLoad))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(history)
      .attr('d', neuralArea)
      .attr('fill', neuralColor)
      .attr('fill-opacity', 0.14);

    const drawSeries = (
      accessor: (d: TelemetrySample) => number,
      color: string,
      strokeWidth: number
    ) => {
      const lineGen = d3
        .line<TelemetrySample>()
        .x((_, i) => xScale(i))
        .y((d) => yScale(accessor(d)))
        .curve(d3.curveMonotoneX);

      svg
        .append('path')
        .datum(history)
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', strokeWidth);

      const lastIdx = history.length - 1;
      svg
        .append('circle')
        .attr('cx', xScale(lastIdx))
        .attr('cy', yScale(accessor(history[lastIdx])))
        .attr('r', 3)
        .attr('fill', color);
    };

    drawSeries((d) => d.memory, memColor, 1.5);
    drawSeries((d) => d.cpu, cpuColor, 1.9);
    drawSeries((d) => d.neuralLoad, neuralColor, 1.9);

    svg
      .append('text')
      .attr('x', margin.left)
      .attr('y', height - 4)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '8.5px')
      .attr('fill', labelColor)
      .text('-18s');

    svg
      .append('text')
      .attr('x', width - margin.right)
      .attr('y', height - 4)
      .attr('text-anchor', 'end')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '8.5px')
      .attr('fill', labelColor)
      .text('NOW');
  }, [history, open, theme]);

  const isElevated =
    signals.aiActive || signals.codeRunning || signals.scanActive;

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      <button
        type="button"
        data-testid="system-telemetry"
        aria-expanded={open}
        aria-label="系统性能遥测 (System Telemetry)"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-2 px-2 py-1 border transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#E05320] ${
          open
            ? 'bg-[#1A1B1D] text-[#F3EFE6] border-[#1A1B1D] dark:bg-[#EAE6DC] dark:text-[#111315] dark:border-[#EAE6DC]'
            : 'bg-[#EAE5DA] dark:bg-[#1D2024] border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320] text-[#1A1B1D] dark:text-[#EAE6DC]'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              paused
                ? 'bg-[#8E8B82]'
                : isElevated
                  ? 'bg-[#E05320] animate-pulse'
                  : 'bg-[#2B7A5B] dark:bg-[#3FA67E]'
            }`}
          />
          <Activity className="w-3.5 h-3.5 shrink-0 xl:hidden" />
        </div>

        {/* Live D3 Mini Sparkline */}
        <svg
          ref={miniSvgRef}
          data-testid="telemetry-d3-minichart"
          width={84}
          height={24}
          viewBox="0 0 84 24"
          className="hidden sm:block w-[84px] h-[24px] shrink-0 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6]/80 dark:border-[#2E3136]"
          aria-hidden="true"
        />

        {/* Compact Live Readouts */}
        <div className="hidden xl:flex items-center gap-2 font-mono text-[10px] leading-none tabular-nums">
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] opacity-70">CPU</span>
            <span className="font-bold text-[#E05320] dark:text-[#F0622D]">
              {Math.round(summary.latest.cpu)}%
            </span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] opacity-70">MEM</span>
            <span className="font-bold text-[#2A6396] dark:text-[#4E8EC7]">
              {Math.round(summary.latest.memory)}%
            </span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] opacity-70">NEU</span>
            <span className="font-bold text-[#2B7A5B] dark:text-[#3FA67E]">
              {Math.round(summary.latest.neuralLoad)}%
            </span>
          </div>
        </div>
      </button>

      {/* Expanded System Telemetry Dashboard Popover */}
      {open && (
        <div
          data-testid="system-telemetry-panel"
          role="dialog"
          aria-label="System Telemetry 硬件与神经负载仪表板"
          className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full sm:mt-2 z-50 w-[calc(100vw-16px)] max-w-[380px] sm:w-[380px] bg-[#F3EFE6] dark:bg-[#15171A] border-2 border-[#1A1B1D] dark:border-[#EAE6DC] shadow-[8px_8px_0_rgba(0,0,0,0.18)] p-3.5 text-[#1A1B1D] dark:text-[#EAE6DC]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[#C8C2B6] dark:border-[#2E3136]">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#E05320]" />
              <span className="font-mono text-xs font-bold tracking-wider uppercase">
                SYSTEM TELEMETRY
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold border border-[#C8C2B6] dark:border-[#2E3136] bg-[#EAE5DA] dark:bg-[#1D2024] hover:border-[#E05320] cursor-pointer"
              >
                {paused ? (
                  <>
                    <Play className="w-2.5 h-2.5" />
                    <span>RESUME</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-2.5 h-2.5" />
                    <span>LIVE</span>
                  </>
                )}
              </button>
              <button
                type="button"
                aria-label="关闭遥测面板"
                onClick={() => setOpen(false)}
                className="p-0.5 border border-[#C8C2B6] dark:border-[#2E3136] hover:border-[#E05320] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Workload State Strip */}
          <div className="flex items-center justify-between px-2.5 py-1.5 mb-2.5 bg-[#EAE5DA] dark:bg-[#1D2024] border border-[#C8C2B6] dark:border-[#2E3136] font-mono text-[10px]">
            <span className="text-[#6A6862] dark:text-[#8E8B82]">ACTIVE WORKLOAD</span>
            <span
              className={`font-bold ${
                isElevated
                  ? 'text-[#E05320] dark:text-[#F0622D]'
                  : 'text-[#2B7A5B] dark:text-[#3FA67E]'
              }`}
            >
              {summary.workloadLabel}
            </span>
          </div>

          {/* 3 Hardware Readout Cards */}
          <div className="grid grid-cols-3 gap-2 mb-3 font-mono tabular-nums">
            <div className="p-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="text-[9.5px] text-[#6A6862] dark:text-[#8E8B82]">CPU</div>
              <div
                data-testid="telemetry-cpu-val"
                className="text-sm font-bold text-[#E05320] dark:text-[#F0622D]"
              >
                {summary.latest.cpu.toFixed(1)}%
              </div>
              <div className="w-full h-1 bg-[#EAE5DA] dark:bg-[#1D2024] mt-1">
                <div
                  className="h-full bg-[#E05320] dark:bg-[#F0622D]"
                  style={{ width: `${Math.round(summary.latest.cpu)}%` }}
                />
              </div>
              <div className="text-[9px] text-[#6A6862] dark:text-[#8E8B82] mt-1">
                PEAK {summary.peakCpu.toFixed(0)}%
              </div>
            </div>

            <div className="p-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="text-[9.5px] text-[#6A6862] dark:text-[#8E8B82]">MEMORY</div>
              <div
                data-testid="telemetry-mem-val"
                className="text-sm font-bold text-[#2A6396] dark:text-[#4E8EC7]"
              >
                {summary.latest.memory.toFixed(1)}%
              </div>
              <div className="w-full h-1 bg-[#EAE5DA] dark:bg-[#1D2024] mt-1">
                <div
                  className="h-full bg-[#2A6396] dark:bg-[#4E8EC7]"
                  style={{ width: `${Math.round(summary.latest.memory)}%` }}
                />
              </div>
              <div className="text-[9px] text-[#6A6862] dark:text-[#8E8B82] mt-1">
                PEAK {summary.peakMemory.toFixed(0)}%
              </div>
            </div>

            <div className="p-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
              <div className="text-[9.5px] text-[#6A6862] dark:text-[#8E8B82]">NEURAL</div>
              <div
                data-testid="telemetry-neural-val"
                className="text-sm font-bold text-[#2B7A5B] dark:text-[#3FA67E]"
              >
                {summary.latest.neuralLoad.toFixed(1)}%
              </div>
              <div className="w-full h-1 bg-[#EAE5DA] dark:bg-[#1D2024] mt-1">
                <div
                  className="h-full bg-[#2B7A5B] dark:bg-[#3FA67E]"
                  style={{ width: `${Math.round(summary.latest.neuralLoad)}%` }}
                />
              </div>
              <div className="text-[9px] text-[#6A6862] dark:text-[#8E8B82] mt-1">
                PEAK {summary.peakNeural.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Detailed D3 Multi-Series Chart */}
          <div className="p-2 bg-[#F8F5EE] dark:bg-[#111315] border border-[#C8C2B6] dark:border-[#2E3136]">
            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
              <span className="font-semibold">D3 TELEMETRY STREAM (28 SAMPLES)</span>
              <span className="flex items-center gap-2 text-[9.5px]">
                <span className="text-[#E05320] dark:text-[#F0622D]">● CPU</span>
                <span className="text-[#2A6396] dark:text-[#4E8EC7]">● MEM</span>
                <span className="text-[#2B7A5B] dark:text-[#3FA67E]">● NEU</span>
              </span>
            </div>
            <svg
              ref={detailSvgRef}
              width={344}
              height={132}
              viewBox="0 0 344 132"
              className="w-full h-[132px] block"
            />
          </div>
        </div>
      )}
    </div>
  );
};
