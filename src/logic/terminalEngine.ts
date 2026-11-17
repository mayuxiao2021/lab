import {
  RHINE_DIRECTORS,
  RHINE_OPERATORS,
  RHINE_SECTIONS,
  VIRTUAL_FILES,
  type DirectorProfile,
  type RhineSection,
} from '../data/rhineLore';
import {
  ECO_PRESETS,
  computeEcoMetrics,
  type EcoParams,
  type EcoPresetId,
} from './ecoSimulation';
import {
  evaluateScientificExpression,
  loadResearcherProfile,
  saveResearcherProfile,
} from './localChatEngine';

export type WorkspaceView = 'terminal' | 'comms' | 'code' | 'eco';
export type OutputTone = 'normal' | 'accent' | 'eco' | 'info' | 'warn' | 'error' | 'muted';

export interface TerminalCodeBlock {
  language: 'python' | 'typescript' | 'javascript';
  title: string;
  code: string;
}

export interface TerminalEntry {
  id: string;
  kind: 'command' | 'line' | 'dossier' | 'ai';
  promptPath?: string;
  text?: string;
  title?: string;
  speakerName?: string;
  speakerCode?: string;
  lines?: string[];
  codeBlocks?: TerminalCodeBlock[];
  toolActions?: string[];
  tone?: OutputTone;
}

export interface CommandEffect {
  entries: TerminalEntry[];
  clear?: boolean;
  reboot?: boolean;
  switchView?: WorkspaceView;
  selectSection?: RhineSection;
  selectDirectorId?: string;
  applyPreset?: EcoPresetId;
  setTheme?: 'light' | 'dark' | 'toggle';
  setDecrypted?: boolean;
  triggerScan?: boolean;
  openEnvironmentModal?: boolean;
}

export interface CommandContext {
  activeSection: RhineSection;
  decrypted: boolean;
  ecoParams: EcoParams;
}

export const COMMAND_NAMES = [
  'help',
  'eco',
  'code',
  'comms',
  'talk',
  'ai',
  'calc',
  'note',
  'env',
  'apk',
  'sections',
  'inspect',
  'operators',
  'ls',
  'cat',
  'decrypt',
  'scan',
  'theme',
  'whoami',
  'date',
  'clear',
  'reboot',
] as const;

let seq = 0;
export function nextTerminalId(prefix = 'entry'): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function findDirectorMatch(query: string): DirectorProfile | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return RHINE_DIRECTORS.find(
    (d) =>
      d.id.toLowerCase() === q ||
      d.name.toLowerCase().includes(q) ||
      d.enName.toLowerCase().includes(q) ||
      d.sectionCode.toLowerCase().includes(q)
  );
}

export type InputRouting =
  | { mode: 'empty' }
  | { mode: 'cli'; command: string }
  | { mode: 'ai'; prompt: string; directorId?: string };

/**
 * Classifies terminal input into either a built-in deterministic CLI command
 * or an intelligent AI query (supporting `@director message`, `ai message`, or natural language).
 */
export function resolveTerminalInput(raw: string): InputRouting {
  const trimmed = raw.trim();
  if (!trimmed) return { mode: 'empty' };

  if (trimmed.startsWith('@')) {
    const spaceIdx = trimmed.indexOf(' ');
    const targetToken = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const body = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
    const matched = findDirectorMatch(targetToken);
    if (matched) {
      return {
        mode: 'ai',
        directorId: matched.id,
        prompt: body || `向${matched.name}发起通信问候并请求当前科室简报。`,
      };
    }
  }

  const firstToken = trimmed.split(/\s+/)[0].toLowerCase();
  if (firstToken === 'ai' || firstToken === 'ask') {
    const body = trimmed.slice(firstToken.length).trim();
    return {
      mode: 'ai',
      prompt: body || '请汇报当前 R.L.OS 系统与各科室联机状态。',
    };
  }

  if ((COMMAND_NAMES as readonly string[]).includes(firstToken) || firstToken === '?' || firstToken === 'cls' || firstToken === 'sim' || firstToken === 'muelsyse' || firstToken === 'staff' || firstToken === 'lab' || firstToken === 'directors' || firstToken === 'sysinfo') {
    return { mode: 'cli', command: trimmed };
  }

  // Any natural-language query or code request automatically routes to intelligent AI
  return { mode: 'ai', prompt: trimmed };
}

export function createBootEntries(): TerminalEntry[] {
  return [
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'accent',
      text: 'RHINE LAB LLC. · R.L.OS v4.2 INTELLIGENT WORKSTATION',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'muted',
      text: '----------------------------------------------------------------',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'normal',
      text: '[OK] BIOS CHECKSUM ............... VERIFIED (DIETER-SPEC 900)',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'info',
      text: '[OK] R.L.OS NEURAL CORE .......... GEMINI-4-HYDROGEN ONLINE',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'info',
      text: '[OK] MULTI-LANG CODE SANDBOX ..... PYTHON 3 / TYPESCRIPT / ECO-JS READY',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'eco',
      text: '[OK] ECO-SIM CHAMBER LINKED ...... MUELSYSE BIO-DOME 04 ONLINE',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'muted',
      text: '----------------------------------------------------------------',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'normal',
      text: '欢迎访问莱茵生命智能科研终端。"Solve Intelligence. Think Different."',
    },
    {
      id: nextTerminalId('boot'),
      kind: 'line',
      tone: 'eco',
      text: "可直接输入自然语言与 AI / 主任对话（如 '@缪尔赛思 帮我优化生态参数'），或输入 'code' 进入代码沙盒、'comms' 进入主任通讯频道、'help' 查看 CLI 指令。",
    },
  ];
}

export function autocompleteCommand(input: string): string | null {
  const trimmedStart = input.trimStart();
  if (!trimmedStart) return null;
  if (trimmedStart.startsWith('@') && !trimmedStart.includes(' ')) {
    const q = trimmedStart.slice(1).toLowerCase();
    const match = RHINE_DIRECTORS.find(
      (d) => d.id.startsWith(q) || d.name.toLowerCase().startsWith(q)
    );
    return match ? `@${match.id} ` : null;
  }

  const parts = trimmedStart.split(/\s+/);
  if (parts.length === 1) {
    const match = COMMAND_NAMES.find((c) => c.startsWith(parts[0].toLowerCase()));
    return match ? `${match} ` : null;
  }
  const cmd = parts[0].toLowerCase();
  const arg = parts[1] ?? '';
  if (cmd === 'cat') {
    const match = Object.keys(VIRTUAL_FILES).find((f) => f.startsWith(arg));
    return match ? `cat ${match}` : null;
  }
  if (cmd === 'inspect') {
    const match = RHINE_SECTIONS.find((s) =>
      s.short.startsWith(arg.toUpperCase())
    );
    return match ? `inspect ${match.short}` : null;
  }
  if (cmd === 'talk') {
    const match = findDirectorMatch(arg);
    return match ? `talk ${match.id}` : null;
  }
  if (cmd === 'eco' && parts.length === 2) {
    const sub = ['status', 'preset'].find((s) => s.startsWith(arg.toLowerCase()));
    return sub ? `eco ${sub}` : null;
  }
  return null;
}

export function runTerminalCommand(
  raw: string,
  ctx: CommandContext
): CommandEffect {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { entries: [] };
  }

  const cmdEcho: TerminalEntry = {
    id: nextTerminalId('cmd'),
    kind: 'command',
    promptPath: `~/${ctx.activeSection.short.toLowerCase()}`,
    text: trimmed,
  };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'help':
    case '?':
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: 'R.L.OS 智能终端与平台指令清单',
            tone: 'accent',
            lines: [
              '自然语言 / ai <问题>          直接向 R.L.OS 本地/云端 AI 自由对话、算题或生成代码',
              '@<主任名> <消息>              直接呼叫任意主任自由聊天（例: @缪尔赛思 你好）',
              'comms / talk <主任>           打开「主任神经通讯链路」进行多轮深度自由聊天与联席会议',
              'calc <算式/换算>              本地科学计算器 (例: calc (128*4.5)/sqrt(81) 或 calc 25C转K)',
              'note [add <内容>|list|clear]  本地科研备忘便签（跨会话持久保存并与主任对话共享记忆）',
              'code / lab                    打开「多语言代码演算沙盒」(Python 3 / TS / Eco-JS)',
              'eco [status | preset <name>]  打开缪尔赛斯生态模拟舱 / 查看或加载实验预设',
              'env / apk / sysinfo           打开「环境诊断与 Android APK 打包下载中心」',
              'sections / inspect <code|name> 浏览莱茵生命十大业务科室与主任档案',
              'operators                     检索莱茵生命核心研究者与关联干员档案',
              'ls [-a] / cat <file>          浏览与读取终端档案文件 (-a 显示加密文件)',
              'decrypt <key>                 解密受保护记录 (密钥: CONTROL)',
              'scan                          启动源石通量与高空阻隔层遥测扫描',
              'theme <light|dark>            切换实验室浅色 / 深空轨道配色',
              'clear / reboot / whoami       终端控制',
            ],
          },
        ],
      };

    case 'calc': {
      const expr = args.join(' ').trim();
      if (!expr) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('err'),
              kind: 'line',
              tone: 'error',
              text: '[CALC] 请输入算式或单位换算，例如: calc sqrt(144) + sin(pi/2) 或 calc 6000m转ft',
            },
          ],
        };
      }
      const res = evaluateScientificExpression(expr);
      if (!res.ok) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('err'),
              kind: 'line',
              tone: 'error',
              text: `[CALC] 无法解析算式 '${expr}'。支持 + - * / ^ sqrt sin cos tan ln log exp pi e 及温度/长度换算。`,
            },
          ],
        };
      }
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: 'SCIENTIFIC CALCULATOR · 本地科学计算结果',
            tone: 'eco',
            lines: [
              `输入算式 : ${res.expression}`,
              `计算结果 : ${res.result}`,
              `详细说明 : ${res.detail ?? ''}`,
            ],
          },
        ],
      };
    }

    case 'note': {
      const sub = (args[0] || 'list').toLowerCase();
      const profile = loadResearcherProfile();
      if (sub === 'clear') {
        saveResearcherProfile({ ...profile, notes: [] });
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('ok'),
              kind: 'line',
              tone: 'eco',
              text: '[LAB NOTE] 已清空本地科研备忘便签。',
            },
          ],
        };
      }
      if (sub === 'add') {
        const text = args.slice(1).join(' ').trim();
        if (!text) {
          return {
            entries: [
              cmdEcho,
              {
                id: nextTerminalId('err'),
                kind: 'line',
                tone: 'error',
                text: '[LAB NOTE] 请输入便签内容，例如: note add 明日复核 Bio-Dome 04 氢键数据',
              },
            ],
          };
        }
        const nextNotes = [...profile.notes, text];
        saveResearcherProfile({ ...profile, notes: nextNotes });
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('ok'),
              kind: 'line',
              tone: 'eco',
              text: `[LAB NOTE] 已记录第 #${nextNotes.length} 条科研便签：「${text}」（已在本地持久保存并同步至主任自由聊天记忆）。`,
            },
          ],
        };
      }
      // default or list
      if (sub !== 'list') {
        const text = args.join(' ').trim();
        const nextNotes = [...profile.notes, text];
        saveResearcherProfile({ ...profile, notes: nextNotes });
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('ok'),
              kind: 'line',
              tone: 'eco',
              text: `[LAB NOTE] 已记录第 #${nextNotes.length} 条科研便签：「${text}」`,
            },
          ],
        };
      }
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: `RESEARCHER NOTES · 本地科研备忘录 (${profile.notes.length})`,
            tone: 'info',
            lines:
              profile.notes.length > 0
                ? profile.notes.map((n, idx) => `${idx + 1}. ${n}`)
                : ['暂无记录。输入 `note add <内容>` 添加新便签。'],
          },
        ],
      };
    }

    case 'env':
    case 'apk':
    case 'sysinfo':
      return {
        openEnvironmentModal: true,
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('ok'),
            kind: 'line',
            tone: 'info',
            text: '[ENV & ANDROID] 已打开运行环境诊断、后端路由配置与 Android APK 安装包下载中心。',
          },
        ],
      };

    case 'code':
    case 'lab':
      return {
        switchView: 'code',
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('ok'),
            kind: 'line',
            tone: 'info',
            text: '[CODE LAB] 已切换至莱茵生命多语言代码演算沙盒 (Python 3 / TypeScript / Eco-Bridge JS)。',
          },
        ],
      };

    case 'comms':
    case 'directors':
      return {
        switchView: 'comms',
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('ok'),
            kind: 'line',
            tone: 'accent',
            text: '[NEURAL COMMS] 已接通莱茵生命十科室主任通讯链路与联席会议室。',
          },
        ],
      };

    case 'talk': {
      const target = findDirectorMatch(args.join(' '));
      if (!target) {
        return {
          switchView: 'comms',
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('info'),
              kind: 'line',
              tone: 'info',
              text: `[NEURAL COMMS] 可通讯对象: ${RHINE_DIRECTORS.map((d) => `${d.id}(${d.name})`).join(' · ')}`,
            },
          ],
        };
      }
      return {
        switchView: 'comms',
        selectDirectorId: target.id,
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('ok'),
            kind: 'line',
            tone: 'eco',
            text: `[NEURAL COMMS] 正在为您接入「${target.name} (${target.sectionName})」加密神经通道...`,
          },
        ],
      };
    }

    case 'eco':
    case 'sim':
    case 'muelsyse': {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'status') {
        const metrics = computeEcoMetrics(ctx.ecoParams);
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('dos'),
              kind: 'dossier',
              title: 'ECO-SIM TELEMETRY · 生态舱实时参数报告',
              tone: 'eco',
              lines: [
                `流形凝聚度 : ${ctx.ecoParams.cohesion}%  |  源石溶度 : ${ctx.ecoParams.originium.toFixed(2)} g/L  |  模拟速率 : ${ctx.ecoParams.simSpeed.toFixed(1)}x`,
                `舱室温度   : ${ctx.ecoParams.temp.toFixed(1)} °C  |  光照通量 : ${ctx.ecoParams.light.toLocaleString()} lx  |  酸碱度 : pH ${ctx.ecoParams.ph.toFixed(1)}`,
                '------------------------------------------------------------',
                `生态稳定性 : ${metrics.stability.toFixed(1)}%  |  流形拟态度 : ${metrics.manifold.toFixed(1)}%  |  溶解氧 : ${metrics.oxygen.toFixed(1)} mg/L`,
                `运行状态   : ${metrics.statusLabel}`,
                `主任批注   : ${metrics.note}`,
              ],
            },
          ],
        };
      }
      if (sub === 'preset') {
        const pname = (args[1] || '').toLowerCase() as EcoPresetId;
        const found = ECO_PRESETS.find((p) => p.id === pname);
        if (!found) {
          return {
            entries: [
              cmdEcho,
              {
                id: nextTerminalId('err'),
                kind: 'line',
                tone: 'error',
                text: `[ERR] 可用预设: ${ECO_PRESETS.map((p) => p.id).join(', ')}`,
              },
            ],
          };
        }
        return {
          applyPreset: found.id,
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('ok'),
              kind: 'line',
              tone: 'eco',
              text: `[ECO-SIM] 已加载实验预设「${found.label}」(${found.id.toUpperCase()})。输入 'eco' 可查看实时画布。`,
            },
          ],
        };
      }
      const ecoSec = RHINE_SECTIONS.find((s) => s.short === 'ECO');
      return {
        switchView: 'eco',
        selectSection: ecoSec,
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('ok'),
            kind: 'line',
            tone: 'eco',
            text: '[ECO-SIM] 已切换至生态科 Bio-Dome 04 可视化模拟实验室。',
          },
        ],
      };
    }

    case 'sections':
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: 'DIRECTORY · 莱茵生命十大业务科室架构',
            tone: 'info',
            lines: RHINE_SECTIONS.map(
              (s) =>
                `${s.id}. [${s.short.padEnd(5, ' ')}] ${s.name} (${s.en}) — ${s.director}`
            ),
          },
        ],
      };

    case 'inspect': {
      if (!args.length) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('err'),
              kind: 'line',
              tone: 'error',
              text: '[ERR] 请指定科室代码或名称。例如: inspect ECO',
            },
          ],
        };
      }
      const queryUpper = args.join(' ').toUpperCase();
      const queryRaw = args.join(' ');
      const found = RHINE_SECTIONS.find(
        (s) =>
          s.short === queryUpper ||
          s.code === queryUpper ||
          s.name.includes(queryRaw)
      );
      if (!found) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('err'),
              kind: 'line',
              tone: 'error',
              text: `[ERR] 未找到科室 '${queryUpper}'。输入 'sections' 查看完整列表。`,
            },
          ],
        };
      }
      return {
        selectSection: found,
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: `SECTION DOSSIER · ${found.code}`,
            tone: 'accent',
            lines: [
              `科室名称 : ${found.name} (${found.en})`,
              `当前主任 : ${found.director}`,
              `职能概要 : ${found.desc}`,
              `快捷指令 : 输入 'talk ${found.directorId}' 可直接与该科室负责人建立通讯`,
            ],
          },
        ],
      };
    }

    case 'operators':
    case 'staff':
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: 'PERSONNEL DB · 莱茵生命核心研究者与关联干员',
            tone: 'info',
            lines: RHINE_OPERATORS.map(
              (op) =>
                `${op.id} ${op.name} | ${op.role}\n      状态: [${op.status}] — ${op.note}`
            ),
          },
        ],
      };

    case 'ls': {
      const showHidden = args.includes('-a') || args.includes('-la');
      const visible = Object.keys(VIRTUAL_FILES).filter(
        (f) => showHidden || !f.startsWith('.')
      );
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('dos'),
            kind: 'dossier',
            title: `FILES · /rhine-lab/${ctx.activeSection.short.toLowerCase()}`,
            tone: 'info',
            lines: visible.map((f) =>
              f.startsWith('.') ? `[HIDDEN] ${f}` : `         ${f}`
            ),
          },
        ],
      };
    }

    case 'cat': {
      const fname = args[0];
      if (!fname) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('err'),
              kind: 'line',
              tone: 'error',
              text: '[ERR] 请指定文件名。例如: cat arc01_hamhrr.dat',
            },
          ],
        };
      }
      if (fname === '.starpod_barrier.log' && ctx.decrypted) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('dos'),
              kind: 'dossier',
              title: 'DECRYPTED LOG · STARPOD_BARRIER.LOG',
              tone: 'accent',
              lines: [
                '记录人: Kristen Wright (总辖构件科)',
                '"地面之上六千米并非虚无。它是一层由前代文明编织的光学与物理帷幕。"',
                '"今天，特里蒙的市民将第一次看见真正的星空与双月。"',
                '"晚安，罗德岛。早安，特里蒙。" [AD ASTRA]',
              ],
            },
          ],
        };
      }
      if (VIRTUAL_FILES[fname]) {
        return {
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('dos'),
              kind: 'dossier',
              title: `FILE · ${fname}`,
              tone: 'info',
              lines: VIRTUAL_FILES[fname].split('\n'),
            },
          ],
        };
      }
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('err'),
            kind: 'line',
            tone: 'error',
            text: `[ERR] 找不到文件 '${fname}'。请使用 'ls -a' 核对文件名。`,
          },
        ],
      };
    }

    case 'decrypt': {
      const key = (args[0] || '').toUpperCase();
      if (['CONTROL', 'AD_ASTRA', 'GOOD_MORNING_TRIMOUNTS'].includes(key)) {
        return {
          setDecrypted: true,
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('ok'),
              kind: 'line',
              tone: 'eco',
              text: '[ACCESS GRANTED] 密钥验证成功，已解锁 .starpod_barrier.log：',
            },
            {
              id: nextTerminalId('dos'),
              kind: 'dossier',
              title: 'DECRYPTED LOG · STARPOD_BARRIER.LOG',
              tone: 'accent',
              lines: [
                '记录人: Kristen Wright (总辖构件科)',
                '"今天，特里蒙的市民将第一次看见真正的星空与双月。"',
                '"晚安，罗德岛。早安，特里蒙。" [AD ASTRA]',
              ],
            },
          ],
        };
      }
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('err'),
            kind: 'line',
            tone: 'error',
            text: `[ACCESS DENIED] 无效密钥 '${key || 'EMPTY'}'。提示：尝试 'decrypt CONTROL'。`,
          },
        ],
      };
    }

    case 'scan':
      return {
        triggerScan: true,
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('scan'),
            kind: 'dossier',
            title: 'TELEMETRY SCAN · TRIMOUNTS SKYWARD ARRAY',
            tone: 'accent',
            lines: [
              '雷达阵列校准 ...................... 100% NOMINAL',
              '6,000m 高度源石粒子密度 ........... 0.88 u/L (偏高)',
              'H.A.M.H.R.R. 共鸣频率 ............. 1420.405 MHz [LOCKED]',
            ],
          },
        ],
      };

    case 'theme': {
      const mode = (args[0] || '').toLowerCase();
      if (mode === 'dark' || mode === 'light') {
        return {
          setTheme: mode,
          entries: [
            cmdEcho,
            {
              id: nextTerminalId('ok'),
              kind: 'line',
              tone: 'eco',
              text: `[UI] 终端配色已切换为: ${mode === 'dark' ? '深空轨道 (Orbit Dark)' : '实验室浅色 (Lab Light)'}`,
            },
          ],
        };
      }
      return {
        setTheme: 'toggle',
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('ok'),
            kind: 'line',
            tone: 'eco',
            text: '[UI] 已切换实验室 / 深空轨道配色主题。',
          },
        ],
      };
    }

    case 'whoami':
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('info'),
            kind: 'line',
            tone: 'normal',
            text: `researcher · 隶属科室: ${ctx.activeSection.name} (${ctx.activeSection.code}) · 权限等级: LV.4`,
          },
        ],
      };

    case 'date':
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('info'),
            kind: 'line',
            tone: 'normal',
            text: `Terran Standard Time: ${new Date().toISOString()} (Columbia / Trimounts)`,
          },
        ],
      };

    case 'clear':
    case 'cls':
      return { clear: true, entries: [] };

    case 'reboot':
      return { reboot: true, entries: createBootEntries() };

    default:
      return {
        entries: [
          cmdEcho,
          {
            id: nextTerminalId('err'),
            kind: 'line',
            tone: 'error',
            text: `[CMD NOT FOUND] 未知指令 '${cmd}'。输入 'help' 查看帮助。`,
          },
        ],
      };
  }
}
