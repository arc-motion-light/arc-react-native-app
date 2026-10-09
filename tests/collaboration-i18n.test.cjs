const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the app's TypeScript catalogs using its existing compiler dependency.
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(output.outputText, filename);
};
const { translations, cadenceEnglishFallback, validateTranslationParity, validateTranslationPlaceholders } = require('../src/i18n/locales.ts');
const { collaborationEnglish, collaborationJapanese } = require('../src/i18n/collaboration.ts');
const app = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
const source = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const translate = (key, values = {}) => translations.ja[key].replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
const formatDate = value => new Intl.DateTimeFormat('ja', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(value);
const formatTime = value => new Intl.DateTimeFormat('ja', { hour: '2-digit', minute: '2-digit' }).format(value);
const formatDateTime = value => new Intl.DateTimeFormat('ja', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
const subject = name => {
  let found;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, name);
  const compiled = ts.transpileModule('exports.subject = ' + found.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const sandbox = { exports: {}, t: translate, formatDate, formatTime, formatDateTime };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports.subject;
};

test('maintains locale key and interpolation parity', () => {
  assert.deepEqual(validateTranslationParity(), []);
  assert.deepEqual(validateTranslationPlaceholders(), []);
});

test('provides Japanese for every new native collaboration message', () => {
  for (const [key, english] of Object.entries(collaborationEnglish)) {
    assert.ok(collaborationJapanese[key], key);
    assert.notEqual(collaborationJapanese[key], english, key);
    assert.match(collaborationJapanese[key], /[\u3040-\u30ff\u3400-\u9fff]/, key);
  }
  assert.equal(translate('projects.weekNumber', { week: 40 }), '第40週');
  assert.equal(translate('projects.claimedBy', { name: 'Juan' }), '担当：Juan');
});

test('project subviews have no raw English JSX text or UI attributes', () => {
  const start = app.indexOf('  const renderPortalProjects =');
  const end = app.indexOf('  const renderComms =', start);
  const visit = node => {
    if (node.getStart(source) >= start && node.end <= end) {
      if (ts.isJsxText(node)) assert.doesNotMatch(node.text, /[A-Za-z]/, node.text);
      if (ts.isJsxAttribute(node) && ['placeholder', 'accessibilityLabel', 'noResults', 'errorLabel'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
        assert.fail('Untranslated interface attribute: ' + node.getText(source));
      }
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        assert.ok(translations.ja[key], key);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.doesNotMatch(app.slice(start, end), /\.toLocale(?:DateString|TimeString|String)\(/);
});

test('renders role and task-status enums in Japanese without changing enum values', () => {
  const role = subject('portalMemberRoleLabel');
  const status = subject('portalTaskStatusLabel');
  assert.equal(role('member'), 'メンバー');
  assert.equal(role('admin'), '管理者');
  assert.equal(role('owner'), '所有者');
  assert.equal(role('unknown'), 'unknown');
  assert.equal(status('todo'), '未着手');
  assert.equal(status('in_progress'), '進行中');
  assert.equal(status('done'), '完了');
});

test('formats single-date and interval task labels in the selected Japanese locale', () => {
  const range = subject('projectTaskRangeLabel');
  const start = new Date(2026, 9, 4, 9, 0), end = new Date(2026, 9, 4, 11, 0);
  const task = { startsAt: start.toISOString(), endsAt: end.toISOString() };
  const original = JSON.stringify(task);
  assert.equal(range(task), `${formatDate(start)} · ${formatTime(start)}–${formatTime(end)}`);
  assert.equal(range({ dueAt: start.toISOString() }), formatDateTime(start));
  const nextDay = new Date(2026, 9, 5, 11, 0);
  assert.equal(range({ startsAt: start.toISOString(), endsAt: nextDay.toISOString() }), `${formatDate(start)} – ${formatDate(nextDay)}`);
  assert.equal(JSON.stringify(task), original);
});

test('localizes project feed types and retains unknown types', () => {
  const label = subject('portalPostTypeLabel');
  assert.equal(label('project_update'), 'プロジェクトの更新');
  assert.equal(label('teaching_note'), '授業メモ');
  assert.equal(label('unknown_type'), 'unknown type');
});

test('passes app locale to the native picker and translates the people-picker remove label', () => {
  assert.match(app, /locale=\{Platform\.OS === 'ios' \? activeLocale : undefined\}/);
  const picker = fs.readFileSync(path.join(__dirname, '../src/cloud/PortalPeoplePicker.tsx'), 'utf8');
  assert.match(picker, /accessibilityLabel=\{removeLabel\(selected\.displayName\)\}/);
  assert.equal(translate('people.removePerson', { name: 'Juan' }), 'Juan を削除');
});

// These are explicitly English fallbacks, not manufactured translations.
test('unreviewed cadence catalogs use the canonical English definitions', () => {
  for (const locale of ['de', 'es', 'fr', 'it', 'ja']) {
    for (const [key, text] of Object.entries(cadenceEnglishFallback)) assert.equal(translations[locale][key], text);
  }
});
