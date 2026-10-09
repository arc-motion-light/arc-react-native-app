const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function provider({ persistenceAvailable = true, profile } = {}) {
  let observer, observerError, initialized, unsubscribed = false;
  const sessions = [], errors = [];
  const storage = {};
  const auth = {
    getReactNativePersistence: persistenceAvailable ? value => ({ storage: value }) : undefined,
    initializeAuth: (_, options) => { initialized = options; return {}; },
    getAuth: () => { throw new Error('Unexpected memory persistence fallback'); },
    onAuthStateChanged: (_, next, error) => {
      observer = next; observerError = error;
      return () => { unsubscribed = true; };
    },
  };
  const mocks = {
    'firebase/app': { getApps: () => [], initializeApp: () => ({}) },
    'firebase/auth': auth,
    'firebase/firestore': {
      getFirestore: () => ({}), doc: () => ({}),
      getDoc: () => profile ?? Promise.resolve({ exists: () => false }),
    },
    '@react-native-async-storage/async-storage': storage,
    'react-native': { Platform: { OS: 'ios' } },
  };
  const sandbox = { exports: {}, require: name => {
    assert.ok(name in mocks, name); return mocks[name];
  }, process: { env: {} } };
  vm.runInNewContext(compile(fs.readFileSync('src/cloud/arcCloud.ts', 'utf8')), sandbox);
  const unsubscribe = sandbox.exports.subscribeArcCloudSession(s => sessions.push(s), e => errors.push(e));
  return {
    sessions, errors, unsubscribe, initialized, storage,
    emit: value => observer(value), fail: error => observerError(error),
    get unsubscribed() { return unsubscribed; },
  };
}
const user = { uid: 'test-user', email: 'test@example.invalid', emailVerified: true };

test('startup waits for Firebase restoration; fresh install and signed-out reopen resolve to login', () => {
  for (const scenario of ['fresh install', 'signed-out reopen']) {
    const p = provider();
    assert.equal(p.sessions.length, 0, scenario);
    assert.equal(p.initialized.persistence.storage, p.storage);
    p.emit(null);
    assert.equal(p.sessions[0].userId, null);
    assert.equal(p.sessions[0].role, 'signed_out');
    assert.ok(Object.values(p.sessions[0].permissions).every(value => value === false));
  }
});

test('persisted sign-in restoration and subsequent logout follow the auth observer', async () => {
  const p = provider();
  p.emit(user);
  await tick();
  assert.equal(p.sessions[0].userId, user.uid);
  p.emit(null);
  assert.equal(p.sessions.at(-1).userId, null);
});

test('logout cannot be undone by a late membership lookup', async () => {
  let resolve;
  const p = provider({ profile: new Promise(done => { resolve = done; }) });
  p.emit(user);
  p.emit(null);
  resolve({ exists: () => false });
  await tick();
  assert.equal(p.sessions.length, 1);
  assert.equal(p.sessions[0].userId, null);
});

test('unsubscribed and errored observers cannot publish pending signed-in sessions', async () => {
  for (const stop of ['unsubscribe', 'error']) {
    let resolve;
    const p = provider({ profile: new Promise(done => { resolve = done; }) });
    p.emit(user);
    if (stop === 'unsubscribe') p.unsubscribe();
    else p.fail(new Error('Auth restore failed'));
    resolve({ exists: () => false });
    await tick();
    assert.equal(p.sessions.length, 0);
    if (stop === 'error') assert.equal(p.errors.length, 1);
    else assert.equal(p.unsubscribed, true);
  }
});

test('native initialization errors do not silently switch to memory-only auth', () => {
  const p = provider({ persistenceAvailable: false });
  assert.equal(p.sessions.length, 0);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0].message, /persistence is unavailable/);
});

test('actual Firebase React Native persistence adapter survives recreation and clears on logout', async () => {
  const { getReactNativePersistence } = require('../node_modules/@firebase/auth/dist/rn/index.js');
  const values = new Map();
  const storage = {
    setItem: async (key, value) => { values.set(key, value); },
    getItem: async key => values.get(key) ?? null,
    removeItem: async key => { values.delete(key); },
  };
  const Persistence = getReactNativePersistence(storage);
  const first = new Persistence();
  assert.equal(await first._isAvailable(), true);
  await first._set('firebase:test-user', user);
  const reopened = new (getReactNativePersistence(storage))();
  assert.deepEqual(await reopened._get('firebase:test-user'), user);
  await reopened._remove('firebase:test-user');
  assert.equal(await new Persistence()._get('firebase:test-user'), null);
});

test('root render gate hides every app screen while unresolved, signed out, or logging out', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  const start = app.indexOf('  if (!authResolved || authSigningOut)');
  const end = app.indexOf('\n  return (', start);
  assert.ok(start > 0 && end > start);
  const source = compile(`exports.render = (authResolved, authSigningOut, arcCloudSession) => {\n${app.slice(start, end)}\nreturn 'app';\n}`);
  const sandbox = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    AppThemeProvider: 'provider', SafeAreaView: 'safe-area', StatusBar: 'status-bar', View: 'view',
    Text: 'text', ActivityIndicator: 'loading', Svg: 'svg', SvgPath: 'path', styles: {}, resolvedAppTheme: 'light',
    appTheme: { colors: {} }, renderLoginLanding: () => 'login',
  };
  vm.runInNewContext(source, sandbox);
  const render = sandbox.exports.render;
  assert.match(JSON.stringify(render(false, false, { userId: user.uid })), /loading/);
  assert.match(JSON.stringify(render(false, false, { userId: null })), /loading/);
  assert.match(JSON.stringify(render(true, false, { userId: null })), /login/);
  assert.match(JSON.stringify(render(true, true, { userId: user.uid })), /loading/);
  assert.equal(render(true, false, { userId: user.uid }), 'app');
  // The listener must run at mount, independently of telemetry preferences/tabs.
  const subscription = app.slice(app.lastIndexOf('  useEffect(() => {', app.indexOf('return subscribeArcCloudSession')), app.indexOf('\n  useEffect', app.indexOf('return subscribeArcCloudSession')));
  assert.match(subscription, /\}, \[\]\);/);
  assert.doesNotMatch(subscription, /cloudRequested|probeLoggingSettingsReady/);
});

test('real Firebase auth restores an AsyncStorage session across cold starts and persists logout', async () => {
  const http = require('node:http');
  const { initializeApp, deleteApp } = require('firebase/app');
  const { initializeAuth, connectAuthEmulator, onAuthStateChanged, signOut, getReactNativePersistence } = require('../node_modules/@firebase/auth/dist/rn/index.js');
  // A local read-only Auth emulator response verifies restoration without a
  // production account, production requests, or changes to the phone's data.
  const server = http.createServer((request, response) => {
    assert.match(request.url, /accounts:lookup/);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ users: [{ localId: user.uid, email: user.email, emailVerified: true, providerUserInfo: [], createdAt: '1000', lastLoginAt: '1000' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const values = new Map();
  const storage = {
    setItem: async (key, value) => { values.set(key, value); },
    getItem: async key => values.get(key) ?? null,
    removeItem: async key => { values.delete(key); },
  };
  const config = { apiKey: 'test-api-key', projectId: 'demo-arc-auth-test' };
  const name = 'arc-cold-start-test';
  values.set(`firebase:authUser:${config.apiKey}:${name}`, JSON.stringify({
    ...user, isAnonymous: false, providerData: [], apiKey: config.apiKey, appName: name,
    stsTokenManager: { refreshToken: 'test-refresh-token', accessToken: 'test-access-token', expirationTime: Date.now() + 3600000 },
    createdAt: '1000', lastLoginAt: '1000',
  }));
  let app;
  const open = async () => {
    app = initializeApp(config, name);
    const auth = initializeAuth(app, { persistence: getReactNativePersistence(storage) });
    connectAuthEmulator(auth, `http://127.0.0.1:${server.address().port}`, { disableWarnings: true });
    const restored = await new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, value => { unsubscribe(); resolve(value); }, reject);
    });
    return { auth, restored };
  };
  try {
    const first = await open();
    assert.equal(first.restored.uid, user.uid);
    await deleteApp(app); app = null;
    const reopened = await open();
    assert.equal(reopened.restored.uid, user.uid);
    await signOut(reopened.auth);
    await deleteApp(app); app = null;
    assert.equal((await open()).restored, null);
    await deleteApp(app); app = null;
    values.clear();
    assert.equal((await open()).restored, null);
  } finally {
    if (app) await deleteApp(app);
    await new Promise(resolve => server.close(resolve));
  }
});
