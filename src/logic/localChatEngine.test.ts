import test from 'node:test';
import assert from 'node:assert/strict';
import { ECO_PRESETS } from './ecoSimulation';
import {
  evaluateScientificExpression,
  formatThreadAsMarkdown,
  generateLocalFreeChatResponse,
  saveResearcherProfile,
  synthesizeOfflineAlgorithm,
} from './localChatEngine';
import { RHINE_SECTIONS } from '../data/rhineLore';
import { runTerminalCommand } from './terminalEngine';

const defaultEco = ECO_PRESETS[0].params;

test('evaluateScientificExpression computes formulas, unit conversions, and stats', () => {
  const mathRes = evaluateScientificExpression('(128 * 4.5) / sqrt(81) + sin(pi/2)');
  assert.equal(mathRes.ok, true);
  assert.equal(mathRes.result, 65);

  const tempRes = evaluateScientificExpression('25°C 转 K');
  assert.equal(tempRes.ok, true);
  assert.match(String(tempRes.result), /298\.15 K/);

  const distRes = evaluateScientificExpression('6000m 转 英尺');
  assert.equal(distRes.ok, true);
  assert.match(String(distRes.result), /19685\.04 ft/);

  const statRes = evaluateScientificExpression('计算均值与标准差 [10, 20, 30]');
  assert.equal(statRes.ok, true);
  assert.match(String(statRes.result), /均值=20/);
});

test('synthesizeOfflineAlgorithm generates runnable Python/TS scripts with plots', () => {
  const rk4 = synthesizeOfflineAlgorithm('用 Python 写一段 RK4 求解流形微分方程');
  assert.ok(rk4);
  assert.equal(rk4.language, 'python');
  assert.match(rk4.code, /__RHINE_PLOT__/);

  const kalman = synthesizeOfflineAlgorithm('用 TypeScript 实现卡尔曼滤波熔断器');
  assert.ok(kalman);
  assert.equal(kalman.language, 'typescript');
  assert.match(kalman.code, /kalmanGain/);
});

test('generateLocalFreeChatResponse handles greetings, empathy, gossip, follow-ups, and profile memory', () => {
  const greetMumu = generateLocalFreeChatResponse({
    directorId: 'muelsyse',
    userMessage: '你好呀，今天在忙什么？',
    ecoParams: defaultEco,
  });
  assert.equal(greetMumu.intent, 'greeting');
  assert.match(greetMumu.reply, /Bio-Dome 04|水|咖啡|生态/);

  const gossipKristen = generateLocalFreeChatResponse({
    directorId: 'kristen',
    userMessage: '你怎么评价塞雷娅？',
    ecoParams: defaultEco,
  });
  assert.equal(gossipKristen.intent, 'director_opinion');
  assert.match(gossipKristen.reply, /塞雷娅/);

  const empathyPtilopsis = generateLocalFreeChatResponse({
    directorId: 'ptilopsis',
    userMessage: '今天连续加班好累，压力好大',
    ecoParams: defaultEco,
  });
  assert.equal(empathyPtilopsis.intent, 'empathy');
  assert.match(empathyPtilopsis.reply, /白面鸮|Cache Clear|恢复|终端/);

  const followUp = generateLocalFreeChatResponse({
    directorId: 'saria',
    userMessage: '那然后呢？为什么这么说？',
    history: [
      { role: 'user', content: '天幕阻隔层的安全隐患有哪些？' },
      { role: 'assistant', content: '主要是高空残骸坠落与源石辐射。' },
      { role: 'user', content: '那然后呢？为什么这么说？' },
    ],
    ecoParams: defaultEco,
  });
  assert.equal(followUp.intent, 'followup');
  assert.match(followUp.reply, /天幕阻隔层的安全隐患/);

  const md = formatThreadAsMarkdown({
    title: '缪尔赛思',
    sectionCode: 'ECO · 05',
    messages: [
      { role: 'user', content: '你好', timestamp: '10:00:00' },
      {
        role: 'assistant',
        speakerName: '缪尔赛思',
        speakerCode: 'ECO · 05',
        content: '嗨~',
        timestamp: '10:00:01',
      },
    ],
  });
  assert.match(md, /# 莱茵生命 R\.L\.OS 神经通讯与自由对话纪要/);
});

test('terminalEngine calc and note CLI commands work offline', () => {
  const prevStorage = (globalThis as { localStorage?: Storage }).localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  try {
    saveResearcherProfile({ callSign: '林博士', focusTopic: '流形拓扑', notes: [] });
    const calcEffect = runTerminalCommand('calc sqrt(81) + 11', {
      activeSection: RHINE_SECTIONS[0],
      decrypted: false,
      ecoParams: defaultEco,
    });
    assert.equal(calcEffect.entries.length, 2);
    assert.match(calcEffect.entries[1].lines?.join('\n') ?? '', /20/);

    const noteAdd = runTerminalCommand('note add 复核 6000m 轨道遥测', {
      activeSection: RHINE_SECTIONS[0],
      decrypted: false,
      ecoParams: defaultEco,
    });
    assert.match(noteAdd.entries[1].text ?? '', /复核 6000m 轨道遥测/);

    const noteList = runTerminalCommand('note list', {
      activeSection: RHINE_SECTIONS[0],
      decrypted: false,
      ecoParams: defaultEco,
    });
    assert.match(noteList.entries[1].lines?.join('\n') ?? '', /1\. 复核 6000m 轨道遥测/);
  } finally {
    (globalThis as { localStorage?: Storage }).localStorage = prevStorage;
  }
});
