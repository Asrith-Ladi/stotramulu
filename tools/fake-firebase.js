/* In-memory stand-in for the Firebase compat SDK (app + auth + firestore),
   used only by the browser tests (tools/e2e-conversations.cjs). The tests serve
   this file in place of firebase-app-compat.js and an empty script for the auth
   and firestore bundles, so the pages run their real cloud code against it.

   It covers exactly what the site's scripts call: sign-in, nested
   collection/doc paths, get/set(merge)/add/update/delete, where('f','==',v),
   orderBy, limit, startAfter, batch(), FieldValue.serverTimestamp(),
   Timestamp and Blob (bytes).

   RULES MIRROR: writes and reads are checked against a small copy of the most
   important parts of docs/firestore.rules.proposed (feedback create / triage /
   follow-up / claim, messages and files create, who may read what). It exists
   to catch the site drifting away from the rules (an extra field, a missing
   claim proof). It is NOT the real rules: those were checked separately with a
   rules evaluator, and must still be tested on the live site after publishing.

   Test control: window.__fb (see the bottom of this file). */
(function () {
  'use strict';
  const W = window;
  const store = new Map();             // 'feedback/abc' -> stored data (internal values)
  const writes = [];                   // every write attempt: { op, path, uid, ok, code }
  const rules = { enforce: true };
  const traps = [];                    // { re, op, kind: 'fail' | 'hold', code, holds: [] }
  let offline = false;
  let currentUser = null;
  let popupUser = { uid: 'reader-1', email: 'reader1@example.com', displayName: 'Reader One' };
  const authListeners = [];
  let autoId = 0;
  const later = (fn) => setTimeout(fn, 0);

  /* ---------- values ---------- */
  function Timestamp(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds || 0; }
  Timestamp.prototype.toMillis = function () { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); };
  Timestamp.prototype.toDate = function () { return new Date(this.toMillis()); };
  Timestamp.prototype.isEqual = function (o) { return o instanceof Timestamp && o.toMillis() === this.toMillis(); };
  Timestamp.fromMillis = (ms) => new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  Timestamp.now = () => Timestamp.fromMillis(clock.now());
  Timestamp.fromDate = (d) => Timestamp.fromMillis(d.getTime());

  function FBlob(bytes) { this._bytes = new Uint8Array(bytes); }
  FBlob.prototype.toUint8Array = function () { return new Uint8Array(this._bytes); };
  FBlob.prototype.toBase64 = function () { let s = ''; this._bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  FBlob.fromUint8Array = (u8) => new FBlob(u8);
  FBlob.fromBase64String = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new FBlob(u); };

  const SERVER_TS = { __sentinel: 'serverTimestamp' };
  const DELETE_FIELD = { __sentinel: 'delete' };      // FieldValue.delete(): removes the key on update / merge
  const clock = { offset: 0, now() { return Date.now() + this.offset; } };

  function clone(v, now) {
    if (v === SERVER_TS) return Timestamp.fromMillis(now);
    if (v === DELETE_FIELD) return DELETE_FIELD;
    if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
    if (v instanceof FBlob) return new FBlob(v._bytes);
    if (v instanceof Date) return Timestamp.fromDate(v);
    if (Array.isArray(v)) return v.map((x) => clone(x, now));
    if (v && typeof v === 'object') {
      if (v.__sentinel) throw err('invalid-argument', 'unsupported FieldValue');
      const o = {};
      Object.keys(v).forEach((k) => { if (v[k] !== undefined) o[k] = clone(v[k], now); });
      return o;
    }
    if (typeof v === 'function') throw err('invalid-argument', 'functions cannot be stored');
    return v;
  }
  function plain(v) {          // for dump(): JSON-friendly
    if (v instanceof Timestamp) return v.toDate().toISOString();
    if (v instanceof FBlob) return { __bytes: v._bytes.length };
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = plain(v[k]); }); return o; }
    return v;
  }
  function revive(v) {         // for seed(): {__ts: ms|iso} -> Timestamp, {__b64: '...'} / {__size: n} -> Blob
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === 'object') {
      if ('__ts' in v) return Timestamp.fromMillis(typeof v.__ts === 'number' ? v.__ts : Date.parse(v.__ts));
      if ('__b64' in v) return FBlob.fromBase64String(v.__b64);
      if ('__size' in v) { const u = new Uint8Array(v.__size); if (v.__prefix) for (let i = 0; i < v.__prefix.length; i++) u[i] = v.__prefix.charCodeAt(i); return new FBlob(u); }
      const o = {}; Object.keys(v).forEach((k) => { o[k] = revive(v[k]); }); return o;
    }
    return v;
  }
  function err(code, message) { const e = new Error(message || code); e.code = code; e.name = 'FirebaseError'; return e; }

  /* ---------- paths ---------- */
  const norm = (p) => String(p).replace(/^\/+|\/+$/g, '');
  const parentPath = (p) => norm(p).split('/').slice(0, -1).join('/');
  const lastSeg = (p) => norm(p).split('/').pop();
  function newId() { autoId++; return 'auto' + String(autoId).padStart(4, '0') + Math.random().toString(36).slice(2, 10); }
  function childrenOf(colPath) {
    const depth = norm(colPath).split('/').length + 1;
    const out = [];
    store.forEach((data, p) => { if (parentPath(p) === norm(colPath) && p.split('/').length === depth) out.push(p); });
    return out;
  }

  /* ---------- rules mirror ---------- */
  const ADMIN = () => W.ADMIN_UID;
  const isAdmin = (auth) => !!(auth && auth.uid === ADMIN());
  const own = (keys, allowed) => keys.every((k) => allowed.indexOf(k) >= 0);
  const isStr = (v, max) => typeof v === 'string' && v.length <= max;
  const TYPES = ['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];
  const MID_RE = /^m-[0-9]{10,16}-[a-z0-9]{4,10}$/;
  function validMetaList(l) {
    return Array.isArray(l) && l.length <= 3 && l.every((f) => f && typeof f === 'object' && !Array.isArray(f) &&
      own(Object.keys(f), ['id', 'name', 'type', 'size']) && isStr(f.id, 80) && isStr(f.name, 120) &&
      TYPES.indexOf(f.type) >= 0 && Number.isInteger(f.size) && f.size >= 0 && f.size <= 800000);
  }
  const isNow = (v, now) => v instanceof Timestamp && v.toMillis() === now;
  function changedKeys(before, after) {
    const keys = new Set(Object.keys(before).concat(Object.keys(after)));
    return [...keys].filter((k) => JSON.stringify(plain(before[k])) !== JSON.stringify(plain(after[k])));
  }
  function deny(why) { const e = err('permission-denied', 'Missing or insufficient permissions. (fake rules: ' + why + ')'); throw e; }

  function checkWrite(op, path, before, after, auth, now) {
    if (!rules.enforce) return;
    const seg = norm(path).split('/');
    if (seg[0] === 'users') { if (!(auth && auth.uid === seg[1])) deny('users: not your document'); return; }
    if (seg[0] === 'stotras' || seg[0] === 'config' || seg[0] === 'updates') { if (!isAdmin(auth)) deny(seg[0] + ': admin only'); return; }
    if (seg[0] !== 'feedback') deny('unknown collection ' + seg[0]);
    if (seg.length === 2) return checkFeedback(op, before, after, auth, now);
    const parent = store.get('feedback/' + seg[1]);
    if (seg[2] === 'messages' && seg.length === 4) return checkMessage(op, seg[3], parent, after, auth, now);
    if (seg[2] === 'files' && seg.length === 4) return checkFile(op, seg[1], seg[3], parent, after, auth, now);
    deny('unknown path');
  }
  function checkFeedback(op, before, after, auth, now) {
    if (op === 'delete') { if (!isAdmin(auth)) deny('feedback delete: admin only'); return; }
    if (!before) {
      const d = after;
      const allowed = ['type', 'name', 'contact', 'message', 'screen', 'stotram', 'stotramTitle', 'lang', 'device', 'sentAt', 'uid', 'email', 'handled', 'createdAt', 'lastAt', 'lastFrom', 'claimKey', 'files'];
      const extra = Object.keys(d).filter((k) => allowed.indexOf(k) < 0);
      if (extra.length) deny('feedback create: unexpected field(s) ' + extra.join(','));
      if (['correction', 'problem', 'suggestion', 'other'].indexOf(d.type) < 0) deny('feedback create: type');
      if (!(typeof d.message === 'string' && d.message.length > 0 && d.message.length <= 20000)) deny('feedback create: message');
      if (!isNow(d.createdAt, now)) deny('feedback create: createdAt must be the server time');
      if ('lastAt' in d && !isNow(d.lastAt, now)) deny('feedback create: lastAt');
      if ('lastFrom' in d && d.lastFrom !== 'user') deny('feedback create: lastFrom');
      if ('uid' in d && d.uid != null && !(auth && d.uid === auth.uid)) deny('feedback create: uid is not the sender');
      if ('email' in d && d.email != null && !(auth && d.email === auth.email)) deny('feedback create: email is not the sender');
      if ('handled' in d && d.handled !== false) deny('feedback create: handled');
      if ('claimKey' in d && !(d.uid == null && typeof d.claimKey === 'string' && /^[0-9a-fA-F]{32,64}$/.test(d.claimKey))) deny('feedback create: claimKey');
      if ('files' in d && !validMetaList(d.files)) deny('feedback create: files');
      return;
    }
    const ch = changedKeys(before, after);
    if (isAdmin(auth) && own(ch, ['status', 'handled', 'reply', 'repliedAt', 'lastAt', 'lastFrom', 'lastAdminAt'])) {
      if ('status' in after && ['new', 'in_progress', 'answered', 'closed'].indexOf(after.status) < 0) deny('triage: status');
      if (ch.indexOf('lastAdminAt') >= 0 && !isNow(after.lastAdminAt, now)) deny('triage: lastAdminAt');
      if (ch.indexOf('repliedAt') >= 0 && !isNow(after.repliedAt, now)) deny('triage: repliedAt');
      if ('lastFrom' in after && ['user', 'admin'].indexOf(after.lastFrom) < 0) deny('triage: lastFrom');
      return;
    }
    if (auth && before.uid === auth.uid && own(ch, ['lastAt', 'lastFrom', 'status', 'handled'])) {
      if (!isNow(after.lastAt, now) || after.lastFrom !== 'user' || after.status !== 'new' || after.handled !== false) deny('follow-up: values');
      return;
    }
    if (auth && before.uid == null && own(ch, ['uid', 'email', 'claimProof'])) {
      if (typeof before.claimKey !== 'string' || before.claimKey.length < 32) deny('claim: no claimKey');
      if (after.uid !== auth.uid) deny('claim: uid');
      if (after.claimProof !== before.claimKey) deny('claim: wrong proof');
      if (after.email != null && after.email !== auth.email) deny('claim: email');
      if (!(before.createdAt instanceof Timestamp) || now - before.createdAt.toMillis() > 30 * 864e5) deny('claim: older than 30 days');
      return;
    }
    deny('feedback update: not allowed (changed ' + ch.join(',') + ')');
  }
  function checkMessage(op, mid, parent, d, auth, now) {
    if (op === 'delete') { if (!isAdmin(auth)) deny('message delete: admin only'); return; }
    if (op !== 'create') deny('messages are never updated');
    if (!MID_RE.test(mid)) deny('message id pattern');
    if (!parent) deny('message: no conversation');
    if (!own(Object.keys(d), ['from', 'uid', 'text', 'files', 'createdAt'])) deny('message: unexpected field');
    if (!(typeof d.text === 'string' && d.text.length <= 5000)) deny('message: text');
    const files = d.files || [];
    if ('files' in d && !validMetaList(d.files)) deny('message: files');
    if (!d.text.length && !files.length) deny('message: empty');
    if (!isNow(d.createdAt, now)) deny('message: createdAt');
    if (isAdmin(auth) && d.from === 'admin' && d.uid === auth.uid) return;
    if (auth && d.from === 'user' && d.uid === auth.uid && parent.uid === auth.uid) return;
    deny('message: sender');
  }
  function checkFile(op, fbid, fileId, parent, d, auth, now) {
    if (op === 'delete') { if (!isAdmin(auth)) deny('file delete: admin only'); return; }
    if (op !== 'create') deny('files are written once');
    if (!parent) deny('file: no conversation');
    if (!own(Object.keys(d), ['mid', 'n', 'name', 'type', 'size', 'data', 'from', 'createdAt', 'key'])) deny('file: unexpected field');
    if (!/^(first|m-[0-9]{10,16}-[a-z0-9]{4,10})$/.test(d.mid)) deny('file: mid');
    if (!(Number.isInteger(d.n) && d.n >= 0 && d.n <= 2)) deny('file: n');
    if (fileId !== d.mid + '-' + d.n) deny('file: id is not mid-n');
    if (TYPES.indexOf(d.type) < 0) deny('file: type');
    if (!(d.data instanceof FBlob) || d.data._bytes.length > 800000 || d.size !== d.data._bytes.length) deny('file: data/size');
    if (!isStr(d.name, 120)) deny('file: name');
    if (!isNow(d.createdAt, now)) deny('file: createdAt');
    let declaredBy = parent;
    if (d.mid !== 'first') declaredBy = store.get('feedback/' + fbid + '/messages/' + d.mid);
    if (!declaredBy || !Array.isArray(declaredBy.files) || declaredBy.files.length <= d.n) deny('file: not declared');
    if (d.mid !== 'first' && declaredBy.from !== d.from) deny('file: from differs from its message');
    if (isAdmin(auth) && d.from === 'admin') return;
    if (auth && d.from === 'user' && parent.uid === auth.uid) return;
    if (d.from === 'user' && d.mid === 'first' && parent.uid == null && typeof d.key === 'string' && d.key === parent.claimKey &&
        parent.createdAt instanceof Timestamp && now - parent.createdAt.toMillis() < 15 * 60e3) return;
    deny('file: sender');
  }
  function checkRead(path, auth, query) {
    if (!rules.enforce) return;
    const seg = norm(path).split('/');
    if (seg[0] === 'stotras' || seg[0] === 'config' || seg[0] === 'updates') return;
    if (seg[0] === 'users') { if (!(auth && auth.uid === seg[1])) deny('users: not yours'); return; }
    if (seg[0] !== 'feedback') deny('unknown collection');
    if (isAdmin(auth)) return;
    if (seg.length === 1) {   // a query on the collection
      const f = query && query.filters.find((x) => x.field === 'uid' && x.op === '==');
      if (!(auth && f && f.value === auth.uid)) deny('feedback list: must be where uid == your uid');
      return;
    }
    const parent = store.get('feedback/' + seg[1]);
    if (!(auth && parent && parent.uid === auth.uid)) deny('feedback read: not your conversation');
  }

  /* ---------- traps (fail / hold) and offline ---------- */
  function trapFor(op, path) {
    const i = traps.findIndex((t) => (!t.op || t.op === op) && t.re.test(norm(path)));
    if (i < 0) return null;
    return traps.splice(i, 1)[0];
  }
  // Runs a write: rules, traps, offline. apply() mutates the store.
  function runWrite(list) {           // list: [{ op, path, data(raw), merge }]
    return new Promise((resolve, reject) => {
      const auth = currentUser ? { uid: currentUser.uid, email: currentUser.email } : null;
      const attempt = () => {
        const now = clock.now();
        const staged = new Map();
        const result = [];
        try {
          list.forEach((w) => {
            const p = norm(w.path);
            const before = staged.has(p) ? staged.get(p) : (store.has(p) ? store.get(p) : null);
            let after = null;
            let op = w.op;
            if (w.op === 'set') {
              const incoming = clone(w.data, now);
              after = w.merge && before ? Object.assign({}, before, incoming) : incoming;
              op = before ? 'update' : 'create';
            } else if (w.op === 'update') {
              if (!before) throw err('not-found', 'No document to update: ' + p);
              after = Object.assign({}, before, clone(w.data, now));
              op = 'update';
            } else if (w.op === 'delete') {
              op = 'delete';
            }
            if (after) Object.keys(after).forEach((k) => { if (after[k] === DELETE_FIELD) delete after[k]; });
            checkWrite(op, p, before, after, auth, now);
            staged.set(p, after);
            result.push({ op: op, path: p });
          });
        } catch (e) {
          list.forEach((w) => writes.push({ op: w.op, path: norm(w.path), uid: auth && auth.uid, ok: false, code: e.code }));
          reject(e);
          return;
        }
        staged.forEach((v, p) => { if (v === null) store.delete(p); else store.set(p, v); });
        result.forEach((r) => writes.push({ op: r.op, path: r.path, uid: auth && auth.uid, ok: true }));
        resolve();
      };
      const first = list[0];
      const trap = trapFor(first.op === 'set' ? 'set' : first.op, first.path);
      if (trap && trap.kind === 'fail') {
        later(() => { writes.push({ op: first.op, path: norm(first.path), uid: auth && auth.uid, ok: false, code: trap.code }); reject(err(trap.code, 'fake failure')); });
        return;
      }
      if (trap && trap.kind === 'hold') { trap.holds.push({ go: attempt, fail: (code) => reject(err(code || 'unavailable')) }); held.push(trap); return; }
      if (offline) { pendingOffline.push(attempt); return; }   // like Firestore: waits instead of failing
      later(attempt);
    });
  }
  const held = [];
  const pendingOffline = [];

  /* ---------- snapshots ---------- */
  function DocSnap(path, data) {
    this.id = lastSeg(path);
    this.ref = new DocRef(path);
    this.exists = data != null;
    this._data = data;
    this.metadata = { fromCache: false, hasPendingWrites: false };
  }
  DocSnap.prototype.data = function () { return this._data == null ? undefined : clone(this._data, clock.now()); };
  DocSnap.prototype.get = function (f) { const d = this.data(); return d ? d[f] : undefined; };
  function QuerySnap(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
    this.metadata = { fromCache: false, hasPendingWrites: false };
  }
  QuerySnap.prototype.forEach = function (fn) { this.docs.forEach(fn); };

  function readDelay() {
    return new Promise((resolve, reject) => later(() => (offline ? reject(err('unavailable', 'Failed to get document because the client is offline.')) : resolve())));
  }

  /* ---------- refs ---------- */
  function DocRef(path) { this.path = norm(path); this.id = lastSeg(path); }
  DocRef.prototype.collection = function (name) { return new Query(this.path + '/' + name); };
  DocRef.prototype.get = function () {
    const auth = currentUser ? { uid: currentUser.uid } : null;
    return readDelay().then(() => { checkRead(this.path, auth, null); return new DocSnap(this.path, store.get(this.path) || null); });
  };
  DocRef.prototype.set = function (data, opts) { return runWrite([{ op: 'set', path: this.path, data: data, merge: !!(opts && opts.merge) }]); };
  DocRef.prototype.update = function (data) { return runWrite([{ op: 'update', path: this.path, data: data }]); };
  DocRef.prototype.delete = function () { return runWrite([{ op: 'delete', path: this.path }]); };

  function Query(colPath, filters, orders, lim, after) {
    this.path = norm(colPath); this.id = lastSeg(colPath);
    this.filters = filters || []; this.orders = orders || []; this.lim = lim; this.after = after || null;
  }
  Query.prototype._with = function (patch) { return Object.assign(new Query(this.path, this.filters, this.orders, this.lim, this.after), patch); };
  Query.prototype.doc = function (id) { return new DocRef(this.path + '/' + (id || newId())); };
  Query.prototype.add = function (data) { const ref = this.doc(); return ref.set(data).then(() => ref); };
  Query.prototype.where = function (field, op, value) {
    if (op !== '==') throw err('unimplemented', 'fake supports only ==');
    return this._with({ filters: this.filters.concat([{ field: field, op: op, value: value }]) });
  };
  Query.prototype.orderBy = function (field, dir) { return this._with({ orders: this.orders.concat([{ field: field, dir: dir === 'desc' ? 'desc' : 'asc' }]) }); };
  Query.prototype.limit = function (n) { return this._with({ lim: n }); };
  Query.prototype.startAfter = function (snap) { return this._with({ after: snap }); };
  const sortVal = (v) => (v instanceof Timestamp ? v.toMillis() : v);
  Query.prototype.get = function () {
    const auth = currentUser ? { uid: currentUser.uid } : null;
    return readDelay().then(() => {
      checkRead(this.path, auth, this);
      let paths = childrenOf(this.path);
      paths = paths.filter((p) => this.filters.every((f) => JSON.stringify(plain(store.get(p)[f.field])) === JSON.stringify(plain(f.value))));
      // Like Firestore: a document without an orderBy field is left out.
      this.orders.forEach((o) => { paths = paths.filter((p) => store.get(p)[o.field] !== undefined); });
      paths.sort((a, b) => {
        for (const o of this.orders) {
          const x = sortVal(store.get(a)[o.field]); const y = sortVal(store.get(b)[o.field]);
          if (x < y) return o.dir === 'desc' ? 1 : -1;
          if (x > y) return o.dir === 'desc' ? -1 : 1;
        }
        return a < b ? -1 : a > b ? 1 : 0;
      });
      if (this.after) { const i = paths.indexOf(norm(this.after.ref ? this.after.ref.path : '')); if (i >= 0) paths = paths.slice(i + 1); }
      if (typeof this.lim === 'number') paths = paths.slice(0, this.lim);
      return new QuerySnap(paths.map((p) => new DocSnap(p, store.get(p))));
    });
  };

  function Batch() { this.ops = []; this.done = false; }
  Batch.prototype.set = function (ref, data, opts) { this.ops.push({ op: 'set', path: ref.path, data: data, merge: !!(opts && opts.merge) }); return this; };
  Batch.prototype.update = function (ref, data) { this.ops.push({ op: 'update', path: ref.path, data: data }); return this; };
  Batch.prototype.delete = function (ref) { this.ops.push({ op: 'delete', path: ref.path }); return this; };
  Batch.prototype.commit = function () { if (this.done) return Promise.reject(err('failed-precondition', 'batch already committed')); this.done = true; return runWrite(this.ops); };

  const db = {
    collection: (name) => new Query(name),
    doc: (path) => new DocRef(path),
    batch: () => new Batch(),
    settings: () => {},
    enablePersistence: () => Promise.resolve()
  };

  /* ---------- auth ---------- */
  function makeUser(u) {
    return { uid: u.uid, email: u.email || null, displayName: u.displayName || null, isAnonymous: false,
      getIdToken: () => Promise.resolve('fake-id-token-' + u.uid), providerData: [] };
  }
  function fire() { const u = currentUser; authListeners.slice().forEach((fn) => { try { fn(u); } catch (e) { console.error(e); } }); }
  const auth = {
    get currentUser() { return currentUser; },
    onAuthStateChanged(fn) { authListeners.push(fn); later(() => fn(currentUser)); return () => { const i = authListeners.indexOf(fn); if (i >= 0) authListeners.splice(i, 1); }; },
    signInWithPopup() { currentUser = makeUser(popupUser); later(fire); return Promise.resolve({ user: currentUser }); },
    signInWithRedirect() { return this.signInWithPopup(); },
    getRedirectResult() { return Promise.resolve({ user: null }); },
    signOut() { currentUser = null; later(fire); return Promise.resolve(); },
    setPersistence() { return Promise.resolve(); }
  };
  function GoogleAuthProvider() {}
  GoogleAuthProvider.prototype.addScope = function () {};
  GoogleAuthProvider.prototype.setCustomParameters = function () {};

  /* ---------- the firebase namespace ---------- */
  const apps = [];
  const authFn = () => auth;
  authFn.GoogleAuthProvider = GoogleAuthProvider;
  authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
  const firestoreFn = () => db;
  firestoreFn.FieldValue = { serverTimestamp: () => SERVER_TS, delete: () => DELETE_FIELD };
  firestoreFn.Timestamp = Timestamp;
  firestoreFn.Blob = FBlob;
  W.firebase = {
    apps: apps,
    initializeApp(cfg) { const app = { name: '[DEFAULT]', options: cfg || {} }; if (!apps.length) apps.push(app); return apps[0]; },
    app() { return apps[0]; },
    auth: authFn,
    firestore: firestoreFn,
    __fake: true
  };

  /* ---------- test control ---------- */
  W.__fb = {
    signIn(uid, opts) { currentUser = makeUser(Object.assign({ uid: uid }, opts || {})); fire(); return currentUser; },
    signOut() { currentUser = null; fire(); },
    setPopupUser(uid, opts) { popupUser = Object.assign({ uid: uid }, opts || {}); },
    user() { return currentUser ? { uid: currentUser.uid, email: currentUser.email } : null; },
    seed(path, data) { store.set(norm(path), clone(revive(data), clock.now())); },
    get(path) { const d = store.get(norm(path)); return d ? plain(d) : null; },
    dump(prefix) { const out = {}; [...store.keys()].sort().forEach((p) => { if (!prefix || p.indexOf(norm(prefix)) === 0) out[p] = plain(store.get(p)); }); return out; },
    paths(prefix) { return [...store.keys()].filter((p) => !prefix || p.indexOf(norm(prefix)) === 0).sort(); },
    writes() { return writes.slice(); },
    clearWrites() { writes.length = 0; },
    failNext(pattern, code, op) { traps.push({ re: new RegExp(pattern), op: op || null, kind: 'fail', code: code || 'unavailable' }); },
    holdNext(pattern, op) { traps.push({ re: new RegExp(pattern), op: op || null, kind: 'hold', holds: [] }); },
    releaseHeld() { const n = held.reduce((a, t) => a + t.holds.length, 0); held.splice(0).forEach((t) => t.holds.splice(0).forEach((h) => h.go())); return n; },
    heldCount() { return held.reduce((a, t) => a + t.holds.length, 0); },
    setOffline(on) { offline = !!on; if (!offline) pendingOffline.splice(0).forEach((go) => later(go)); },
    rules: rules,
    advanceClock(ms) { clock.offset += ms; }
  };
})();
