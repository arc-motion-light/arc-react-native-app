const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const base = path.join(__dirname, '..');
// Simulate a React Native Buffer implementation that rejects Node's
// nonportable 'base64url' encoding (both decoding and re-encoding).
const rnBase64OnlyBuffer = {
  from(input, encoding) {
    if (encoding === 'base64url') throw new Error('Unknown encoding: base64url');
    const bytes = Buffer.from(input, encoding);
    return {
      length: bytes.length,
      toString(outputEncoding) {
        if (outputEncoding === 'base64url') throw new Error('Unknown encoding: base64url');
        return bytes.toString(outputEncoding);
      },
    };
  },
};
function load(rel, useRnBuffer = false) {
  const code = ts.transpileModule(fs.readFileSync(path.join(base, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: rel,
    reportDiagnostics: true,
  });
  if (code.diagnostics?.length) throw new Error(String(code.diagnostics[0].messageText));
  const mod = {exports: {}};
  new Function('require', 'exports', 'module', code.outputText)((id) => {
    if (id === 'buffer') return useRnBuffer ? { Buffer: rnBase64OnlyBuffer } : require('buffer');
    if (id === '../mesh/hardwareIdentity') return load('src/mesh/hardwareIdentity.ts');
    return require(id);
  }, mod.exports, mod);
  return mod.exports;
}
const {parseArcPublicDeviceQr} = load('src/arc/arcDeviceQr.ts');
const rnDecoder = load('src/arc/arcDeviceQr.ts', true).parseArcPublicDeviceQr;
const uid = '1A003D001250364146313320';
function label(data = {}) {
  return 'arc-preview://device/v1/' + Buffer.from(JSON.stringify({v:1, kind:'PRINT_PREVIEW_ONLY', uid, type:'probe', nonce:'1234567890abcdef',...data})).toString('base64url');
}
assert.deepEqual(parseArcPublicDeviceQr(label()),{hardwareUid:uid,deviceType:'probe',nonce:'1234567890abcdef'});
for (const bad of [
 label({kind:'ARC_ENROLLMENT'}), label({uid:'0'.repeat(24)}), label({v:2}),
 label({type:'remote'}), label({nonce:'short'}), label({K_device:'not-allowed'}),
 'https://example.org', 'arc://enroll/secret', label() + '/', 'arc-preview://device/v1/@@@',
]) {assert.throws(()=>parseArcPublicDeviceQr(bad), `should reject ${bad.slice(0,60)}`);}
// The real iPhone failure: decoding must not call either Base64URL-specific
// Buffer API, while still accepting the Admin Panel preview-label format.
assert.deepEqual(rnDecoder(label()), {hardwareUid:uid,deviceType:'probe',nonce:'1234567890abcdef'});

// The relaxed standard Base64 decoder must not cause us to accept a
// noncanonical Base64URL variant with modified unused trailing bits.
function nonCanonicalTrailingBits(qr) {
  const prefix = 'arc-preview://device/v1/';
  const encoded = qr.slice(prefix.length);
  const rem = encoded.length % 4;
  assert.ok(rem === 2 || rem === 3, 'fixture requires unpadded trailing bits');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const tail = encoded.at(-1);
  const index = alphabet.indexOf(tail);
  assert.ok(index >= 0);
  const altered = alphabet[index ^ 1]; // Change an unused low bit only.
  return prefix + encoded.slice(0, -1) + altered;
}
assert.throws(() => rnDecoder(nonCanonicalTrailingBits(label())), /Invalid ARC device QR payload/);
console.log('ARC QR decoder: 13 checks passed (including iOS Buffer compatibility)');
