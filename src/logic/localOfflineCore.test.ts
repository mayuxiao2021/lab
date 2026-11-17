import test from 'node:test';
import assert from 'node:assert/strict';
import { ECO_PRESETS } from './ecoSimulation';
import {
  BackendUnreachableError,
  diagnoseConnectionIssue,
  generateOfflineDirectorReply,
  isBackendUnreachableError,
  runOfflineCodeAssist,
  runOfflineTerminalAi,
} from './localOfflineCore';

test('isBackendUnreachableError classifies fetch/network errors cleanly', () => {
  assert.equal(isBackendUnreachableError(new TypeError('Failed to fetch')), true);
  assert.equal(
    isBackendUnreachableError(new BackendUnreachableError('HTTP 404', { status: 404 })),
    true
  );
  assert.equal(isBackendUnreachableError(new Error('Invalid prompt parameter')), false);
  assert.match(
    diagnoseConnectionIssue(new BackendUnreachableError('404', { status: 404 }), 'https://x.run.app'),
    /404/
  );
});

test('runOfflineTerminalAi performs eco param actions and code block loading offline', () => {
  const res = runOfflineTerminalAi({
    prompt: '请优化生态舱并生成一个 TypeScript 傅里叶计算脚本',
    directorId: 'muelsyse',
    activeSectionShort: 'ECO',
    ecoParams: ECO_PRESETS[0].params,
  });

  assert.equal(res.speakerId, 'muelsyse');
  assert.ok(res.toolActions.some((a) => a.type === 'set_eco_params'));
  assert.ok(res.codeBlocks.some((b) => b.language === 'typescript'));
  assert.match(res.reply, /LOCAL NEURAL CORE/);
});

test('generateOfflineDirectorReply and runOfflineCodeAssist provide valid offline output', () => {
  const reply = generateOfflineDirectorReply({
    directorId: 'saria',
    userMessage: '评估源石过载风险',
    ecoParams: ECO_PRESETS[1].params,
  });
  assert.match(reply, /塞雷娅/);

  const assist = runOfflineCodeAssist({
    mode: 'generate',
    language: 'typescript',
    code: '',
  });
  assert.ok(assist.code && assist.code.includes('TelemetrySample'));

  const mcAssist = runOfflineCodeAssist({
    mode: 'generate',
    language: 'python',
    code: '',
    prompt: '帮我写一个蒙特卡洛源石扩散模型',
  });
  assert.ok(mcAssist.code && mcAssist.code.includes('random.gauss'));

  const explainAssist = runOfflineCodeAssist({
    mode: 'explain',
    language: 'python',
    code: 'def simulate_manifold():\n    return 1\n',
  });
  assert.match(explainAssist.explanation, /simulate_manifold/);

  const fixAssist = runOfflineCodeAssist({
    mode: 'fix',
    language: 'python',
    code: 'def broken(',
    errorOutput: 'SyntaxError: was never closed',
  });
  assert.match(fixAssist.explanation, /语法\/缩进错误/);
});

