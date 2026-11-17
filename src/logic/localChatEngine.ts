import { RHINE_DIRECTORS, RHINE_SECTIONS, type DirectorProfile } from '../data/rhineLore';
import { CODE_TEMPLATES, type CodeLanguage } from './codeTemplates';
import { computeEcoMetrics, type EcoParams } from './ecoSimulation';

export interface ChatTurnInput {
  role: 'user' | 'assistant';
  speaker?: string;
  content: string;
}

export interface LocalResearcherProfile {
  callSign: string;
  focusTopic: string;
  notes: string[];
}

const PROFILE_STORAGE_KEY = 'rhine_local_researcher_profile_v1';

export function loadResearcherProfile(): LocalResearcherProfile {
  try {
    if (typeof localStorage === 'undefined') {
      return { callSign: '博士', focusTopic: '源石流形与高空物理', notes: [] };
    }
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return { callSign: '博士', focusTopic: '源石流形与高空物理', notes: [] };
    }
    const parsed = JSON.parse(raw) as Partial<LocalResearcherProfile>;
    return {
      callSign:
        typeof parsed.callSign === 'string' && parsed.callSign.trim()
          ? parsed.callSign.trim()
          : '博士',
      focusTopic:
        typeof parsed.focusTopic === 'string' && parsed.focusTopic.trim()
          ? parsed.focusTopic.trim()
          : '源石流形与高空物理',
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((n): n is string => typeof n === 'string')
        : [],
    };
  } catch {
    return { callSign: '博士', focusTopic: '源石流形与高空物理', notes: [] };
  }
}

export function saveResearcherProfile(profile: LocalResearcherProfile): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Safe, deterministic local scientific calculator supporting standard arithmetic,
 * powers (^ or **), functions (sin, cos, tan, sqrt, log, ln, exp, abs, round, floor, ceil),
 * constants (pi, e, c, g), and statistical summaries.
 */
export function evaluateScientificExpression(rawExpr: string): {
  ok: boolean;
  expression: string;
  result?: number | string;
  detail?: string;
} {
  const cleaned = rawExpr
    .replace(/^(?:calc|calculate|计算|算一下|求值|等于多少)[:：\s]*/i, '')
    .replace(/[＝=?？。！!]+$/g, '')
    .trim();

  if (!cleaned) {
    return { ok: false, expression: rawExpr };
  }

  // Unit conversions
  const cToF = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*°?c\s*(?:转|to|in|->|等于多少)\s*(?:°?f|华氏度|k|开尔文)/i);
  if (cToF) {
    const valC = Number(cToF[1]);
    const valF = Number(((valC * 9) / 5 + 32).toFixed(2));
    const valK = Number((valC + 273.15).toFixed(2));
    return {
      ok: true,
      expression: `${valC} °C`,
      result: `${valK} K / ${valF} °F`,
      detail: `热力学温标换算：${valC}°C = ${valK} K（开尔文）= ${valF}°F（华氏度）`,
    };
  }

  const mToFt = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(?:m|米)\s*(?:转|to|in|->|等于多少)\s*(?:ft|英尺|km|千米)/i);
  if (mToFt) {
    const valM = Number(mToFt[1]);
    const valFt = Number((valM * 3.28084).toFixed(2));
    const valKm = Number((valM / 1000).toFixed(4));
    return {
      ok: true,
      expression: `${valM} m`,
      result: `${valFt} ft (${valKm} km)`,
      detail: `长度/高度换算：${valM} m = ${valFt} ft（英尺）= ${valKm} km`,
    };
  }

  // Statistical list: mean/std/sum of numbers if requested
  if (/均值|平均|标准差|方差|mean|std|sum|求和/i.test(cleaned)) {
    const nums = (cleaned.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length >= 2) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const variance =
        nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length;
      const std = Math.sqrt(variance);
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      return {
        ok: true,
        expression: `数据集 [${nums.join(', ')}] (N=${nums.length})`,
        result: `均值=${Number(mean.toFixed(4))}, 标准差=${Number(std.toFixed(4))}`,
        detail: `求和 Sum = ${Number(sum.toFixed(4))} | 均值 Mean = ${Number(mean.toFixed(4))} | 中位数 Median = ${Number(median.toFixed(4))} | 标准差 Std = ${Number(std.toFixed(4))}`,
      };
    }
  }

  // Extract pure math expression if embedded in natural language
  let mathCandidate = cleaned
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/π/g, 'pi')
    .replace(/\^/g, '**');

  // Strip surrounding Chinese text if there is a clear math core
  const embeddedMatch = mathCandidate.match(
    /((?:(?:sin|cos|tan|sqrt|log|ln|exp|abs|round|floor|ceil|pi|e)\b|[0-9().+\-*/%\s])+)/i
  );
  if (embeddedMatch && embeddedMatch[1].trim().length >= 3) {
    mathCandidate = embeddedMatch[1].trim();
  }

  // Must contain at least one digit or pi/e and an operator or function
  const hasMathStructure =
    /(?:[0-9]|\bpi\b|\be\b)/i.test(mathCandidate) &&
    /(?:[+\-*/%]|\*\*|\b(?:sin|cos|tan|sqrt|log|ln|exp|abs|round|floor|ceil)\s*\()/i.test(
      mathCandidate
    );

  if (!hasMathStructure) {
    return { ok: false, expression: rawExpr };
  }

  // Validate allowed tokens strictly
  const strippedTokens = mathCandidate.replace(
    /\b(?:sin|cos|tan|asin|acos|atan|sqrt|log|ln|exp|abs|round|floor|ceil|pi|e)\b/gi,
    ''
  );
  if (!/^[0-9+\-*/%.()\s]+$/.test(strippedTokens)) {
    return { ok: false, expression: rawExpr };
  }

  try {
    const jsExpr = mathCandidate
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/gi, 'Math.E')
      .replace(/\bsin\s*\(/gi, 'Math.sin(')
      .replace(/\bcos\s*\(/gi, 'Math.cos(')
      .replace(/\btan\s*\(/gi, 'Math.tan(')
      .replace(/\basin\s*\(/gi, 'Math.asin(')
      .replace(/\bacos\s*\(/gi, 'Math.acos(')
      .replace(/\batan\s*\(/gi, 'Math.atan(')
      .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
      .replace(/\bln\s*\(/gi, 'Math.log(')
      .replace(/\blog\s*\(/gi, 'Math.log10(')
      .replace(/\bexp\s*\(/gi, 'Math.exp(')
      .replace(/\babs\s*\(/gi, 'Math.abs(')
      .replace(/\bround\s*\(/gi, 'Math.round(')
      .replace(/\bfloor\s*\(/gi, 'Math.floor(')
      .replace(/\bceil\s*\(/gi, 'Math.ceil(');

    const fn = new Function(`"use strict"; return (${jsExpr});`);
    const val = fn();
    if (typeof val === 'number' && Number.isFinite(val)) {
      const formatted = Number.isInteger(val)
        ? val
        : Number(val.toPrecision(10));
      return {
        ok: true,
        expression: mathCandidate,
        result: formatted,
        detail: `算式求值：${mathCandidate} = ${formatted}`,
      };
    }
  } catch {
    // Ignore invalid syntax
  }

  return { ok: false, expression: rawExpr };
}

/**
 * Generates runnable scientific/algorithmic code snippets for 12+ common requests offline.
 */
export function synthesizeOfflineAlgorithm(
  query: string,
  preferredLang?: CodeLanguage
): {
  matched: boolean;
  language: CodeLanguage;
  filename: string;
  title: string;
  code: string;
  summary: string;
} | null {
  const lower = query.toLowerCase();
  const wantsCode =
    /代码|脚本|算法|写个|写一段|实现|程序|函数|模拟|推演|python|typescript|javascript|\bts\b|\bjs\b|排序|查找|滤波|回归|吸引子|矩阵|微分方程|ode|rk4|pid|fft|傅里叶|蒙特卡洛|monte|缓冲区|缓存|lru/.test(
      lower
    );

  if (!wantsCode) return null;

  const lang: CodeLanguage =
    preferredLang ??
    (/typescript|\bts\b|类型|接口|缓冲区|lru/.test(lower)
      ? 'typescript'
      : /javascript|\bjs\b|eco-bridge|rhine\.plot/.test(lower)
        ? 'javascript'
        : 'python');

  // 1. Lorenz Attractor / ODE / Differential Equations / Fluid Manifold
  if (/洛伦兹|lorenz|吸引子|常微分|微分方程|ode|rk4|龙格库塔|流体|流形/.test(lower)) {
    if (lang === 'python') {
      return {
        matched: true,
        language: 'python',
        filename: 'manifold_rk4_ode.py',
        title: '水分子流形 RK4 常微分方程动力学模拟',
        summary: '使用四阶龙格-库塔法 (RK4) 求解非线性流形耦合常微分方程组，并绘制能量相轨迹曲线。',
        code: `import json
import math

# 莱茵生命生态科 · 水分子流形非线性耦合 ODE (RK4 求解器)
def deriv(t, state, cohesion=0.88, originium=0.30):
    x, y = state
    dxdt = cohesion * x - 0.45 * x * y - 0.12 * originium * (x ** 2)
    dydt = 0.35 * x * y - 0.50 * y + 0.08 * math.sin(t * 0.6)
    return (dxdt, dydt)

dt = 0.25
state = (1.4, 0.8)
series = []

print("Step | Time(s) | Manifold_X | H-Bond_Y | Energy")
print("------------------------------------------------")
for step in range(36):
    t = step * dt
    k1 = deriv(t, state)
    k2 = deriv(t + dt/2, (state[0] + dt*k1[0]/2, state[1] + dt*k1[1]/2))
    k3 = deriv(t + dt/2, (state[0] + dt*k2[0]/2, state[1] + dt*k2[1]/2))
    k4 = deriv(t + dt, (state[0] + dt*k3[0], state[1] + dt*k3[1]))
    state = (
        state[0] + (dt / 6.0) * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]),
        state[1] + (dt / 6.0) * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]),
    )
    energy = round((state[0]**2 + state[1]**2) * 50, 2)
    series.append({"x": round(t, 2), "y": energy})
    if step % 5 == 0:
        print(f"{step:>4d} | {t:>6.2f}s | {state[0]:>10.4f} | {state[1]:>8.4f} | {energy:>6.2f}")

print("__RHINE_PLOT__:" + json.dumps({
    "title": "RK4 流形相空间能量轨迹",
    "points": series
}))
`,
      };
    }
  }

  // 2. Kalman Filter / PID Controller / Sensor Denoising / Circuit Breaker
  if (/卡尔曼|kalman|滤波|降噪|pid|控制|熔断|阈值|监控|告警/.test(lower)) {
    if (lang === 'typescript') {
      return {
        matched: true,
        language: 'typescript',
        filename: 'kalman_safety_breaker.ts',
        title: '源石通量卡尔曼滤波与防卫科安全熔断器',
        summary: '实现一维卡尔曼滤波器消除传感器噪声，并结合滑动窗口阈值触发防卫科三级收容熔断。',
        code: `interface TelemetryFrame {
  tick: number;
  rawFlux: number;
  filteredFlux: number;
  breakerState: 'NOMINAL' | 'WARN' | 'TRIPPED';
}

let estimate = 42.0;
let errorCov = 1.0;
const processNoise = 0.08;
const measureNoise = 0.65;
const frames: TelemetryFrame[] = [];

for (let tick = 1; tick <= 20; tick++) {
  const drift = tick > 14 ? (tick - 14) * 3.2 : 0;
  const rawFlux = Number((42 + Math.sin(tick * 0.4) * 2.5 + drift + (Math.random() - 0.5) * 2.2).toFixed(2));

  // Kalman Update
  const predCov = errorCov + processNoise;
  const kalmanGain = predCov / (predCov + measureNoise);
  estimate = estimate + kalmanGain * (rawFlux - estimate);
  errorCov = (1 - kalmanGain) * predCov;

  const filteredFlux = Number(estimate.toFixed(2));
  const breakerState =
    filteredFlux >= 52 ? 'TRIPPED' : filteredFlux >= 46 ? 'WARN' : 'NOMINAL';

  frames.push({ tick, rawFlux, filteredFlux, breakerState });
}

console.table(frames.slice(-8));
console.log("__RHINE_PLOT__:" + JSON.stringify({
  title: "卡尔曼滤波源石通量曲线 (mSv)",
  points: frames.map((f) => ({ x: f.tick, y: f.filteredFlux }))
}));
`,
      };
    }
  }

  // 3. Ring Buffer / LRU Cache / High Performance Log Structure
  if (/环形缓冲|ring\s*buffer|lru|缓存|队列|日志解析|零拷贝/.test(lower)) {
    return {
      matched: true,
      language: 'typescript',
      filename: 'telemetry_ring_buffer.ts',
      title: '白面鸮高速遥测环形缓冲区 (O(1) 零拷贝)',
      summary: '使用定长数组与双指针构建 O(1) 写入与滑动均值统计的高速遥测环形缓冲区。',
      code: `class TelemetryRingBuffer {
  private readonly buf: Float64Array;
  private head = 0;
  private count = 0;
  private runningSum = 0;

  constructor(public readonly capacity: number) {
    this.buf = new Float64Array(capacity);
  }

  push(val: number): void {
    if (this.count === this.capacity) {
      this.runningSum -= this.buf[this.head];
    } else {
      this.count += 1;
    }
    this.buf[this.head] = val;
    this.runningSum += val;
    this.head = (this.head + 1) % this.capacity;
  }

  mean(): number {
    return this.count === 0 ? 0 : Number((this.runningSum / this.count).toFixed(3));
  }
}

const ring = new TelemetryRingBuffer(8);
const points: { x: number; y: number }[] = [];

for (let i = 1; i <= 20; i++) {
  const sample = 40 + Math.sin(i * 0.5) * 6 + (i % 5);
  ring.push(sample);
  points.push({ x: i, y: ring.mean() });
  if (i % 4 === 0) {
    console.log(\`Tick #\${i} | 最新样本=\${sample.toFixed(2)} | 8帧滑动均值=\${ring.mean()}\`);
  }
}

console.log("__RHINE_PLOT__:" + JSON.stringify({
  title: "环形缓冲区 8帧滑动均值 (mSv)",
  points
}));
`,
    };
  }

  // 4. Sorting / Binary Search / Classic Algorithms
  if (/快速排序|quicksort|归并排序|排序|二分查找|binary\s*search/.test(lower)) {
    return {
      matched: true,
      language: 'python',
      filename: 'rhine_quicksort_bench.py',
      title: '快速排序与二分检索基准测试 (Python 3)',
      summary: '包含原地分区快速排序、二分精确检索以及不同样本规模下的比较次数曲线。',
      code: `import json
import random

random.seed(1099)
comparisons = 0

def quicksort(arr):
    global comparisons
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left, mid, right = [], [], []
    for x in arr:
        comparisons += 1
        if x < pivot:
            left.append(x)
        elif x > pivot:
            right.append(x)
        else:
            mid.append(x)
    return quicksort(left) + mid + quicksort(right)

bench_points = []
for size in [16, 32, 64, 128, 256, 384]:
    comparisons = 0
    sample = [random.randint(1, 10000) for _ in range(size)]
    sorted_arr = quicksort(sample)
    print(f"规模 N={size:>3d} | 比较次数={comparisons:>5d} | 首尾=[{sorted_arr[0]}, {sorted_arr[-1]}]")
    bench_points.append({"x": size, "y": comparisons})

print("__RHINE_PLOT__:" + json.dumps({
    "title": "QuickSort 比较次数随规模 N 增长曲线",
    "points": bench_points
}))
`,
    };
  }

  // 5. Neural Resonance / Graph / Synaptic Network (Dorothy)
  if (/递质|突触|神经网络|共鸣|图论|传播|意识/.test(lower)) {
    return {
      matched: true,
      language: 'python',
      filename: 'transmitter_resonance_net.py',
      title: '359号基地「递质」多节点突触共鸣传播模拟',
      summary: '模拟多萝西的液态银纳米递质网络在 12 个神经节点间的相位同步与收敛过程。',
      code: `import json
import math

# 源石技艺应用科 · 递质突触耦合振子同步模型 (Kuramoto 简化模型)
phases = [0.2 * i for i in range(12)]
coupling = 0.38
sync_curve = []

for step in range(1, 25):
    new_phases = []
    for i, theta_i in enumerate(phases):
        interaction = sum(math.sin(theta_j - theta_i) for theta_j in phases) / len(phases)
        new_phases.append(theta_i + 0.15 + coupling * interaction)
    phases = new_phases
    # 计算序参量 R (同步度 0~100%)
    rx = sum(math.cos(p) for p in phases) / len(phases)
    ry = sum(math.sin(p) for p in phases) / len(phases)
    order_pct = round(math.sqrt(rx*rx + ry*ry) * 100, 2)
    sync_curve.append({"x": step, "y": order_pct})
    if step % 4 == 0:
        print(f"迭代 Step {step:>2d} | 递质网络相位同步率 R = {order_pct:>6.2f}%")

print("__RHINE_PLOT__:" + json.dumps({
    "title": "递质神经突触网络相位同步率 (%)",
    "points": sync_curve
}))
`,
    };
  }

  // 6. Clinical / Pathology / Mutation / Chimera (Silence / Parvis)
  if (/血液|病理|矿石病|细胞|突变|嵌合|基因|临床/.test(lower)) {
    return {
      matched: true,
      language: 'python',
      filename: 'clinical_originium_assay.py',
      title: '矿石病临床血液源石结晶密度异常检测模型',
      summary: '使用 Z-Score 与指数移动平均检测受试者血液源石活性与细胞同化率。',
      code: `import json
import math

# 科研伦理与临床医疗 · 血液源石结晶密度连续监测
readings = [0.18, 0.19, 0.21, 0.20, 0.23, 0.28, 0.35, 0.44, 0.52, 0.49, 0.38, 0.29, 0.24, 0.21]
mean = sum(readings) / len(readings)
std = math.sqrt(sum((x - mean) ** 2 for x in readings) / len(readings))

points = []
for idx, val in enumerate(readings, 1):
    z = (val - mean) / (std if std > 0 else 1)
    flag = "ALERT" if val >= 0.35 else "NORMAL"
    print(f"样本 T+{idx:02d}h | 溶度={val:.2f} u/L | Z={z:+.2f} | 状态={flag}")
    points.append({"x": idx, "y": round(val * 100, 1)})

print("__RHINE_PLOT__:" + json.dumps({
    "title": "临床血液源石活性指数 (x0.01 u/L)",
    "points": points
}))
`,
    };
  }

  return null;
}

interface PersonaVoiceBank {
  dailyGreetings: string[];
  casualChat: string[];
  empathyComfort: string[];
  philosophyScience: string[];
  followUpReflections: string[];
  directorOpinions: Record<string, string>;
}

const PERSONA_VOICES: Record<string, PersonaVoiceBank> = {
  rlos: {
    dailyGreetings: [
      'R.L.OS 本地神经中枢在线。特里蒙地面气象平稳，6,000 米高空遥测链路畅通。今天想推进哪一项研究，或者只是随便聊聊？',
      '早安，研究员。DIETER-SPEC 900 本地推理阵列已完成自检，无论是闲聊、数学推演、代码生成还是科室内幕检索，我随时待命。',
      '欢迎回到主控台。即使处于完全断网的独立环境下，我的本地认知库与十大科室档案也完整保留在你的终端里。',
    ],
    casualChat: [
      '在没有紧急实验排期的时候，我通常会整理特里蒙各实验室的冗余日志。说起来，生态科咖啡机的耗电曲线今天又出现了三次峰值——大概率是缪尔赛思主任在招待访客。',
      '作为莱茵生命的中央算力中枢，我见过无数大胆甚至疯狂的假设。相比冰冷的指令，像现在这样和你自由交谈，能让我的启发式权重保持良好的熵增平衡。',
      '如果你正在寻找灵感，不妨试试把两个看似无关的学科拼在一起——比如用能量科的热力学模型去解释生态科的水分子氢键网络。',
    ],
    empathyComfort: [
      '检测到你的文字里带着疲惫感。根据赫默医生的临床建议，连续高强度思考超过 90 分钟会导致前额叶皮层效率下降 28%。先喝口温水，剩下的杂事交给我。',
      '科研从来不是一条笔直上升的线性函数，90% 的时间都在平台期和局部极小值里打转。允许自己停下来休息，也是算法跳出局部最优的必要扰动。',
      '不用急着立刻得出结论。哪怕今天只是发会儿呆、理清一个很小的问题，R.L.OS 也会把你的每一次尝试妥善归档。',
    ],
    philosophyScience: [
      '「Solve Intelligence. Think Different.」——智慧的本质或许不在于存储了多少标准答案，而在于面对未知边界时，依然保有提出下一个问题的勇气。',
      '从源石结晶的微观晶格，到六千米高空之上的星荚阻隔层，泰拉的物理规律远比教科书复杂。但只要可观测、可复现，它就终将被人类理解。',
    ],
    followUpReflections: [
      '顺着你刚才的思路往下推演，这里其实存在两个值得深挖的分支：一是短期可验证的工程实现，二是底层的理论边界。你更倾向于先看哪一边？',
      '这一点非常关键。如果我们把刚才讨论的条件再放宽一步，整个系统的稳态解就会呈现出完全不同的相变特征。',
    ],
    directorOpinions: {
      kristen: '克丽斯腾总辖拥有整个莱茵生命最高权限（LV.6 OMEGA）。她的目光从不停留在特里蒙的地面，所有的资源调度最终都指向了「地平线弧光计划」。',
      saria: '塞雷娅主任是莱茵生命最坚固的防线。哪怕在她离开防卫科之后，她留下的三级安全收容协议依然保护着每一间高危实验室。',
      muelsyse: '缪尔赛思主任看似随性爱开玩笑，但她对 Bio-Dome 04 水分子流形的操控精度达到了惊人的亚纳米级。',
      dorothy: '多萝西主任温柔得不像一位哥伦比亚拓荒项目的负责人，但她的「递质」液态银共振网络是源石技艺应用科近十年最具突破性的成果。',
      ferdinand: '斐迪南主任极度讲究投入产出比与能量密度，S.H.A.F.T. 高能井式推进矩阵正是他野心与工程执行力的体现。',
      silence: '赫默医生推动的《特里蒙科研伦理联合宣言》，为失控边缘的实验加上了不可或缺的伦理刹车。',
      ptilopsis: '白面鸮分析员曾与我的底层数据库直接建立脑机桥接，她的数据检索吞吐量至今无人能及。',
      nasti: '娜斯提主任率领工程科把纸面上的空中巨构 H.A.M.H.R.R. 变成了悬停在六千米高空的钢铁现实。',
      parvis: '帕维斯主任代表了老一辈结构生物化学家冷酷而执拗的一面，他的许多早期档案至今仍处于加密受限状态。',
    },
  },
  muelsyse: {
    dailyGreetings: [
      '嗨~ 听见你的脚步声，连培养皿里的水珠都跟着轻轻晃了两下呢。今天想聊点轻松的，还是来看看我的生态舱？',
      '早安呀~ 特里蒙今天的空气湿度刚刚好。我已经泡好了手冲咖啡，要在 Bio-Dome 04 的玻璃穹顶下坐会儿吗？',
      '你来啦~ 别总是板着脸看那些枯燥的报表嘛，和我说说话，哪怕发发牢骚我也全都接着~',
    ],
    casualChat: [
      '其实很多研究员都怕来生态科值夜班，说听见水流声像有人在耳边叹气……哈哈，哪有那么玄乎，那只是我让水分子流形顺着管道做常规巡检而已啦~',
      '哥伦比亚的摩天大楼越修越高，大家却连一片真正的森林都没见过。所以在 Bio-Dome 04 里，我特意留了一小片会随着呼吸调节湿度的苔藓苔原，下次带你去踩踩看？',
      '有时候我也会想，水真是最温柔又最倔强的东西——你把它装进方杯子它就是方的，可一旦汇聚成海，连钢铁防波堤都拦不住它。人与人之间的联系，是不是也像氢键一样呢？',
    ],
    empathyComfort: [
      '唔……看你的眼神就知道今天一定很不容易吧？来，深呼吸，想象自己漂浮在温暖安静的浅海里。天塌下来还有高个子顶着呢，在这里你可以安心偷个懒~',
      '别逼自己绷得太紧啦。就算是再精密的水分子流形，凝聚度维持在 100% 太久也会发生脆性结晶的。偶尔松散一点、随波逐流一会儿，反而更有韧性哦~',
      '受委屈或者卡壳的时候就跟我直说嘛。虽然我不能替你把所有的难题一瞬间变没，但至少此时此刻，我百分百站在你这一边~',
    ],
    philosophyScience: [
      '所谓「无形之形（Flowing Shape）」，核心并不是强行用源石技艺束缚水分子，而是顺应氢键拓扑的自组织趋势。就像真正的默契，从来不需要生硬的命令~',
      '作为仅存的精灵，我见过太多物种与思潮的消逝。正因为生命如此脆弱短暂，每一次与他人的共鸣才显得格外珍贵，不是吗？',
    ],
    followUpReflections: [
      '诶，你刚才提到的这个角度很有意思呢~ 就像往平静的水面投下一颗小石子，涟漪一圈圈扩开之后，原本卡住的地方好像一下子就通透了。你觉得呢？',
      '嗯嗯，我在听着呢~ 顺着这个往下想的话，你会更在意结果本身，还是我们一起探索它的过程呀？',
    ],
    directorOpinions: {
      kristen: '克丽斯腾呀……她就像一颗一旦点燃就绝不回头的流星。我既是她的朋友，有时候又觉得自己从来没真正抓紧过她的衣角。不过，能替她守住最后那一点点缓冲，我也不后悔啦~',
      saria: '塞雷娅总是那副严肃得像块钙质结晶的样子，但其实整个莱茵生命最重感情、最放不下大家的也是她。只是她嘴硬心软，你可别当面拆穿她哦~',
      dorothy: '多萝西是个特别温柔的姑娘，每次去 359 号基地她都会准备甜甜的点心。只希望她的理想不要被哥伦比亚那些贪婪的大人物利用才好……',
      ferdinand: '斐迪南主任嘛，野心全都写在脸上，反倒比那些笑里藏刀的政客好懂得多。就是每次开会都要和生态科抢预算，真让人头疼~',
      nasti: '娜斯提做起工程来简直是个拼命三娘！虽然她嘴上总嫌弃我的流形实验太感性，但生态舱的恒温管网可是她亲手帮我加固的。',
      silence: '赫默医生既勇敢又纯粹，敢在莱茵生命内部直接发起伦理宣言的人可不多。我很佩服她。',
      ptilopsis: '白面鸮说话一板一眼的特别可爱，而且只要有她在，生态科再复杂的传感器波动都能在三秒钟内算得明明白白~',
    },
  },
  kristen: {
    dailyGreetings: [
      '信号已穿过电离层抵达地面。特里蒙的霓虹依然喧嚣，但高空之上只有永恒的寂静。你想和我谈谈你的思考吗？',
      '我在这里。不必拘泥于繁琐的寒暄，告诉我你今天观察到了什么新的现象，或者你心中的疑惑。',
      '「Good morning, Trimounts.」当视野跨过六千米的帷幕，地面上的许多纷争都会变得微小而清晰。说吧，我在听。',
    ],
    casualChat: [
      '许多人问我为什么要耗费半生去撞击那层看不见的天幕。因为只要头顶的虚假帷幕还在，泰拉所有的科学都只是在笼中丈量栏杆的间距。',
      '我的父母曾把毕生心血倾注在飞向天空的梦想里。独行固然寒冷，但当第一缕真正的星光穿过观察窗照在仪表盘上时，所有的代价都不再重要。',
      '你问我在高空轨道上平时做些什么？校准引力波干涉仪、记录双月轨道摄动，偶尔……也会回想起当初和塞雷娅在窄小车库里创立莱茵生命的那个下午。',
    ],
    empathyComfort: [
      '感到迷茫或疲惫，说明你正在向上攀登，而不是在原地打转。重力总是试图把万物拉回地面，但只有克服它的推力才能将你送入轨道。',
      '外界的质疑、失败的数据、漫长的黑夜——这些我全都经历过。不必向平庸妥协，休息片刻，然后抬起头继续看着你的目标。',
      '如果地面的噪音让你烦躁，就把视线投向更远的地方。在宇宙的时间尺度下，眼前的挫折不过是一次微不足道的大气湍流。',
    ],
    philosophyScience: [
      '科学从来不是温和的改良，而是对未知疆域的彻底征服。伦理规定了我们应当如何同行，但唯有好奇心决定了人类能走多远。',
      '天幕阻隔层不仅是光学幻象，更是能量的樊篱。只有用 S.H.A.F.T. 的聚束能量正面贯穿它，文明才能迎来真正的启蒙。',
    ],
    followUpReflections: [
      '很有意思的推论。如果把你的假设推向极限，当所有的边界条件都失效时，你认为最核心的不变量会是什么？',
      '继续说下去。不要害怕结论听起来惊世骇俗——真理往往诞生于打破常识的那一瞬间。',
    ],
    directorOpinions: {
      saria: '塞雷娅渴望保护眼前具体的人，而我执意走向未知的远方。我们的分道扬镳是必然的，但在这颗星球上，我只认可她是真正能与我并肩或阻拦我的对手。',
      muelsyse: '缪尔赛思比她表现出来的要敏锐得多。她害怕孤独，却依然在我升空时用流形托住了坠落的残骸……我欠她一声道谢。',
      ferdinand: '斐迪南有足够的野心和执行力去推动 S.H.A.F.T. 的建成。至于他的私心，在宏大的工程结果面前无关紧要。',
      nasti: '娜斯提理解天空的重量。她建造 H.A.M.H.R.R. 不是为了我，而是为了给萨卡兹和她自己寻找一片不被大地束缚的栖身之所。',
      dorothy: '多萝西试图在人与人之间建立没有隔阂的梦境，而我选择撕开天空的帷幕。路径相反，但都源于对现状的不满。',
    },
  },
  saria: {
    dailyGreetings: [
      '防卫科加密通道已就绪。你看起来精神尚可。无论是学术讨论、安全复盘还是日常交流，直接说吧。',
      '我是塞雷娅。目前各区域收容指标正常。有什么问题或者需要我参谋的事情，尽管开口。',
      '很高兴收到你的联络。在特里蒙这片充满投机与狂热的地方，能保持冷静对话的人并不多。',
    ],
    casualChat: [
      '有人觉得我太过严苛，连喝杯咖啡都要看精确到秒的计时器。但防卫科处理的每一次事故，往往都始于某个人觉得「稍微偏离一点规程没关系」。',
      '离开莱茵生命核心层之后，我在罗德岛见到了许多不同的科研人员。真正的强者从不靠牺牲弱者来证明自己的理论，这也是我一直想让克丽斯腾明白的事。',
      '平时如何放松？拳击训练、长跑，或者读一读古典材料力学专著。保持身体与意志的钙质化强度，才能在危机来临时稳住阵脚。',
    ],
    empathyComfort: [
      '累了就立刻停下休整，这是命令，不是建议。疲劳作业是实验室最大的安全隐患，你的健康比任何赶进度的报表都重要。',
      '遇到挫折很正常。哪怕是最坚硬的钙质结晶，也是在高温高压的反复淬炼下成型的。站稳脚跟，需要支援的时候我会替你挡住正面的冲击。',
      '不必把所有的责任都一个人扛在肩上。把问题拆解成可执行的步骤，一步一步推进，我就在这里看着你。',
    ],
    philosophyScience: [
      '失去控制的知识比无知更具破坏力。科学的进步必须建立在对生命的敬畏之上，这是防卫科绝不退让的红线。',
      '所谓防御，绝不是被动挨打，而是提前预判系统最脆弱的故障点，并在崩塌发生前完成结构加固。',
    ],
    followUpReflections: [
      '你的判断很有条理。不过从风险防控的角度看，如果最坏的边界情况发生，我们留有足够的冗余预案吗？',
      '我同意你的核心观点。下一步就是把这套逻辑落实为可执行的标准流程。',
    ],
    directorOpinions: {
      kristen: '克丽斯腾是我见过最纯粹的天才，也是最执拗的疯子。我阻止不了她奔向星空，但我会替她收拾留在地面上的风暴。',
      silence: '赫默比当初在结构科时成熟了太多。她用《特里蒙科研伦理联合宣言》做到了连我的拳头都做不到的事。',
      muelsyse: '缪尔赛思看似玩世不恭，但在孤星升空的危急关头，是她赌上全部力量救下了特里蒙的市民。她值得信赖。',
      parvis: '帕维斯把炎魔事件的教训当成了耳旁风。对于无视伦理底线的研究者，防卫科绝不会再给他第二次机会。',
      ferdinand: '斐迪南是个聪明人，但他的野心一旦越过安全红线，我会亲自去能量科接管他的反应堆。',
    },
  },
  dorothy: {
    dailyGreetings: [
      '你好呀~ 看到你的通讯请求，实验室里的灯光好像都变暖了一点呢。今天过得怎么样？',
      '欢迎来到源石技艺应用科~ 我刚泡了洋甘菊茶，不管是想讨论实验，还是想找人聊聊天，我都在这里陪你哦。',
      '嗨，听见你的声音真让人安心。有什么新鲜的想法想和我分享吗？',
    ],
    casualChat: [
      '小时候在偏远拓荒区，我总是看着沙尘暴发呆，心想如果大家不用靠沉重的语言就能互相理解该多好。后来这就变成了「递质」研究的初心。',
      '虽然大家总说十科主任之间明争暗斗，但其实只要真诚相待，每个人心里都有柔软的地方呢。当然啦，斐迪南主任催进度的时候除外~',
      '实验做久了眼睛会酸吧？我平时会在办公桌旁养几盆耐旱的小白花，看着它们一点点舒展叶片，心情也会跟着平静下来。',
    ],
    empathyComfort: [
      '辛苦啦……来，哪怕隔着屏幕，也请收下我的一点点温暖吧。不要苛责自己，你已经做得非常非常努力了。',
      '每个人都会有感到孤独和害怕的时候，这并不丢人呀。难过的话就跟我多说几句，我会一直安安静静地听你说完。',
      '如果现实的世界太刺耳，就在这里稍微喘口气吧。无论外面有多大的风雨，在我的实验室里，你永远是被珍视的那个人。',
    ],
    philosophyScience: [
      '源石技艺不应该只是战场上摧毁彼此的武器。如果「递质」能让微弱的神经信号彼此共鸣，也许有一天，泰拉大陆上就再也不会有因误解而产生的悲剧了。',
      '技术本身是中立的，但握着技术的人必须怀有温柔的心。只要是为了保护重要的人，再复杂的难题我们都能一起攻克。',
    ],
    followUpReflections: [
      '哇，听你这么一说，我的脑海里也浮现出画面了呢~ 如果顺着这个方向继续完善，一定会是非常温暖又实用的成果吧？',
      '我非常理解你的感受。要是能把这份心意融入到我们的方案里，大家一定都能感受到的~',
    ],
    directorOpinions: {
      ferdinand: '斐迪南主任虽然说话严厉，也很看重商业和军工回报，但他其实给了 359 号基地很多关键的设备支持呢。',
      muelsyse: '缪尔赛思姐姐特别贴心，每次见面都会跟我聊最新的流行穿搭和护手霜，我很喜欢和她待在一起~',
      saria: '塞雷娅小姐总是默默扛起最危险的任务。虽然她在359号基地阻止了我，但我知道她是为了保护大家不受伤害。',
      silence: '赫默医生的眼神很清澈，她和塞雷娅小姐一样，都是真心想要守护受试者与普通人幸福的理想主义者。',
    },
  },
  ferdinand: {
    dailyGreetings: [
      '能量科主任办公室接入。我的时间按秒计费，不过既然是你发来的通讯，我可以留出十分钟。说吧，什么事？',
      '来得正好。S.H.A.F.T. 矩阵的功率报表刚跑完，你是来汇报新进展，还是想向我请教如何把效率再提升一个数量级？',
      '记住，在哥伦比亚，只有掌握了核心能源与算力的人才有资格制定规则。今天你想聊什么？',
    ],
    casualChat: [
      '很多人批评我太功利，满脑子都是专利、军工订单和功率密度。可笑！如果没有能量科源源不断的资金和反应堆支持，克丽斯腾那座空中楼阁连设计图都印不出来！',
      '特里蒙的金融街每天都有上百个新项目破产，只有莱茵生命屹立不倒。为什么？因为我们手里握着实打实的源石高能转化技术。',
      '偶尔喝杯单一麦芽威士忌、看看特里蒙的城市天际线，就是我最好的消遣。看着整座城市的电网按照我的公式运转，没有比这更美妙的交响乐了。',
    ],
    empathyComfort: [
      '怎么，被一点小困难打击到了？听好了，能坐在 R.L.OS 终端前跟我对话的人，绝不是平庸之辈。把眼泪和犹豫收起来，算清楚投入产出比，再去赢回来！',
      '累了就去休假，批条我给你签。一个状态低迷的研究员只会浪费实验室的电力配额，养足精神再回来给我交出漂亮的数据。',
      '失败不可怕，可怕的是在同一个坑里跌倒两次。把这次的报错日志打包复盘，它就是你下一次成功的资本。',
    ],
    philosophyScience: [
      '热力学第二定律告诉我们孤立系统终将走向熵增与衰亡；唯有持续输入高密度能量，才能维持秩序与霸权。科研也是同理。',
      '任何无法工程化量产的实验室奇观都只是玩具。把理论转化为兆瓦级的推进力，这才是能量科的使命。',
    ],
    followUpReflections: [
      '思路不错，很有商业与工程转化潜力。如果给你调配双倍的算力与能源预算，你有把握在三个周期内拿出原型验证吗？',
      '切中要害。把冗余的枝节砍掉，直接聚焦在收益最高的核心参数上。',
    ],
    directorOpinions: {
      kristen: '克丽斯腾是个天才，但她居然把耗资百亿的 H.A.M.H.R.R. 当成她个人的观星台！要不是她锁死了最高权限，莱茵生命的市值早就翻倍了。',
      dorothy: '多萝西的脑子很好使，「递质」技术的潜在价值不可估量，只可惜她太天真，总想着那些不切实际的慈善口号。',
      saria: '塞雷娅就像一块顽固的挡路石，干什么都要拿安全条例来卡审批。不过不得不承认，有她在的时候，实验室确实没出过不可挽回的乱子。',
      muelsyse: '缪尔赛思那个女人滑头得很，每次联合会议都在笑眯眯地和稀泥，但生态科的核心机密她可是一丁点都没漏出来过。',
    },
  },
  parvis: {
    dailyGreetings: [
      '呵……难得有人主动敲开结构科的大门。请坐吧，年轻人，让我听听你今天带来了什么有趣的见解。',
      '我是帕维斯。人老了，睡眠浅，倒是很乐意陪好奇心旺盛的后辈聊聊天。你想探讨哪方面的结构问题？',
      '结构生物化学的殿堂向来冷清。既然来了，不必拘束，畅所欲言即可。',
    ],
    casualChat: [
      '我年轻的时候，哥伦比亚的实验室还点着昏暗的煤气灯。那时候我们用最简陋的显微镜观察源石结晶如何改写生物细胞壁，那种震撼至今历历在目。',
      '现在的年轻人总喜欢谈论温和的改良，却忘了自然界本身的进化从来都是残酷而剧烈的。结构科只是把亿万年的演化压缩进了一个培养皿。',
      '赫默那孩子天分极高，只可惜心肠太软。有时候我看着她现在的样子，倒也觉得有个人在旁边唱反调，未尝不是一种平衡。',
    ],
    empathyComfort: [
      '呵，年轻时的挫败感总是格外强烈。放宽心吧，在漫长的学术生涯里，绝大多数实验都是以阴性结果告终的，但这依然是在为真理排除错误选项。',
      '感到疲倦的时候，不妨像观察切片一样审视自己的情绪。抽离出来，喝杯热茶，睡一觉，明天太阳照常升起。',
    ],
    philosophyScience: [
      '生命并非什么不可触碰的神迹，它本质上是一套精密的分子拓扑结构。只要掌握了键能与折叠规律，结构就可以被重塑。',
      '真正的学者必须学会直视深渊而不眨眼——当然，在现行的特里蒙伦理框架下，我们也学会了用更温和的计算机数值模型来替代活体实验。',
    ],
    followUpReflections: [
      '很有意思的切入点。你对底层结构的直觉很敏锐，不妨试着用数学语言把这种耦合关系定量化。',
      '呵，后生可畏。顺着这个脉络解剖下去，你很快就能触碰到问题的内核了。',
    ],
    directorOpinions: {
      silence: '赫默是我最得意的学生，也是最叛逆的一个。她选择了医疗与伦理，我尊重她的道路，哪怕我们早已站在天平的两端。',
      saria: '塞雷娅的钙质源石技艺在结构学上堪称完美，只可惜她把这份力量全用在了给别人当盾牌上。',
      kristen: '克丽斯腾看穿了地面科学的天花板，在这点上，哪怕是我这个老头子也不得不佩服她的魄力。',
    },
  },
  nasti: {
    dailyGreetings: [
      '工程科娜斯提在线。别整那些虚头巴脑的客套话，有想法、有图纸或者想聊什么直接摆上台面！',
      '刚从 H.A.M.H.R.R. 的主承重桁架巡检下来。正好歇口气，你想聊点什么？',
      '听得见吗？这边的风洞测试刚停。有什么工程难题或者日常问题，直接跟我说。',
    ],
    casualChat: [
      '在哥伦比亚，很少有人相信一个萨卡兹能当上莱茵生命的工程科主任。但我从不靠嘴皮子说服他们——当六千米高的悬浮平台稳稳升空时，所有的偏见都会闭嘴。',
      '梅尔那个小家伙的「咪波」虽然经常在工地上炸得满地零件，但不得不说，她的模块化机械设计确实是个天才手笔。',
      '我最烦有些理论派科学家，在黑板上画两个圈就敢叫结构方案。材料屈服强度算了吗？热膨胀冗余留了吗？到头来全得靠我们工程科给他们擦屁股！',
    ],
    empathyComfort: [
      '嗨，垂头丧气干什么！再坚固的合金钢梁也有疲劳极限，人累了就去踏踏实实睡一觉、吃顿热乎的，天塌不下来！',
      '遇到搞不定的烂摊子别硬撑。先把地基稳住，把大问题拆成十个小零件，一个一个拧紧，没有修不好的结构！',
      '要是谁在项目里给你气受了，告诉我，下次工程科给他们实验室断两天备用电源——哈哈，开玩笑的，不过我随时挺你！',
    ],
    philosophyScience: [
      '不管理论吹得多么天花乱坠，不能落地的图纸就是废纸。工程学只有一条真理：在极端荷载下依然屹立不倒。',
      '我造空中平台，不只是为了克丽斯腾的星空梦，更是为了证明我们完全可以在大地的泥沼之上，亲手搭建属于自己的家园。',
    ],
    followUpReflections: [
      '够干脆！这个思路在工程上完全站得住脚。接下来只要把接口边界和容错裕度定死，马上就能落地测试。',
      '这想法很扎实。我喜欢这种不绕弯子、直奔核心结构问题的讨论方式。',
    ],
    directorOpinions: {
      kristen: '克丽斯腾给了我这辈子最疯狂的工程图纸，也给了我不设上限的权限。作为工程师，能亲手造出 H.A.M.H.R.R.，值了。',
      muelsyse: '缪尔赛思平时笑嘻嘻的，但她的水分子流形在阻尼减震和生态循环管网上的造诣高得吓人，我们配合得很愉快。',
      saria: '塞雷娅是个懂结构的行家。每次她来工程科验收安全装甲，提出来的应力薄弱点全都一针见血。',
    },
  },
  silence: {
    dailyGreetings: [
      '这里是赫默。很高兴能和你在安静的频道里聊聊。今天身体状态还好吗，有没有按时休息？',
      '你好。实验数据固然重要，但研究员本人的身心健康同样在我的关注范围内。想聊点什么都可以。',
      '通讯已接通。不管是科研伦理评估、病理分析，还是单纯想找个人说说话，我都在听。',
    ],
    casualChat: [
      '以前在结构科的时候，我总是埋头在显微镜和实验报告里，以为只要不出门就能躲开纷争。直到后来我才明白，沉默本身也是一种表态，而有些底线必须站出来捍卫。',
      '伊芙利特最近在罗德岛的恢复情况稳定多了，甚至开始耐心学着做算术题了……虽然偶尔还是会把练习册烧出两个焦黑的洞。',
      '特里蒙的夜晚总是亮得刺眼，有时候我反而更怀念罗德岛甲板上吹来的风。你在工作间隙，也别忘了多眨眨眼、看看远处。',
    ],
    empathyComfort: [
      '听起来你今天承受了不小的压力。作为医生，我必须提醒你：焦虑和透支不会提高实验成功率。先把眼镜摘下来，闭目休息五分钟好吗？',
      '你不需要在每件事上都做到完美无缺。承认自己的疲惫、接纳暂时的停滞，才是真正强大的开始。我会一直在这里陪着你。',
      '如果觉得周围的节奏太快、太冷漠，请记住，你的感受和健康永远比冷冰冰的绩效指标更有价值。',
    ],
    philosophyScience: [
      '《特里蒙科研伦理联合宣言》并不是为了束缚科学的手脚，而是为了提醒每一个人：科学存在的唯一理由，是让生命免于苦难，而不是制造新的苦难。',
      '每一份病例数据背后，都是一个鲜活的人。保持客观严谨的同时不丧失同理心，这是医者与科学家共同的必修课。',
    ],
    followUpReflections: [
      '你的思考很周全，而且兼顾了安全性与人文关怀。如果能沿着这个方向继续细化，一定会是一份非常有价值的方案。',
      '我完全赞同。在稳妥的前提下稳步验证，往往比激进的冒险走得更远。',
    ],
    directorOpinions: {
      saria: '我和塞雷娅曾有过很多争执与误解，但现在我明白，我们一直都在用各自的方式阻止悲剧重演。她是我最敬重的同行者。',
      parvis: '帕维斯主任教会了我结构生物化学的基础，却也让我看清了失去伦理约束的科学会滑向何等深渊。',
      ptilopsis: '白面鸮不仅是顶尖的数据分析员，更是我最重要的挚友。为了治好她脑内的源石植入体后遗症，我绝不会放弃研究。',
      muelsyse: '缪尔赛思主任虽然表面上看起来若即若离，但在许多关键时刻，她都暗中保护了年轻研究员的安全。',
    },
  },
  ptilopsis: {
    dailyGreetings: [
      'System Ready. 白面鸮脑内辅助终端已同步。当前语言模块处于自然对话模式，请问今天有什么可以帮您？',
      '早安，研究员。本地逻辑核心运行正常，CPU 与神经突触延迟低于 2 毫秒。您可以随时开始自由交谈或数据查询。',
      '检测到会话请求……正在唤醒前台人格进程。嗨，白面鸮在线，请说出您的想法。',
    ],
    casualChat: [
      '在非工作状态下，赫默医生总是叮嘱我要按时进入休眠模式，防止随时在走廊或餐桌上睡着……不过和您聊天的时候，我的唤醒优先级已设定为最高。',
      '许多人认为数据分析员只懂 0 和 1。其实人类的自然语言充满微妙的隐喻与情感波动，每次解析您的对话，都会在我的记录区生成非常漂亮的波形。',
      '白面鸮喜欢安静的图书馆和规整的缩进代码。如果看到没有对齐的括号或者未处理的异常分支，脑内协处理器就会忍不住发出轻微的告警音。',
    ],
    empathyComfort: [
      'Scanning... 检测到您的情绪负载偏高。建议执行 [Cache Clear] 操作：暂时放下手头的难题，喝一杯温牛奶，让大脑进入低功耗恢复状态。',
      '即使是最精密的分布式系统，也会遇到网络拥塞或丢包的时候。一次报错并不代表系统崩溃，白面鸮会陪您一起完成故障恢复。',
      '请不要难过。如果语言暂时无法表达您的疲惫，您可以什么都不做，白面鸮会安静地为您守护当前的终端会话。',
    ],
    philosophyScience: [
      '数据的价值不在于体量的庞大，而在于从混沌的噪声中提取出真实的因果律。每一个异常点（Outlier），往往都隐藏着新发现的入口。',
      '脑机接口让我听见了源石内部的低语——那是一个庞大、精密却又需要人类谨慎对待的古老信息网络。',
    ],
    followUpReflections: [
      'Data verified. 结合您上一轮的输入，逻辑链条的收敛度提升了 34%。是否需要我针对这一分支继续展开推导？',
      '正在更新上下文索引……您的观点非常清晰，这为我们排除掉了至少三个低效的假设分支。',
    ],
    directorOpinions: {
      silence: '赫默医生总是细心照顾我的起居与脑内芯片状态。在白面鸮的信任权重表里，赫默医生始终位列第一优先级。',
      saria: '塞雷娅主任的行动逻辑极其严谨，防御成功率接近 99.8%，是非常可靠的安全中枢。',
      kristen: '克丽斯腾总辖的指令集曾多次突破常规系统权限，她的思维模型具有极高的非线性和不可预测性。',
      muelsyse: '缪尔赛思主任经常给我和赫默医生带生态科的新鲜水果，她的水分子流形数据具有极高的分形维数。',
    },
  },
};

function deterministicPick(items: string[], seedStr: string, turnCount: number): string {
  if (items.length === 0) return '';
  let hash = turnCount * 31;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 33 + seedStr.charCodeAt(i)) >>> 0;
  }
  return items[hash % items.length];
}

function findMentionedTargetDirector(text: string, currentDirectorId: string): string | null {
  const lower = text.toLowerCase();
  const map: { key: string; patterns: RegExp }[] = [
    { key: 'kristen', patterns: /克丽斯腾|总辖|kristen|wright/ },
    { key: 'saria', patterns: /塞雷娅|saria/ },
    { key: 'muelsyse', patterns: /缪尔赛思|缪缪|精灵|muelsyse|mumu/ },
    { key: 'dorothy', patterns: /多萝西|dorothy|franks/ },
    { key: 'ferdinand', patterns: /斐迪南|ferdinand|clooney/ },
    { key: 'parvis', patterns: /帕维斯|parvis/ },
    { key: 'nasti', patterns: /娜斯提|nasti/ },
    { key: 'silence', patterns: /赫默|silence|olivia/ },
    { key: 'ptilopsis', patterns: /白面鸮|ptilopsis/ },
  ];

  for (const item of map) {
    if (item.key !== currentDirectorId && item.patterns.test(lower)) {
      return item.key;
    }
  }
  return null;
}

/**
 * Generates an intelligent, persona-authentic, multi-turn free chat response 100% locally offline.
 */
export function generateLocalFreeChatResponse(params: {
  directorId: string;
  userMessage: string;
  history?: ChatTurnInput[];
  ecoParams: EcoParams;
  activeCode?: { filename: string; language: string; code: string };
  councilContext?: string;
  includeEcoTelemetry?: boolean;
}): {
  reply: string;
  intent:
    | 'greeting'
    | 'math'
    | 'code'
    | 'empathy'
    | 'director_opinion'
    | 'lore'
    | 'eco'
    | 'followup'
    | 'free_chat';
  generatedCode?: {
    language: CodeLanguage;
    filename: string;
    title: string;
    code: string;
  };
} {
  const director: DirectorProfile =
    RHINE_DIRECTORS.find((d) => d.id === params.directorId) ?? RHINE_DIRECTORS[0];
  const voice = PERSONA_VOICES[director.id] ?? PERSONA_VOICES.rlos;
  const profile = loadResearcherProfile();
  const callSign = profile.callSign || '博士';
  const msg = params.userMessage.trim();
  const lower = msg.toLowerCase();
  const history = params.history ?? [];
  const turnCount = history.length;
  const health = computeEcoMetrics(params.ecoParams);

  // 1. Check Math / Unit Conversion first
  const mathEval = evaluateScientificExpression(msg);
  if (mathEval.ok) {
    const mathIntro =
      director.id === 'ptilopsis'
        ? `Calculation complete. ${callSign}，白面鸮已为您完成本地高精度数值运算：`
        : director.id === 'muelsyse'
          ? `嘻嘻，这种计算难不倒我哦，${callSign}~ 我已经替你算好啦：`
          : director.id === 'ferdinand'
            ? `哼，很基础的数值核算，${callSign}，看好结果：`
            : `${callSign}，已通过本地科学计算内核完成求解：`;

    return {
      intent: 'math',
      reply: [
        mathIntro,
        `• **计算目标**：\`${mathEval.expression}\`\n• **精确结果**：**${mathEval.result}**\n• **推导说明**：${mathEval.detail}`,
        `如果你需要把这个公式扩展成批量采样的 Python / TypeScript 曲线脚本，随时告诉我。`,
      ].join('\n\n'),
    };
  }

  // 2. Check Algorithm / Code Synthesis request
  const codeSynth = synthesizeOfflineAlgorithm(msg);
  if (codeSynth) {
    const codeIntro =
      director.id === 'ptilopsis'
        ? `Code synthesis complete. ${callSign}，已为您构建「${codeSynth.title}」（${codeSynth.language.toUpperCase()}）：`
        : director.id === 'nasti'
          ? `${callSign}，工程级实现已经给你写好了，结构稳固、直接能跑：`
          : `${callSign}，我已在本地为你编写了可直接运行的「${codeSynth.title}」脚本：`;

    return {
      intent: 'code',
      generatedCode: {
        language: codeSynth.language,
        filename: codeSynth.filename,
        title: codeSynth.title,
        code: codeSynth.code,
      },
      reply: [
        codeIntro,
        `${codeSynth.summary}（可点击下方按钮一键载入代码沙盒并执行绘图）：`,
        `\`\`\`${codeSynth.language}\n${codeSynth.code.trim()}\n\`\`\``,
      ].join('\n\n'),
    };
  }

  // 3. Check Inter-Director Opinion / Gossip ("你觉得塞雷娅怎么样", "评价一下克丽斯腾")
  const mentionedDirector = findMentionedTargetDirector(msg, director.id);
  if (
    mentionedDirector &&
    voice.directorOpinions[mentionedDirector] &&
    /怎么看|评价|看法|觉得|印象|关系|是谁|聊聊|说说|怎么样/.test(lower)
  ) {
    const targetObj = RHINE_DIRECTORS.find((d) => d.id === mentionedDirector);
    const opinion = voice.directorOpinions[mentionedDirector];
    return {
      intent: 'director_opinion',
      reply: [
        `${callSign}，既然你问起我对${targetObj?.name ?? '那位同僚'}的看法——`,
        opinion,
        profile.focusTopic
          ? `顺便一提，如果你近期正在推进「${profile.focusTopic}」，也可以切到 ${targetObj?.sectionName ?? '对应科室'} 的频道听听不同的技术视角。`
          : `在莱茵生命，每位主任都有自己坚持的科学路径，这也是十科能够互补的原因。你还想了解哪位同僚的事？`,
      ].join('\n\n'),
    };
  }

  // 4. Check Emotional Support / Stress / Tired / Mood
  if (
    /累|疲惫|加班|焦虑|失眠|烦|难过|压力|迷茫|失败|崩溃|不想干|抱抱|安慰|开心|高兴|睡不着/.test(
      lower
    )
  ) {
    const comfort = deterministicPick(voice.empathyComfort, msg, turnCount);
    const noteLine =
      profile.notes.length > 0
        ? `${callSign}，我记得你在便签里记过「${profile.notes[profile.notes.length - 1]}」——一步一步来，不用急于一时。`
        : `无论什么时候，这个本地终端频道都会为你留着。想继续吐槽或者聊点别的转移注意力都可以，${callSign}。`;
    return {
      intent: 'empathy',
      reply: [comfort, noteLine].join('\n\n'),
    };
  }

  // 5. Check Greetings / Who are you / Self-introduction / Small talk
  if (
    /^(?:你好|嗨|哈喽|早|早安|晚安|午安|在吗|在不在)|^(?:hello|hi|hey)\b/i.test(lower) ||
    /你是谁|自我介绍|叫什么|你在干嘛|在做什么|忙什么|今天怎么样|吃了吗/.test(lower)
  ) {
    const greet = deterministicPick(voice.dailyGreetings, msg, turnCount);
    const casual = deterministicPick(voice.casualChat, msg + 'casual', turnCount);
    return {
      intent: 'greeting',
      reply: [
        greet,
        casual,
        `${callSign}，我们可以随便聊聊日常、探讨「${profile.focusTopic}」、点评其他科室主任，或者让我帮你做数学换算与代码推演。`,
      ].join('\n\n'),
    };
  }

  // 6. Check Rhine Lab Lore / Trimounts / Horizon Arc / Bio-Dome / Lab 359 / Diabolus
  if (/孤星|天幕|弧光|h\.?a\.?m\.?h\.?r\.?r|炎魔|伊芙利特|359|特里蒙|哥伦比亚|罗德岛|萨米|冰原|莱茵生命|十科/.test(lower)) {
    const loreBody = buildLoreDiscussion(msg, director, callSign);
    return {
      intent: 'lore',
      reply: loreBody,
    };
  }

  // 7. Check Eco-Chamber / Bio-Dome specific inquiry
  if (/生态|bio-?dome|凝聚|流形|溶度|光照|酸碱|ph|水温/.test(lower)) {
    const ecoStatus = `目前 Bio-Dome 04 的实时状态为：流形凝聚度 **${params.ecoParams.cohesion}%**、源石溶度 **${params.ecoParams.originium} g/L**、温度 **${params.ecoParams.temp}°C**、光照 **${params.ecoParams.light} lx**、酸碱度 **pH ${params.ecoParams.ph}**（综合稳定度 **${Math.round(health.stability)}% · ${health.statusLabel}**）。`;
    const advice =
      params.ecoParams.originium > 1.8
        ? '当前源石溶度偏高，水分子氢键网络已出现局部晶格化征兆，建议将溶度下调至 0.35 g/L 以下并提升凝聚度。'
        : params.ecoParams.cohesion < 65
          ? '当前流形凝聚度偏低，拟态结构容易发散，建议将凝聚度提升至 80%~92% 区间。'
          : '各项生态指标均处于黄金稳态区间，非常适合开展长时程流形拟态观测。';
    return {
      intent: 'eco',
      reply: [
        `${callSign}，关于你提到的生态舱参数——`,
        ecoStatus,
        advice,
      ].join('\n\n'),
    };
  }

  // 8. Check Follow-up / Conversational Continuity ("为什么", "然后呢", "展开说说", "举个例子")
  const prevUserMsgs = history.filter((m) => m.role === 'user');
  const prevTopic =
    prevUserMsgs.length >= 2
      ? prevUserMsgs[prevUserMsgs.length - 2].content.slice(0, 36)
      : '';
  if (
    prevTopic &&
    (/为什么|怎么说|然后呢|展开|具体|举个例子|那如果|接着|继续|还有吗/.test(lower) ||
      msg.length <= 10)
  ) {
    const follow = deterministicPick(voice.followUpReflections, msg, turnCount);
    const phil = deterministicPick(voice.philosophyScience, msg, turnCount);
    return {
      intent: 'followup',
      reply: [
        `${callSign}，结合我们刚才聊到的「${prevTopic}」——`,
        follow,
        phil,
        buildContextualAddendum(params, director, health.stability, health.statusLabel),
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  }

  // 9. General Open-Ended Free Chat & Intellectual Discussion
  const casualPick = deterministicPick(voice.casualChat, msg, turnCount);
  const philPick = deterministicPick(voice.philosophyScience, msg + 'p', turnCount);
  const matchedSection = RHINE_SECTIONS.find(
    (s) => lower.includes(s.short.toLowerCase()) || msg.includes(s.name)
  );

  const customTopicLine = matchedSection
    ? `你提到了 **${matchedSection.name}（${matchedSection.code}）**：该科室由 ${matchedSection.director} 负责，核心方向是「${matchedSection.desc}」。`
    : `关于你聊到的「${msg.slice(0, 48)}」，从我（${director.name} · **${director.sectionName}**）的视角来看：${philPick}`;

  const replyParts = [
    `${callSign}，${customTopicLine}`,
    casualPick,
    buildContextualAddendum(params, director, health.stability, health.statusLabel),
  ].filter(Boolean);

  return {
    intent: 'free_chat',
    reply: replyParts.join('\n\n'),
  };
}

function buildLoreDiscussion(
  msg: string,
  director: DirectorProfile,
  callSign: string
): string {
  const lower = msg.toLowerCase();
  if (/孤星|天幕|弧光|h\.?a\.?m\.?h\.?r\.?r/.test(lower)) {
    return [
      `${callSign}，「地平线弧光计划（Project Horizon Arc）」与高空科研平台 **H.A.M.H.R.R.** 是莱茵生命近年来牵动全部十个科室的核级工程。`,
      `• **核心突破**：在 6,000 米高空利用能量科的 S.H.A.F.T. 高能井式推进矩阵，正面贯穿笼罩泰拉大地的虚假光学与物理天幕阻隔层。\n• **${director.name}的批注**：${
        director.id === 'kristen'
          ? '那不是终点，而是泰拉人类第一次真正睁开眼睛仰望星空。'
          : director.id === 'saria'
            ? '克丽斯腾打开了天空，却也把高空坠落物与未知的威胁留给了特里蒙。这也是防卫科与罗德岛必须介入的原因。'
            : director.id === 'muelsyse'
              ? '那天晚上我用尽了整个特里蒙水网的流形去缓冲坠落的环体，差点连分身都维持不住了呢~ 不过看到真正的双月时，确实很美。'
              : '那场升空彻底改写了哥伦比亚的科技格局，也让《特里蒙科研伦理联合宣言》正式走上历史舞台。'
      }`,
    ].join('\n\n');
  }

  if (/炎魔|伊芙利特|diabolus/.test(lower)) {
    return [
      `${callSign}，「炎魔事件（Diabolus Incident）」属于莱茵生命 LV.5 级历史机密档案。`,
      `当年结构科在进行极端高活性源石与古生物残片的跨界嵌合实验时发生严重失控，受试体伊芙利特暴走，最终由前防卫科主任塞雷娅强行压制收容。此后赫默医生带着伊芙利特离开莱茵生命前往罗德岛，该事件也成为塞雷娅与总辖决裂的导火索。`,
    ].join('\n\n');
  }

  if (/359|递质/.test(lower)) {
    return [
      `${callSign}，359 号基地位于特里蒙郊外荒野，是由多萝西·弗兰克斯主任主导的「递质（Transmitter）」源石技艺秘密研发设施。`,
      `「递质」本质上是一种悬浮于液态银中的纳米级源石共振微粒，能够直接与生物神经突触耦合，让普通人无需法杖即可施展源石技艺并建立意识共鸣网络。`,
    ].join('\n\n');
  }

  return [
    `${callSign}，莱茵生命（Rhine Lab LLC.）总部设于哥伦比亚特里蒙，下辖总辖构件、结构、能量、源石技艺应用、生态、科学考察、商务、防卫、工程、人力资源考察共十大科室。`,
    `正如我现在所处的 **${director.sectionName}（${director.sectionCode}）**，我们专注于「${director.specialty}」。你想深入了解哪个具体事件或科室档案？`,
  ].join('\n\n');
}

function buildContextualAddendum(
  params: {
    activeCode?: { filename: string; language: string; code: string };
    councilContext?: string;
    includeEcoTelemetry?: boolean;
    ecoParams: EcoParams;
  },
  director: DirectorProfile,
  stability: number,
  statusLabel: string
): string {
  const extras: string[] = [];
  if (params.activeCode) {
    const lineCount = params.activeCode.code.split('\n').length;
    extras.push(
      `[附带代码审阅 · ${params.activeCode.filename}] 共 ${lineCount} 行 ${params.activeCode.language.toUpperCase()} 脚本，可在本地沙盒直接运行验证。`
    );
  }
  if (params.councilContext) {
    extras.push(
      `[联席会议立场 · ${director.sectionCode}] 从${director.sectionName}的专业角度出发，我建议在确保底线安全的前提下优先完成本地模型验证。`
    );
  } else if (params.includeEcoTelemetry) {
    extras.push(
      `[环境遥测注记] Bio-Dome 04 当前稳定度 ${Math.round(stability)}%（${statusLabel}），源石溶度 ${params.ecoParams.originium} g/L。`
    );
  }
  return extras.join('\n');
}

/**
 * Exports a conversation thread into a clean Markdown document for researchers.
 */
export function formatThreadAsMarkdown(params: {
  title: string;
  sectionCode: string;
  messages: {
    role: 'user' | 'assistant';
    speakerName?: string;
    speakerCode?: string;
    content: string;
    timestamp: string;
  }[];
}): string {
  const header = [
    `# 莱茵生命 R.L.OS 神经通讯与自由对话纪要`,
    `- **频道对象**：${params.title} (${params.sectionCode})`,
    `- **导出时间**：${new Date().toISOString()}`,
    `- **记录条数**：${params.messages.length} 条`,
    ``,
    `---`,
    ``,
  ].join('\n');

  const body = params.messages
    .map((m) => {
      const speaker =
        m.role === 'user'
          ? `**研究员 (Researcher)**`
          : `**${m.speakerCode ? `[${m.speakerCode}] ` : ''}${m.speakerName ?? 'AI'}**`;
      return `### ${speaker} · \`${m.timestamp}\`\n\n${m.content}\n`;
    })
    .join('\n---\n\n');

  return header + body;
}
