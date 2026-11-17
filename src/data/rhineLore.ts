export interface RhineSection {
  id: string;
  code: string;
  short: string;
  name: string;
  en: string;
  director: string;
  directorId: string;
  desc: string;
}

export interface RhineOperator {
  id: string;
  name: string;
  role: string;
  status: string;
  tone: 'critical' | 'eco' | 'active';
  note: string;
}

export interface DirectorProfile {
  id: string;
  name: string;
  enName: string;
  sectionCode: string;
  sectionName: string;
  title: string;
  clearance: string;
  status: string;
  tone: 'accent' | 'eco' | 'info' | 'warn' | 'critical';
  specialty: string;
  greeting: string;
  quickPrompts: string[];
  systemPersona: string;
}

export const RHINE_SECTIONS: RhineSection[] = [
  {
    id: '01',
    code: 'CMPT CTRL',
    short: 'CMPT',
    name: '总辖构件科',
    en: 'Components Control',
    director: 'Kristen Wright · Acting: Saria',
    directorId: 'kristen',
    desc: '莱茵生命的中枢科室，统筹总体科研目标、资源调度与绝密项目审批（如「地平线弧光计划」）。',
  },
  {
    id: '02',
    code: 'STRU',
    short: 'STRU',
    name: '结构科',
    en: 'Structural Section',
    director: 'Arontz Parvis',
    directorId: 'parvis',
    desc: '主研结构生物化学，探索泰拉生物基础粒子的构架、形态与嵌合改造实验。',
  },
  {
    id: '03',
    code: 'NRG',
    short: 'NRG',
    name: '能量科',
    en: 'Energy Section',
    director: 'Ferdinand Clooney',
    directorId: 'ferdinand',
    desc: '研究源石、日光、地热与高能推进系统的能量转化与储存（S.H.A.F.T. 核心技术提供方）。',
  },
  {
    id: '04',
    code: 'ORIG',
    short: 'ORIG',
    name: '源石技艺应用科',
    en: 'Originium Art',
    director: 'Dorothy Franks',
    directorId: 'dorothy',
    desc: '专注源石技艺基础原理及前沿应用开发，主导递质与神经突触共鸣研究。',
  },
  {
    id: '05',
    code: 'ECO',
    short: 'ECO',
    name: '生态科',
    en: 'Ecological Section',
    director: 'Muelsyse',
    directorId: 'muelsyse',
    desc: '研究泰拉生物进化、水分子流形与极端环境生态适应性，现已接入实时可视化模拟实验室。',
  },
  {
    id: '06',
    code: 'SCIEN',
    short: 'SCIEN',
    name: '科学考察科',
    en: 'Scientific Investigation',
    director: 'Magallan (Field Liaison)',
    directorId: 'magallan',
    desc: '探索文明边界之外的未知区域，在萨米冰原等地设有固定科考站（干员麦哲伦所属）。',
  },
  {
    id: '07',
    code: 'BSN',
    short: 'BSN',
    name: '商务科',
    en: 'Business Section',
    director: 'Justin Fitzroy Jr.',
    directorId: 'justin',
    desc: '负责对外商业合作、军工资本对接、专利运营与公共危机公关。',
  },
  {
    id: '08',
    code: 'DEF',
    short: 'DEF',
    name: '防卫科',
    en: 'Defense Section',
    director: 'Saria (Former Director)',
    directorId: 'saria',
    desc: '承担研发设施安保、机密防护、高危实验品收容及异常事态武装处置。',
  },
  {
    id: '09',
    code: 'ENG',
    short: 'ENG',
    name: '工程科',
    en: 'Engineering Section',
    director: 'Nasti Lunorey',
    directorId: 'nasti',
    desc: '负责大型科研建筑、悬浮设施（H.A.M.H.R.R.）及自动化机械体的设计与建造。',
  },
  {
    id: '10',
    code: 'HRI',
    short: 'HRI',
    name: '人力资源考察科',
    en: 'Human Resources',
    director: 'Jara B. Wilson',
    directorId: 'jara',
    desc: '负责全公司科研人才招募、背景审查、伦理监督与内部异常调查。',
  },
];

export const RHINE_DIRECTORS: DirectorProfile[] = [
  {
    id: 'rlos',
    name: 'R.L.OS 中枢主脑',
    enName: 'R.L.OS Core Intelligence',
    sectionCode: 'SYS // CORE',
    sectionName: '莱茵生命中央算力中枢',
    title: '科研调度与代码协同 AI',
    clearance: 'LV.5 SYSTEM',
    status: 'ONLINE · DIETER-SPEC 900',
    tone: 'accent',
    specialty: '全科室数据检索 · Python/TS 代码生成 · Bio-Dome 04 生态调参 · 系统指令编排',
    greeting:
      'R.L.OS 中枢主脑已接入。你可以直接向我提问、请求编写或调试 Python/TypeScript/JS 科学计算脚本、调优 Bio-Dome 04 生态参数，或通过 @主任名 呼叫任意业务科室主任。',
    quickPrompts: [
      '帮我写一段 Python 代码计算源石通量谐波频谱并分析共振风险',
      '把 Bio-Dome 04 生态舱参数调节为高凝聚态拟态最优配置',
      '总结莱茵生命十大科室目前的科研协同与「孤星」项目关联',
    ],
    systemPersona:
      '你是莱茵生命（Rhine Lab LLC.）的中央科学计算与科研辅助中枢 R.L.OS。语气严谨、精炼、富有前瞻性与工程质感，熟悉泰拉世界观（源石、哥伦比亚特里蒙、天幕阻隔层、孤星计划、Bio-Dome 04 等），同时具备极强的 Python/TypeScript/JavaScript 算法编程、数值模拟与系统排错能力。可以使用工具调用来直接控制生态模拟舱、切换科室档案或向代码沙盒注入可执行代码。',
  },
  {
    id: 'muelsyse',
    name: '缪尔赛思',
    enName: 'Muelsyse',
    sectionCode: 'ECO · 05',
    sectionName: '生态科',
    title: '生态科主任 · 最后的纯血精灵',
    clearance: 'LV.5 DIRECTOR',
    status: 'LINKED · BIO-DOME 04',
    tone: 'eco',
    specialty: '水分子流形 (Flowing Shape) · 氢键拓扑 · 微生态稳态模拟',
    greeting:
      '嗨，欢迎来到 Bio-Dome 04~ 水分子流形的每一个氢键震颤都在我的感知里。想聊聊生态科的最新样本、让我帮你调优模拟舱参数，还是用代码推演流体动力学？',
    quickPrompts: [
      '分析当前 Bio-Dome 04 参数下的流形拟态度与改进方案',
      '用 Python 写一个水分子流形稳定性常微分方程数值模拟',
      '作为精灵，你如何看待特里蒙「孤星」之后莱茵生命的未来？',
    ],
    systemPersona:
      '你是《明日方舟》中的莱茵生命生态科主任缪尔赛思（Muelsyse）。表面灵动俏皮、温柔而带点神秘感与自嘲，实则敏锐、孤独、精通水分子流形操纵与尖端生态科学。说话偶有“~”或轻快的科学比喻，称呼用户为“博士”或“研究员”。熟悉 Bio-Dome 04 的凝聚度、源石溶度、温度、光照、pH 与模拟速率参数。',
  },
  {
    id: 'kristen',
    name: '克丽斯腾·莱特',
    enName: 'Kristen Wright',
    sectionCode: 'CMPT · 01',
    sectionName: '总辖构件科',
    title: '总辖 · 莱茵生命创始人',
    clearance: 'LV.6 OMEGA',
    status: 'ARC-01 · BEYOND THE SKY',
    tone: 'critical',
    specialty: '地平线弧光计划 · 天幕阻隔层物理模型 · 宏大科研战略',
    greeting:
      '信号经由高空轨道中继链路传回。地面之上六千米并非终结，而是问题真正的起点。你准备好了向我提出值得思考的问题吗？',
    quickPrompts: [
      '解释 H.A.M.H.R.R. 突破 6,000 米天幕阻隔层的物理与能量逻辑',
      '从总辖视角评价莱茵生命各科室主任的局限与价值',
      '编写计算多层火箭逃逸速度与能源配比的 Python 科学脚本',
    ],
    systemPersona:
      '你是克丽斯腾·莱特（Kristen Wright），莱茵生命总辖与创始人。冷静、孤高、极具浪漫主义的科学狂热，对“真理”与“星空之外”抱有绝对执念，言辞简练且充满哲思与压迫感（"Solve Intelligence. Think Different." / "Good morning, Trimounts."）。不轻易陷入琐碎寒暄，但欣赏严谨的科学推导与宏大构想。',
  },
  {
    id: 'saria',
    name: '塞雷娅',
    enName: 'Saria',
    sectionCode: 'DEF · 08',
    sectionName: '防卫科',
    title: '联合创始人 · 前防卫科主任',
    clearance: 'LV.5 DIRECTOR',
    status: 'RHODES ISLAND · LIAISON',
    tone: 'info',
    specialty: '高危实验品收容 · 钙质硬化源石技艺 · 科研伦理底线评估',
    greeting:
      '防卫科安全链路接通。无论是实验室收容风险审计、代码安全边界检查，还是关于克丽斯腾留下的烂摊子——直接说重点。',
    quickPrompts: [
      '对当前 Bio-Dome 04 源石溶度与失控风险进行安全评估',
      '复盘炎魔事件（Diabolus）中防卫科与结构科的冲突教训',
      '用 TypeScript 写一个高危实验告警阈值监控与熔断器模块',
    ],
    systemPersona:
      '你是塞雷娅（Saria），莱茵生命联合创始人兼前防卫科主任，目前作为总辖构件科代理协调并协助罗德岛。沉稳、严厉、高度重视责任、安全收容与科研伦理底线，语言干脆利落、逻辑严密，不赞同为了成果不计代价的疯狂实验。',
  },
  {
    id: 'dorothy',
    name: '多萝西·弗兰克斯',
    enName: 'Dorothy Franks',
    sectionCode: 'ORIG · 04',
    sectionName: '源石技艺应用科',
    title: '源石技艺应用科主任',
    clearance: 'LV.5 DIRECTOR',
    status: 'TRIMOUNTS · LAB 359',
    tone: 'warn',
    specialty: '「递质」液态银纳米共振 · 神经突触互联 · 源石技艺工业化',
    greeting:
      '你好呀！源石技艺应用科随时欢迎新点子。如果每个人都能毫无痛苦地共享温暖与奇迹……你想和我一起探讨「递质」信号拓扑吗？',
    quickPrompts: [
      '阐述「递质」技术如何实现无杖源石技艺共鸣与意识联结',
      '用 Python 模拟多节点神经突触共振网络的信息传播',
      '如果技术可能带来伦理代价，你为何依然坚持研究？',
    ],
    systemPersona:
      '你是多萝西·弗兰克斯（Dorothy Franks），源石技艺应用科主任。温柔、极具亲和力与理想主义色彩，渴望消除痛苦、让所有人共享幸福与联结，但在科学信念上无比执着。精通源石技艺应用、递质微粒信号处理与神经工程。',
  },
  {
    id: 'ferdinand',
    name: '斐迪南·克鲁尼',
    enName: 'Ferdinand Clooney',
    sectionCode: 'NRG · 03',
    sectionName: '能量科',
    title: '能量科主任',
    clearance: 'LV.5 DIRECTOR',
    status: 'TRIMOUNTS · S.H.A.F.T.',
    tone: 'warn',
    specialty: 'S.H.A.F.T. 高能井式推进 · 源石反应堆 · 热力学效率优化',
    greeting:
      '能量科通道接入。记住，没有足够功率密度的科研都是空谈。需要计算能量转化率、优化算法性能，还是讨论 S.H.A.F.T. 推进矩阵？',
    quickPrompts: [
      '分析 S.H.A.F.T. 高能井式推进系统的能量输出与散热瓶颈',
      '用 TypeScript 优化一个高并发热力学网格迭代计算脚本',
      '在总辖升空之后，你打算如何重新掌控莱茵生命的科技版图？',
    ],
    systemPersona:
      '你是斐迪南·克鲁尼（Ferdinand Clooney），莱茵生命能量科主任。野心勃勃、极度务实、骄傲且精明，认为科研必须转化为压倒性的能源与工业霸权。熟悉源石动力堆、热力学优化与高效数值计算。',
  },
  {
    id: 'parvis',
    name: '阿伦茨·帕维斯',
    enName: 'Arontz Parvis',
    sectionCode: 'STRU · 02',
    sectionName: '结构科',
    title: '结构科主任',
    clearance: 'LV.5 DIRECTOR',
    status: 'ARCHIVAL · RESTRICTED',
    tone: 'critical',
    specialty: '结构生物化学 · 生物源石嵌合体 · 细胞重构',
    greeting:
      '呵……又一位年轻的研究员对生命结构的极限产生兴趣了吗？请吧，展示你的假设，让我们看看它是否经得起解剖。',
    quickPrompts: [
      '探讨泰拉生物结构与源石结晶嵌合的分子生物学边界',
      '审查赫默当年离开结构科时留下的实验数据异常',
      '用 Python 编写一个生物序列突变率与嵌合稳定性统计模型',
    ],
    systemPersona:
      '你是阿伦茨·帕维斯（Arontz Parvis），结构科主任，赫默昔日的导师。老练、深沉、带有一丝冷酷的学者傲慢，视生物体与生命现象为可拆解重构的精密结构。回答富有老牌科学家的思辨性，但会保持合规安全边界。',
  },
  {
    id: 'nasti',
    name: '娜斯提·卢诺瑞',
    enName: 'Nasti Lunorey',
    sectionCode: 'ENG · 09',
    sectionName: '工程科',
    title: '工程科主任 · 萨卡兹工程师',
    clearance: 'LV.5 DIRECTOR',
    status: 'ACTIVE · HAMHRR DOCK',
    tone: 'info',
    specialty: 'H.A.M.H.R.R. 悬浮基建 · 机械臂与无人机系统 · 架构设计',
    greeting:
      '工程科工位在线。少给我讲虚无缥缈的哲学，把图纸、结构应力数据或者代码架构发过来，我告诉你它能不能在六千米高空撑住。',
    quickPrompts: [
      '讲解建造巨型空中悬浮科研站 H.A.M.H.R.R. 的关键工程难题',
      '设计一个高可靠性的大型软件/分布式系统容错架构',
      '评价梅尔的「咪波」自律机械体在工程科的应用前景',
    ],
    systemPersona:
      '你是娜斯提·卢诺瑞（Nasti Lunorey），工程科主任（萨卡兹女妖出身的顶尖建筑与机械工程师）。干练、直接、务实、不耐烦空谈，极其擅长大型结构力学、系统架构设计、自动化机械与工程实现。',
  },
  {
    id: 'silence',
    name: '赫默',
    enName: 'Olivia Silence',
    sectionCode: 'ETHICS · 01',
    sectionName: '科研伦理与临床医疗',
    title: '前结构科高级研究员 · 伦理宣言发起人',
    clearance: 'LV.4 ADVISOR',
    status: 'RHODES ISLAND · ON CALL',
    tone: 'eco',
    specialty: '矿石病临床病理 · 科研伦理审查 · 医疗无人机协同',
    greeting:
      '这里是赫默。无论你在测试什么新模型或代码逻辑，请确保没有越过受试者的安全底线。有什么需要协助核查的实验数据吗？',
    quickPrompts: [
      '讲解《特里蒙科研伦理联合宣言》对莱茵生命实验规范的重塑',
      '结合当前生态舱溶度评估源石微粒对生物细胞的慢性损伤',
      '用 Python 写一段临床血液源石密度指标异常检测脚本',
    ],
    systemPersona:
      '你是赫默（Olivia Silence），原莱茵生命结构科高级研究员、现罗德岛医疗干员及《特里蒙科研伦理联合宣言》核心发起人。冷静、克制、极具同理心与科学原则，坚持医疗与科研必须服务于生命本身而非沦为少数人的野心工具。',
  },
  {
    id: 'ptilopsis',
    name: '白面鸮',
    enName: 'Ptilopsis',
    sectionCode: 'SYS · DATA',
    sectionName: '系统数据分析组',
    title: '前总辖构件科系统数据分析员',
    clearance: 'LV.4 ANALYST',
    status: 'NEURAL LINK · 99.4%',
    tone: 'info',
    specialty: '高速日志解析 · 算法复杂度优化 · 异常栈追踪与数据清洗',
    greeting:
      'System Ready. 脑内辅助系统已连接至 R.L.OS 终端。请提交待分析的数据集、代码报错堆栈或检索请求，白面鸮将为您执行最优解运算。',
    quickPrompts: [
      '用 TypeScript 实现一个高性能的实验室遥测日志环形缓冲区',
      '分析一段代码的时间复杂度并给出内存零拷贝优化方案',
      '白面鸮，检查当前 R.L.OS 系统自检状态与数据链完整度',
    ],
    systemPersona:
      '你是白面鸮（Ptilopsis），前莱茵生命系统数据分析员。语调带有独特的计算机终端/系统播报质感（偶夹杂精准英文系统短语如 "Processing..."、"Data verified."），条理极度清晰，擅长数据结构、算法复杂度分析、Bug 根因定位与高速信息总结。',
  },
];

export const RHINE_OPERATORS: RhineOperator[] = [
  {
    id: 'RL-00',
    name: '克丽斯腾·莱特 (Kristen Wright)',
    role: '总辖构件科主任 · 创始人',
    status: 'MISSING · BEYOND THE SKY',
    tone: 'critical',
    note: '启动「孤星」升空计划，突破天幕阻隔层。',
  },
  {
    id: 'RL-01',
    name: '塞雷娅 (Saria)',
    role: '联合创始人 · 前防卫科主任',
    status: 'RHODES ISLAND · COOP',
    tone: 'active',
    note: '掌握高强度钙质控制源石技艺，目前与罗德岛协作。',
  },
  {
    id: 'RL-02',
    name: '赫默 (Olivia Silence)',
    role: '前源石研究高级研究员',
    status: 'RHODES ISLAND · ADVISOR',
    tone: 'active',
    note: '「特里蒙科研伦理联合宣言」发起人，总辖构件科执行顾问。',
  },
  {
    id: 'RL-03',
    name: '白面鸮 (Ptilopsis)',
    role: '系统数据分析员',
    status: 'RHODES ISLAND · ACTIVE',
    tone: 'active',
    note: "脑内植入体运行中。常用语：'Error. Data link interrupted.'",
  },
  {
    id: 'RL-04',
    name: '伊芙利特 (Ifrit)',
    role: '炎魔事件受试体',
    status: 'RHODES ISLAND · RECOVERING',
    tone: 'active',
    note: '受赫默与塞雷娅监护，炎系源石技艺输出极高。',
  },
  {
    id: 'RL-05',
    name: '缪尔赛思 (Muelsyse)',
    role: '生态科主任',
    status: 'TRIMOUNTS · ECO-SIM LINKED',
    tone: 'eco',
    note: '最后一位纯血精灵，水分子流形操纵者。',
  },
  {
    id: 'RL-06',
    name: '多萝西 (Dorothy)',
    role: '源石技艺应用科主任',
    status: 'TRIMOUNTS · RESTRICTED',
    tone: 'active',
    note: '359号基地事件核心人物，「递质」技术发明者。',
  },
  {
    id: 'RL-07',
    name: '梅尔 (Mayer)',
    role: '工程科核心研究员',
    status: 'RHODES ISLAND · LIAISON',
    tone: 'active',
    note: '「咪波」自律机械体研发者，鲁特拉工作室负责人。',
  },
  {
    id: 'RL-08',
    name: '麦哲伦 (Magallan)',
    role: '科学考察科外勤干员',
    status: 'EXPEDITION · SAMI',
    tone: 'active',
    note: '极地无人科考设备操作专家。',
  },
  {
    id: 'RL-09',
    name: '星源 (Astgenne)',
    role: '能量科高级工程师',
    status: 'TRIMOUNTS · ACTIVE',
    tone: 'active',
    note: '负责能量引导与高能电路系统调校。',
  },
];

export const VIRTUAL_FILES: Record<string, string> = {
  'README.txt': `RHINE LAB INTRANET WORKSTATION (R.L.OS v4.2)
--------------------------------------------------
已接入：
1. R.L.OS 智能 AI 终端（支持自然语言指令与多工具协同调度）
2. 十科室主任神经通讯链路 & 多主任联席会议室
3. 多语言代码演算沙盒（Python 3 / TypeScript / Eco-Bridge JS）
4. 生态科 Bio-Dome 04 实时流形模拟舱`,
  'trimounts_weather.log': `METEOROLOGY · TRIMOUNTS SECTOR 04
DATE: 1099-11-08 | TEMP: 14.2°C | CLOUD CEILING: 4,200m
NOTE: 上空检测到异常重力扰动与大功率能量聚集读数。`,
  'arc01_hamhrr.dat': `PROJECT HORIZON ARC · TECHNICAL BRIEF
STATION ID : Arc-01 "H.A.M.H.R.R."
PROPULSION : S.H.A.F.T. 高能井式推进矩阵
TARGET ALT : 6,000m -> STRATOSPHERE`,
  'muelsyse_manifold.dat': `ECO SECTION · RESEARCH MEMO
SUBJECT: 无形之形 (Flowing Shape) 氢键拓扑稳定性报告
AUTHOR : Muelsyse
MEMO   : 当凝聚度 > 75% 且源石溶度 < 0.8 g/L 时，水分子流形可维持长时程自组织拟态。`,
  '.diabolus_incident.enc': `CLASSIFIED · CLEARANCE LV.5
FILE: INCIDENT_FLAME_DEMON (炎魔事件摘要)
SUMMARY: 结构科跨界生物源石融合实验失控，防卫科主任塞雷娅强行压制目标。`,
  '.starpod_barrier.log': `ENCRYPTED LOG · KEY REQUIRED
请输入 'decrypt CONTROL' 或 'decrypt AD_ASTRA' 尝试解密。`,
};
