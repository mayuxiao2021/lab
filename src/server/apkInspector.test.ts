import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectApkSignature } from './apkInspector';

function buildMinimalSignedZip(
  entryNames: string[],
  includeApkSigBlock = true
): Buffer {
  const cdChunks: Buffer[] = [];
  for (const name of entryNames) {
    const nameBuf = Buffer.from(name, 'utf8');
    const hdr = Buffer.alloc(46 + nameBuf.length);
    hdr.writeUInt32LE(0x02014b50, 0);
    hdr.writeUInt16LE(nameBuf.length, 28);
    nameBuf.copy(hdr, 46);
    cdChunks.push(hdr);
  }
  const cd = Buffer.concat(cdChunks);
  const prefix = includeApkSigBlock
    ? Buffer.concat([Buffer.alloc(16), Buffer.from('APK Sig Block 42', 'ascii')])
    : Buffer.alloc(16);
  const cdOffset = prefix.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([prefix, cd, eocd]);
}

test('inspectApkSignature detects unsigned buffer safely', () => {
  const report = inspectApkSignature(Buffer.from('not-an-apk-archive'));
  assert.equal(report.isSigned, false);
  assert.equal(report.hasV1Signature, false);
  assert.equal(report.hasV2OrV3Block, false);
  assert.deepEqual(report.schemes, []);
});

test('inspectApkSignature detects v2/v3 APK Sig Block 42 without false v1 hits', () => {
  const buf = buildMinimalSignedZip(['AndroidManifest.xml', 'classes.dex'], true);
  const report = inspectApkSignature(buf);
  assert.equal(report.isSigned, true);
  assert.equal(report.hasV1Signature, false);
  assert.equal(report.hasV2OrV3Block, true);
  assert.deepEqual(report.schemes, ['APK v2/v3']);
});

test('inspectApkSignature detects v1 JAR signature entries in Central Directory', () => {
  const buf = buildMinimalSignedZip(
    ['AndroidManifest.xml', 'META-INF/RHINELAB.SF', 'META-INF/RHINELAB.RSA'],
    true
  );
  const report = inspectApkSignature(buf);
  assert.equal(report.isSigned, true);
  assert.equal(report.hasV1Signature, true);
  assert.equal(report.hasV2OrV3Block, true);
  assert.deepEqual(report.schemes, ['APK v2/v3', 'JAR v1']);
});
