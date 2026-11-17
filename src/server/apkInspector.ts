export interface ApkSignatureReport {
  hasV1Signature: boolean;
  hasV2OrV3Block: boolean;
  isSigned: boolean;
  schemes: string[];
  certEntries: string[];
}

const APK_SIG_BLOCK_MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const ZIP_EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP_CD_HEADER_SIG = 0x02014b50;

export function inspectApkSignature(buf: Buffer): ApkSignatureReport {
  if (!buf || buf.length < 22) {
    return {
      hasV1Signature: false,
      hasV2OrV3Block: false,
      isSigned: false,
      schemes: [],
      certEntries: [],
    };
  }

  let hasV2OrV3Block = false;
  const certEntries = new Set<string>();
  let hasSf = false;
  let hasCert = false;

  const searchStart = Math.max(0, buf.length - 65_557);
  const eocdOffset = buf.lastIndexOf(ZIP_EOCD_SIG, buf.length - 22);
  if (eocdOffset >= searchStart && eocdOffset + 22 <= buf.length) {
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    if (cdOffset >= 16 && cdOffset <= buf.length) {
      const tailMagic = buf.subarray(cdOffset - 16, cdOffset);
      hasV2OrV3Block = tailMagic.equals(APK_SIG_BLOCK_MAGIC);
    }

    // Walk actual ZIP Central Directory entries to inspect META-INF/*.SF & *.RSA|DSA|EC
    let cursor = cdOffset;
    const cdEnd = Math.min(buf.length, cdOffset + cdSize);
    while (cursor + 46 <= cdEnd) {
      if (buf.readUInt32LE(cursor) !== ZIP_CD_HEADER_SIG) break;
      const nameLen = buf.readUInt16LE(cursor + 28);
      const extraLen = buf.readUInt16LE(cursor + 30);
      const commentLen = buf.readUInt16LE(cursor + 32);
      const nameStart = cursor + 46;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > cdEnd) break;
      const entryName = buf.subarray(nameStart, nameEnd).toString('utf8');
      if (/^META-INF\/[^/]+\.(?:SF|RSA|DSA|EC)$/i.test(entryName)) {
        certEntries.add(entryName);
        if (/\.SF$/i.test(entryName)) hasSf = true;
        if (/\.(RSA|DSA|EC)$/i.test(entryName)) hasCert = true;
      }
      cursor = nameEnd + extraLen + commentLen;
    }
  } else {
    hasV2OrV3Block = buf.includes(APK_SIG_BLOCK_MAGIC);
  }

  const hasV1Signature = hasSf && hasCert;
  const schemes: string[] = [];
  if (hasV2OrV3Block) schemes.push('APK v2/v3');
  if (hasV1Signature) schemes.push('JAR v1');

  return {
    hasV1Signature,
    hasV2OrV3Block,
    isSigned: hasV1Signature || hasV2OrV3Block,
    schemes,
    certEntries: Array.from(certEntries).sort(),
  };
}
