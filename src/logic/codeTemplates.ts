export type CodeLanguage = 'python' | 'typescript' | 'javascript';

export interface CodeTemplate {
  id: string;
  title: string;
  filename: string;
  language: CodeLanguage;
  sectionCode: string;
  description: string;
  code: string;
}

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: 'eco-controller',
    title: 'Bio-Dome 04 闭环生态控制器',
    filename: 'bio_dome_controller.js',
    language: 'javascript',
    sectionCode: 'ECO · 05',
    description:
      '浏览器内实时联动生态模拟舱：读取当前流形参数，运行 PI 闭环稳态优化，并将拟合曲线绘制到输出区。',
    code: `// Bio-Dome 04 生态流形闭环控制脚本 (Eco-Bridge JS)
const current = rhine.eco.getParams();
console.log("当前生态舱快照:", JSON.stringify(current));

// 目标最优态：高凝聚度 (88%)、低源石微粒 (0.25 g/L)、恒温 22.0°C
const target = { cohesion: 88, originium: 0.25, temp: 22.0, light: 7400, ph: 7.1 };
const history = [];

let coh = current.cohesion;
let orig = current.originium;

for (let step = 0; step <= 12; step++) {
  coh += (target.cohesion - coh) * 0.35;
  orig += (target.originium - orig) * 0.38;
  const stability = Math.max(0, Math.min(100, 100 - orig * 18 - Math.abs(coh - 88) * 0.4));
  history.push({ step, x: step, y: Number(stability.toFixed(2)), cohesion: Number(coh.toFixed(1)) });
}

// 实时回写调优后的参数到 Bio-Dome 04 画布
rhine.eco.setParams({
  cohesion: Math.round(coh),
  originium: Number(orig.toFixed(2)),
  temp: target.temp,
  light: target.light,
  ph: target.ph,
});

rhine.plot("Bio-Dome 04 生态稳定性收敛曲线 (%)", history.map((d) => ({ x: d.step, y: d.y })));
rhine.table(history.slice(0, 6));
console.log("✓ 已完成闭环稳态调优并同步至 Bio-Dome 04 模拟舱。");
`,
  },
  {
    id: 'manifold-ode',
    title: '水分子流形稳定性 ODE 数值求解',
    filename: 'manifold_kinetics.py',
    language: 'python',
    sectionCode: 'ECO · 05',
    description:
      '在真实 Python 3 环境中求解缪尔赛思水分子流形氢键弛豫方程，输出相态稳定性数据表与曲线。',
    code: `import math
import json

# 缪尔赛思 · 生态科 (BIO-DOME 04) 氢键流形弛豫动力学模拟
def simulate_manifold(cohesion=86.0, originium=0.35, temp_c=22.0, steps=16):
    dt = 0.25
    psi = cohesion / 100.0
    k_bond = 0.85 * (1.0 - min(0.8, originium * 0.16))
    thermal_decay = 0.012 * max(1.0, abs(temp_c - 22.0) + 1.0)

    series = []
    for i in range(steps + 1):
        t = round(i * dt, 2)
        dpsi = k_bond * (0.94 - psi) - thermal_decay * math.sin(t * 1.4) * 0.15
        psi = max(0.05, min(1.0, psi + dpsi * dt))
        manifold_pct = round(psi * 100.0, 2)
        series.append({"t": t, "psi": round(psi, 4), "manifold_pct": manifold_pct})
    return series

results = simulate_manifold()
print("=== RHINE LAB // MANIFOLD KINETICS OUTPUT ===")
for row in results[::2]:
    bar = "#" * int(row["manifold_pct"] // 4)
    print(f"t={row['t']:>4.2f}s | 拟态度={row['manifold_pct']:>6.2f}% | {bar}")

print("\\n__RHINE_PLOT__:" + json.dumps({
    "title": "水分子流形拟态度弛豫轨迹 (%)",
    "points": [{"x": r["t"], "y": r["manifold_pct"]} for r in results]
}))
`,
  },
  {
    id: 'originium-fft',
    title: '源石通量谐波与共振安全评估',
    filename: 'originium_fft_analyzer.ts',
    language: 'typescript',
    sectionCode: 'NRG · 03',
    description:
      '利用 TypeScript 强类型进行 DFT 离散傅里叶频谱计算，识别 Arc-01 S.H.A.F.T. 高能井式推进矩阵共振峰。',
    code: `interface TelemetrySample {
  idx: number;
  msv: number;
}

interface SpectralPeak {
  harmonic: number;
  freqHz: number;
  amplitude: number;
  risk: "NOMINAL" | "ELEVATED" | "CRITICAL";
}

const N = 32;
const samples: TelemetrySample[] = Array.from({ length: N }, (_, n) => ({
  idx: n,
  msv:
    42.0 +
    6.4 * Math.sin((2 * Math.PI * 3 * n) / N) +
    3.1 * Math.cos((2 * Math.PI * 7 * n) / N) +
    1.2 * Math.sin((2 * Math.PI * 11 * n) / N),
}));

const peaks: SpectralPeak[] = [];
for (let k = 1; k <= 12; k++) {
  let re = 0;
  let im = 0;
  for (const s of samples) {
    const angle = (2 * Math.PI * k * s.idx) / N;
    re += s.msv * Math.cos(angle);
    im -= s.msv * Math.sin(angle);
  }
  const amplitude = Number(((Math.hypot(re, im) * 2) / N).toFixed(3));
  const risk: SpectralPeak["risk"] =
    amplitude > 5.0 ? "CRITICAL" : amplitude > 2.5 ? "ELEVATED" : "NOMINAL";
  peaks.push({ harmonic: k, freqHz: k * 118.5, amplitude, risk });
}

console.log("S.H.A.F.T. 源石通量 DFT 频谱分析 (前 8 阶谐波):");
console.table(peaks.slice(0, 8));
console.log(
  "__RHINE_PLOT__:" +
    JSON.stringify({
      title: "S.H.A.F.T. 谐波能量幅值 (mSv)",
      points: peaks.map((p) => ({ x: p.harmonic, y: p.amplitude })),
    })
);
`,
  },
  {
    id: 'hamhrr-ascent',
    title: 'H.A.M.H.R.R. 突破天幕轨道推演',
    filename: 'hamhrr_orbital_delta_v.py',
    language: 'python',
    sectionCode: 'CMPT · 01',
    description:
      '克丽斯腾「孤星」计划轨道物理计算：模拟多级 S.H.A.F.T. 推进到达 6,000m 天幕阻隔层的速度与剩余燃料。',
    code: `import json

# PROJECT HORIZON ARC // H.A.M.H.R.R. 多级推进弹道推演
mass_dry = 18500.0   # kg
mass_fuel = 14200.0  # kg
thrust = 540000.0    # N (S.H.A.F.T. 矩阵总推力)
burn_rate = 175.0    # kg/s
g_terra = 9.81

alt = 0.0
vel = 0.0
dt = 1.0
trajectory = []

for t in range(1, 65):
    if mass_fuel > 0:
        dm = min(mass_fuel, burn_rate * dt)
        mass_fuel -= dm
        f_net = thrust - (mass_dry + mass_fuel) * g_terra - 0.18 * (vel ** 2)
    else:
        f_net = -(mass_dry) * g_terra - 0.12 * (vel ** 2)

    acc = f_net / (mass_dry + mass_fuel)
    vel = max(0.0, vel + acc * dt)
    alt += vel * dt
    if t % 4 == 0 or alt >= 6000.0:
        trajectory.append({
            "t_sec": t,
            "alt_m": round(alt, 1),
            "vel_ms": round(vel, 1),
            "fuel_kg": round(mass_fuel, 1),
        })
    if alt >= 6200.0:
        break

print(f"突破 6,000m 天幕阈值耗时: {trajectory[-1]['t_sec']}s | 末速: {trajectory[-1]['vel_ms']} m/s | 高度: {trajectory[-1]['alt_m']} m")
print("__RHINE_PLOT__:" + json.dumps({
    "title": "H.A.M.H.R.R. 升空高度-时间轨迹 (m)",
    "points": [{"x": p["t_sec"], "y": p["alt_m"]} for p in trajectory]
}))
`,
  },
];
