import test from 'node:test';
import assert from 'node:assert/strict';
import { RHINE_SECTIONS } from '../data/rhineLore';
import { ECO_PRESETS } from './ecoSimulation';
import {
  autocompleteCommand,
  resolveTerminalInput,
  runTerminalCommand,
} from './terminalEngine';

const defaultCtx = {
  activeSection: RHINE_SECTIONS[0],
  decrypted: false,
  ecoParams: ECO_PRESETS[0].params,
};

test('inspect ECO selects Ecological Section and returns dossier', () => {
  const effect = runTerminalCommand('inspect ECO', defaultCtx);
  assert.equal(effect.selectSection?.short, 'ECO');
  assert.equal(effect.entries.length, 2);
  assert.equal(effect.entries[1].kind, 'dossier');
});

test('eco switches to eco view and eco preset applies preset', () => {
  const switchEff = runTerminalCommand('eco', defaultCtx);
  assert.equal(switchEff.switchView, 'eco');

  const presetEff = runTerminalCommand('eco preset overload', defaultCtx);
  assert.equal(presetEff.applyPreset, 'overload');
});

test('code and talk commands switch views and target director', () => {
  const codeEff = runTerminalCommand('code', defaultCtx);
  assert.equal(codeEff.switchView, 'code');

  const talkEff = runTerminalCommand('talk muelsyse', defaultCtx);
  assert.equal(talkEff.switchView, 'comms');
  assert.equal(talkEff.selectDirectorId, 'muelsyse');
});

test('resolveTerminalInput routes CLI vs @director vs natural language AI', () => {
  assert.deepEqual(resolveTerminalInput('ls -a'), { mode: 'cli', command: 'ls -a' });
  const mention = resolveTerminalInput('@缪尔赛思 当前流形参数稳态如何？');
  assert.equal(mention.mode, 'ai');
  if (mention.mode === 'ai') {
    assert.equal(mention.directorId, 'muelsyse');
    assert.match(mention.prompt, /流形参数/);
  }

  const natural = resolveTerminalInput('请帮我写一段计算轨道逃逸速度的Python代码');
  assert.equal(natural.mode, 'ai');
});

test('decrypt CONTROL unlocks encrypted log', () => {
  const failEff = runTerminalCommand('decrypt WRONG', defaultCtx);
  assert.equal(failEff.setDecrypted, undefined);

  const okEff = runTerminalCommand('decrypt CONTROL', defaultCtx);
  assert.equal(okEff.setDecrypted, true);
  assert.equal(okEff.entries.length, 3);
});

test('autocompleteCommand completes commands, sections, directors, and files', () => {
  assert.equal(autocompleteCommand('ins'), 'inspect ');
  assert.equal(autocompleteCommand('inspect ec'), 'inspect ECO');
  assert.equal(autocompleteCommand('cat arc'), 'cat arc01_hamhrr.dat');
  assert.equal(autocompleteCommand('@muel'), '@muelsyse ');
});

test('env and apk commands trigger environment modal', () => {
  assert.deepEqual(resolveTerminalInput('env'), { mode: 'cli', command: 'env' });
  assert.deepEqual(resolveTerminalInput('apk'), { mode: 'cli', command: 'apk' });
  const envEff = runTerminalCommand('env', defaultCtx);
  assert.equal(envEff.openEnvironmentModal, true);
  const apkEff = runTerminalCommand('apk', defaultCtx);
  assert.equal(apkEff.openEnvironmentModal, true);
});

