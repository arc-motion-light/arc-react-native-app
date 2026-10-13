const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const base = path.join(__dirname, '..');
function load(rel) {
  const code = ts.transpileModule(fs.readFileSync(path.join(base, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: rel,
    reportDiagnostics: true,
  });
  if (code.diagnostics?.length) throw new Error(String(code.diagnostics[0].messageText));
  const mod = {exports: {}};
  new Function('require', 'exports', 'module', code.outputText)((id) => {
    if (id === 'buffer') return require('buffer');
    if (id === '../mesh/hardwareIdentity') return load('src/mesh/hardwareIdentity.ts');
    return require(id);
  }, mod.exports, mod);
  return mod.exports;
}
const {parseArcPublicDeviceQr} = load('src/arc/arcDeviceQr.ts');
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
console.log('ARC QR decoder: 11 checks passed');
