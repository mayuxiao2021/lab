import { transform as sucraseTransform } from 'sucrase';
import { clampEcoParam, type EcoParams } from './ecoSimulation';

export interface PlotPoint {
  x: number;
  y: number;
}

export interface PlotSeries {
  title: string;
  points: PlotPoint[];
}

export interface SandboxExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  plots: PlotSeries[];
  tables: Record<string, unknown>[][];
  updatedEcoParams?: Partial<EcoParams>;
}

export interface EcoBridgeContext {
  getParams: () => EcoParams;
  onSetParams: (patch: Partial<EcoParams>) => void;
}

function formatArg(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean' || val === null || val === undefined) {
    return String(val);
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export async function executeBrowserScript(
  code: string,
  ecoBridge: EcoBridgeContext
): Promise<SandboxExecutionResult> {
  const start = performance.now();
  const logs: string[] = [];
  const errors: string[] = [];
  const plots: PlotSeries[] = [];
  const tables: Record<string, unknown>[][] = [];
  let appliedPatch: Partial<EcoParams> | undefined;

  const customConsole = {
    log: (...args: unknown[]) => {
      const line = args.map(formatArg).join(' ');
      if (line.startsWith('__RHINE_PLOT__:')) {
        try {
          const parsed = JSON.parse(line.slice('__RHINE_PLOT__:'.length)) as PlotSeries;
          if (parsed && Array.isArray(parsed.points)) {
            plots.push(parsed);
            return;
          }
        } catch {
          // Fall through to regular log
        }
      }
      logs.push(line);
    },
    warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(formatArg).join(' ')}`),
    error: (...args: unknown[]) => errors.push(args.map(formatArg).join(' ')),
    table: (rows: unknown) => {
      if (Array.isArray(rows)) {
        tables.push(rows as Record<string, unknown>[]);
      } else {
        logs.push(formatArg(rows));
      }
    },
  };

  const rhineApi = {
    eco: {
      getParams: () => ({ ...ecoBridge.getParams() }),
      setParams: (patch: Partial<EcoParams>) => {
        const sanitized: Partial<EcoParams> = {};
        (Object.keys(patch) as (keyof EcoParams)[]).forEach((key) => {
          const v = patch[key];
          if (typeof v === 'number' && Number.isFinite(v)) {
            sanitized[key] = clampEcoParam(key, v);
          }
        });
        appliedPatch = { ...(appliedPatch ?? {}), ...sanitized };
        ecoBridge.onSetParams(sanitized);
        return { ...ecoBridge.getParams(), ...sanitized };
      },
    },
    plot: (title: string, points: PlotPoint[]) => {
      if (Array.isArray(points)) {
        plots.push({
          title: String(title || 'Telemetry Series'),
          points: points
            .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
            .slice(0, 500),
        });
      }
    },
    table: (rows: Record<string, unknown>[]) => {
      if (Array.isArray(rows)) {
        tables.push(rows.slice(0, 100));
      }
    },
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (consoleArg: typeof customConsole, rhineArg: typeof rhineApi) => Promise<unknown>;

    const runner = new AsyncFunction('console', 'rhine', `"use strict";\n${code}`);
    const returnValue = await runner(customConsole, rhineApi);
    if (returnValue !== undefined) {
      logs.push(`=> ${formatArg(returnValue)}`);
    }

    return {
      ok: errors.length === 0,
      stdout: logs.join('\n'),
      stderr: errors.join('\n'),
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      plots,
      tables,
      updatedEcoParams: appliedPatch,
    };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return {
      ok: false,
      stdout: logs.join('\n'),
      stderr: [...errors, message].filter(Boolean).join('\n'),
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      plots,
      tables,
      updatedEcoParams: appliedPatch,
    };
  }
}

/**
 * Transpiles TypeScript to plain JavaScript via Sucrase and runs it in the local browser sandbox.
 */
export async function executeLocalTypeScript(
  code: string,
  ecoBridge: EcoBridgeContext
): Promise<SandboxExecutionResult> {
  try {
    const { code: compiledJs } = sucraseTransform(code, {
      transforms: ['typescript'],
    });
    const runnableJs = compiledJs.replace(
      /^\s*export\s+(?=(?:async\s+)?function\b|class\b|const\b|let\b|var\b|enum\b)/gm,
      ''
    );
    return await executeBrowserScript(runnableJs, ecoBridge);
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      durationMs: 0,
      plots: [],
      tables: [],
    };
  }
}

interface PyodideRuntime {
  globals: {
    set: (name: string, value: unknown) => void;
    delete: (name: string) => void;
  };
  runPythonAsync: (code: string) => Promise<unknown>;
}

let pyodideInstancePromise: Promise<PyodideRuntime> | null = null;

async function getBundledPyodide(): Promise<PyodideRuntime> {
  if (pyodideInstancePromise) return pyodideInstancePromise;
  if (typeof window === 'undefined') {
    throw new Error('Pyodide WASM runtime is only available in browser / Android WebView.');
  }
  pyodideInstancePromise = (async () => {
    const origin = window.location.origin;
    const pyodideEntry = new URL('/pyodide/pyodide.mjs', origin).href;
    const indexURL = new URL('/pyodide/', origin).href;
    const mod = (await import(/* @vite-ignore */ pyodideEntry)) as {
      loadPyodide: (opts: { indexURL: string }) => Promise<PyodideRuntime>;
    };
    return await mod.loadPyodide({ indexURL });
  })().catch((err) => {
    pyodideInstancePromise = null;
    throw err;
  });
  return pyodideInstancePromise;
}

/**
 * Executes Python 3 code locally offline using the Pyodide WebAssembly runtime bundled inside /pyodide/.
 */
export async function executeLocalPython(
  code: string,
  stdin = ''
): Promise<SandboxExecutionResult> {
  const start = performance.now();
  try {
    const pyodide = await getBundledPyodide();
    pyodide.globals.set('__rhine_user_code__', code);
    pyodide.globals.set('__rhine_user_stdin__', stdin);
    const serialized = (await pyodide.runPythonAsync(`
import sys, io, json, traceback
_rhine_old_stdin = sys.stdin
_rhine_old_stdout = sys.stdout
_rhine_old_stderr = sys.stderr
_rhine_out = io.StringIO()
_rhine_err = io.StringIO()
sys.stdin = io.StringIO(__rhine_user_stdin__)
sys.stdout = _rhine_out
sys.stderr = _rhine_err
_rhine_ok = True
try:
    exec(compile(__rhine_user_code__, "<rhine_sandbox.py>", "exec"), {"__name__": "__main__"})
except Exception:
    _rhine_ok = False
    traceback.print_exc(file=_rhine_err)
finally:
    sys.stdin = _rhine_old_stdin
    sys.stdout = _rhine_old_stdout
    sys.stderr = _rhine_old_stderr
json.dumps({"ok": _rhine_ok, "stdout": _rhine_out.getvalue(), "stderr": _rhine_err.getvalue()})
`)) as string;
    pyodide.globals.delete('__rhine_user_code__');
    pyodide.globals.delete('__rhine_user_stdin__');

    const raw = JSON.parse(serialized) as {
      ok: boolean;
      stdout: string;
      stderr: string;
    };
    const parsed = parseStructuredStdout(raw.stdout ?? '');
    return {
      ok: Boolean(raw.ok),
      stdout: parsed.cleanStdout,
      stderr: (raw.stderr ?? '').trim(),
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      plots: parsed.plots,
      tables: [],
    };
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      plots: [],
      tables: [],
    };
  }
}

/**
 * Parses __RHINE_PLOT__ markers and console.table JSON lines from server stdout
 */
export function parseStructuredStdout(rawStdout: string): {
  cleanStdout: string;
  plots: PlotSeries[];
} {
  const plots: PlotSeries[] = [];
  const cleanLines: string[] = [];

  for (const line of rawStdout.split(/\r?\n/)) {
    if (line.startsWith('__RHINE_PLOT__:')) {
      try {
        const parsed = JSON.parse(line.slice('__RHINE_PLOT__:'.length)) as PlotSeries;
        if (parsed && Array.isArray(parsed.points)) {
          plots.push(parsed);
          continue;
        }
      } catch {
        // Keep raw line if JSON fails
      }
    }
    cleanLines.push(line);
  }

  return {
    cleanStdout: cleanLines.join('\n').trim(),
    plots,
  };
}
