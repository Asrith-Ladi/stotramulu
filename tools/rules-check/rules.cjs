'use strict';
// Throwaway parser + evaluator for the subset of Firestore rules v2 used in
// docs/firestore.rules.proposed. Not the real engine: it checks syntax and
// logic (field names, precedence, scoping, short-circuit, error semantics).
const fs = require('fs');

class RuleError extends Error {}
const ERR = (m) => { throw new RuleError(m); };

// ---------------- lexer ----------------
function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const push = (t, v, extra) => toks.push(Object.assign({ t, v, line }, extra || {}));
  const prevSig = () => toks.length ? toks[toks.length - 1] : null;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i); if (j < 0) throw new Error('unclosed block comment'); for (let k = i; k < j; k++) if (src[k] === '\n') line++; i = j + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; } if (src[j] === '\n') throw new Error('newline in string line ' + line); s += src[j]; j++; }
      if (j >= src.length) throw new Error('unclosed string line ' + line);
      push('str', s); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; push('num', Number(src.slice(i, j))); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++; push('id', src.slice(i, j)); i = j; continue; }
    if (c === '/') {
      const p = prevSig();
      const pathCtx = p && ((p.t === 'id' && p.v === 'match') || (p.t === 'op' && (p.v === '(' || p.v === ',')));
      if (pathCtx) {
        // path literal: segments until whitespace, ')' or ',' or '{' preceded by space
        const segs = [];
        while (src[i] === '/') {
          i++;
          if (src[i] === '{') { const j = src.indexOf('}', i); segs.push({ wild: src.slice(i + 1, j) }); i = j + 1; continue; }
          if (src.startsWith('$(', i)) {
            let depth = 0, j = i + 1;
            for (; j < src.length; j++) { if (src[j] === '(') depth++; else if (src[j] === ')') { depth--; if (depth === 0) break; } }
            segs.push({ expr: src.slice(i + 2, j) }); i = j + 1; continue;
          }
          let j = i; while (j < src.length && /[A-Za-z0-9_\-]/.test(src[j])) j++;
          if (j === i) throw new Error('empty path segment line ' + line);
          segs.push({ lit: src.slice(i, j) }); i = j;
        }
        push('path', segs); continue;
      }
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { push('op', two); i += 2; continue; }
    if ('{}()[],;:.=<>!+-*/%?'.includes(c)) { push('op', c); i++; continue; }
    throw new Error('unexpected char ' + JSON.stringify(c) + ' line ' + line);
  }
  push('eof', null);
  return toks;
}

// ---------------- parser ----------------
function Parser(toks) { this.toks = toks; this.i = 0; }
Parser.prototype.peek = function (o) { return this.toks[this.i + (o || 0)]; };
Parser.prototype.next = function () { return this.toks[this.i++]; };
Parser.prototype.is = function (t, v, o) { const k = this.peek(o); return k.t === t && (v === undefined || k.v === v); };
Parser.prototype.expect = function (t, v) {
  const k = this.next();
  if (k.t !== t || (v !== undefined && k.v !== v)) throw new Error('expected ' + t + ' ' + (v || '') + ' got ' + k.t + ' ' + JSON.stringify(k.v) + ' line ' + k.line);
  return k;
};

Parser.prototype.file = function () {
  this.expect('id', 'rules_version'); this.expect('op', '='); const ver = this.expect('str').v; this.expect('op', ';');
  this.expect('id', 'service');
  let name = this.expect('id').v; while (this.is('op', '.')) { this.next(); name += '.' + this.expect('id').v; }
  this.expect('op', '{');
  const body = this.block();
  this.expect('op', '}');
  this.expect('eof');
  return { ver, name, body };
};
Parser.prototype.block = function () {
  const items = [];
  while (!this.is('op', '}')) {
    if (this.is('id', 'match')) items.push(this.match());
    else if (this.is('id', 'function')) items.push(this.func());
    else if (this.is('id', 'allow')) items.push(this.allow());
    else { const k = this.peek(); throw new Error('unexpected ' + k.t + ' ' + JSON.stringify(k.v) + ' line ' + k.line); }
  }
  return items;
};
Parser.prototype.match = function () {
  const line = this.expect('id', 'match').line;
  const path = this.expect('path').v;
  this.expect('op', '{');
  const body = this.block();
  this.expect('op', '}');
  return { kind: 'match', path, body, line };
};
Parser.prototype.func = function () {
  this.expect('id', 'function');
  const name = this.expect('id').v;
  this.expect('op', '(');
  const params = [];
  while (!this.is('op', ')')) { params.push(this.expect('id').v); if (this.is('op', ',')) this.next(); }
  this.expect('op', ')');
  this.expect('op', '{');
  const lets = [];
  while (this.is('id', 'let')) {
    this.next(); const n = this.expect('id').v; this.expect('op', '='); const e = this.expr(); this.expect('op', ';'); lets.push({ n, e });
  }
  this.expect('id', 'return');
  const ret = this.expr();
  this.expect('op', ';');
  this.expect('op', '}');
  return { kind: 'function', name, params, lets, ret };
};
const METHODS = ['read', 'write', 'get', 'list', 'create', 'update', 'delete'];
Parser.prototype.allow = function () {
  const line = this.expect('id', 'allow').line;
  const methods = [];
  for (;;) { const m = this.expect('id').v; if (!METHODS.includes(m)) throw new Error('bad method ' + m); methods.push(m); if (this.is('op', ',')) { this.next(); continue; } break; }
  let cond = { k: 'lit', v: true };
  if (this.is('op', ':')) { this.next(); this.expect('id', 'if'); cond = this.expr(); }
  this.expect('op', ';');
  return { kind: 'allow', methods, cond, line };
};
// precedence: || < && < (== !=) < (in is) < (< > <= >=) < (+ -) < (* / %) < unary < postfix
Parser.prototype.expr = function () { return this.or(); };
Parser.prototype.or = function () { let l = this.and(); while (this.is('op', '||')) { this.next(); l = { k: 'or', l, r: this.and() }; } return l; };
Parser.prototype.and = function () { let l = this.eq(); while (this.is('op', '&&')) { this.next(); l = { k: 'and', l, r: this.eq() }; } return l; };
Parser.prototype.eq = function () { let l = this.inis(); while (this.is('op', '==') || this.is('op', '!=')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.inis() }; } return l; };
const TYPES = ['bool', 'bytes', 'float', 'int', 'list', 'latlng', 'number', 'map', 'path', 'string', 'timestamp', 'duration', 'set', 'map_diff', 'constraint'];
Parser.prototype.inis = function () {
  let l = this.rel();
  for (;;) {
    if (this.is('id', 'in')) { this.next(); l = { k: 'in', l, r: this.rel() }; continue; }
    if (this.is('id', 'is')) { this.next(); const ty = this.expect('id').v; if (!TYPES.includes(ty)) throw new Error('unknown type ' + ty); l = { k: 'is', l, ty }; continue; }
    return l;
  }
};
Parser.prototype.rel = function () { let l = this.add(); while (['<', '>', '<=', '>='].some((o) => this.is('op', o))) { const op = this.next().v; l = { k: 'bin', op, l, r: this.add() }; } return l; };
Parser.prototype.add = function () { let l = this.mul(); while (this.is('op', '+') || this.is('op', '-')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.mul() }; } return l; };
Parser.prototype.mul = function () { let l = this.unary(); while (this.is('op', '*') || this.is('op', '/') || this.is('op', '%')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.unary() }; } return l; };
Parser.prototype.unary = function () {
  if (this.is('op', '!')) { this.next(); return { k: 'not', e: this.unary() }; }
  if (this.is('op', '-')) { this.next(); return { k: 'neg', e: this.unary() }; }
  return this.postfix();
};
Parser.prototype.postfix = function () {
  let e = this.primary();
  for (;;) {
    if (this.is('op', '.')) { this.next(); const n = this.expect('id').v; if (this.is('op', '(')) { const args = this.args(); e = { k: 'mcall', obj: e, n, args }; } else e = { k: 'field', obj: e, n }; continue; }
    if (this.is('op', '[')) { this.next(); const ix = this.expr(); this.expect('op', ']'); e = { k: 'index', obj: e, ix }; continue; }
    return e;
  }
};
Parser.prototype.args = function () {
  this.expect('op', '(');
  const a = [];
  while (!this.is('op', ')')) { a.push(this.expr()); if (this.is('op', ',')) { this.next(); if (this.is('op', ')')) throw new Error('trailing comma line ' + this.peek().line); } else if (!this.is('op', ')')) throw new Error('expected , or ) line ' + this.peek().line); }
  this.expect('op', ')');
  return a;
};
Parser.prototype.primary = function () {
  const k = this.next();
  if (k.t === 'str') return { k: 'lit', v: k.v };
  if (k.t === 'num') return { k: 'lit', v: k.v };
  if (k.t === 'path') return { k: 'path', segs: k.v.map((s) => s.expr !== undefined ? { expr: parseExpr(s.expr) } : s) };
  if (k.t === 'op' && k.v === '(') { const e = this.expr(); this.expect('op', ')'); return e; }
  if (k.t === 'op' && k.v === '[') {
    const items = [];
    while (!this.is('op', ']')) { items.push(this.expr()); if (this.is('op', ',')) this.next(); else if (!this.is('op', ']')) throw new Error('expected , or ] line ' + this.peek().line); }
    this.expect('op', ']');
    return { k: 'list', items };
  }
  if (k.t === 'id') {
    if (k.v === 'true') return { k: 'lit', v: true };
    if (k.v === 'false') return { k: 'lit', v: false };
    if (k.v === 'null') return { k: 'lit', v: null };
    if (this.is('op', '(')) return { k: 'call', n: k.v, args: this.args(), line: k.line };
    return { k: 'var', n: k.v, line: k.line };
  }
  throw new Error('unexpected token ' + k.t + ' ' + JSON.stringify(k.v) + ' line ' + k.line);
};
function parseExpr(src) { const p = new Parser(lex(src)); const e = p.expr(); p.expect('eof'); return e; }

// ---------------- values ----------------
const TS = (ms) => ({ $ts: ms });
const DUR = (ms) => ({ $dur: ms });
const isTs = (v) => v && typeof v === 'object' && '$ts' in v;
const isDur = (v) => v && typeof v === 'object' && '$dur' in v;
const isBytes = (v) => v instanceof Uint8Array;
// A float Firestore value (JS numbers that are whole count as int). FL(0) is 0.0.
const FL = (x) => ({ $float: x });
const isFl = (v) => v && typeof v === 'object' && '$float' in v;
const num = (v) => (typeof v === 'number' ? v : isFl(v) ? v.$float : undefined);
const numOut = (l, r, x) => (isFl(l) || isFl(r) ? FL(x) : x);
const isList = (v) => Array.isArray(v);
const isSet = (v) => v && v.$set;
const isMap = (v) => v && typeof v === 'object' && !isList(v) && !isTs(v) && !isDur(v) && !isBytes(v) && !isSet(v) && !isFl(v) && !v.$diff && !v.$path && !v.$resource;
function typeOf(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (isFl(v)) return 'float';
  if (typeof v === 'string') return 'string';
  if (isTs(v)) return 'timestamp'; if (isDur(v)) return 'duration'; if (isBytes(v)) return 'bytes';
  if (isList(v)) return 'list'; if (isSet(v)) return 'set'; if (v.$diff) return 'map_diff'; if (v.$path) return 'path';
  if (isMap(v)) return 'map';
  return 'unknown';
}
function eqv(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (num(a) !== undefined && num(b) !== undefined) return num(a) === num(b);   // int and float compare equal
  if (isTs(a) && isTs(b)) return a.$ts === b.$ts;
  if (isDur(a) && isDur(b)) return a.$dur === b.$dur;
  if (isBytes(a) && isBytes(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => eqv(x, b[i]));
  if (isMap(a) && isMap(b)) { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => k in b && eqv(a[k], b[k])); }
  return false;
}
const setOf = (arr) => ({ $set: true, items: arr });

// ---------------- evaluator ----------------
function Evaluator(rules, db, stats) { this.rules = rules; this.db = db; this.stats = stats; }
Evaluator.prototype.call = function (fn, args, scopeVars, funcs) {
  if (args.length !== fn.params.length) ERR('arity ' + fn.name);
  const env = Object.assign({}, fn.closureVars);
  fn.params.forEach((p, i) => { env[p] = args[i]; });
  // lets are evaluated lazily-by-name in real rules; eager is fine for checking
  const lazy = {};
  for (const l of fn.lets) { const e = l.e; const envSnap = env; let cached, done = false; Object.defineProperty(lazy, l.n, { get: () => { if (!done) { cached = { v: this.tryEval(e, envSnap, fn.closureFuncs) }; done = true; } if (cached.v instanceof RuleError) throw cached.v; return cached.v; }, enumerable: true }); env[l.n] = { $lazy: lazy, n: l.n }; }
  return this.eval(fn.ret, env, fn.closureFuncs);
};
Evaluator.prototype.tryEval = function (e, env, funcs) { try { return this.eval(e, env, funcs); } catch (x) { if (x instanceof RuleError) return x; throw x; } };
Evaluator.prototype.eval = function (e, env, funcs) {
  const self = this;
  switch (e.k) {
    case 'lit': return e.v;
    case 'list': return e.items.map((x) => self.eval(x, env, funcs));
    case 'var': {
      if (e.n in env) { const v = env[e.n]; if (v && v.$lazy) return v.$lazy[v.n]; return v; }
      if (e.n === 'request') return this.req.request;
      if (e.n === 'resource') return this.req.resource;
      if (e.n === 'duration') return { $ns: 'duration' };
      throw new Error('UNBOUND variable ' + e.n + ' line ' + e.line);
    }
    case 'path': {
      const parts = e.segs.map((s) => { if (s.lit !== undefined) return s.lit; if (s.expr) { const v = self.eval(s.expr, env, funcs); if (typeof v !== 'string') ERR('path segment not string'); return v; } throw new Error('wildcard in expression path'); });
      return { $path: '/' + parts.join('/') };
    }
    case 'and': {
      let l; try { l = this.eval(e.l, env, funcs); } catch (x) { if (!(x instanceof RuleError)) throw x; const r = this.eval(e.r, env, funcs); if (r === false) return false; throw x; }
      if (typeof l !== 'boolean') ERR('&& non-bool');
      if (!l) return false;
      const r = this.eval(e.r, env, funcs); if (typeof r !== 'boolean') ERR('&& non-bool'); return r;
    }
    case 'or': {
      let l; try { l = this.eval(e.l, env, funcs); } catch (x) { if (!(x instanceof RuleError)) throw x; const r = this.eval(e.r, env, funcs); if (r === true) return true; throw x; }
      if (typeof l !== 'boolean') ERR('|| non-bool');
      if (l) return true;
      const r = this.eval(e.r, env, funcs); if (typeof r !== 'boolean') ERR('|| non-bool'); return r;
    }
    case 'not': { const v = this.eval(e.e, env, funcs); if (typeof v !== 'boolean') ERR('! non-bool'); return !v; }
    case 'neg': { const v = this.eval(e.e, env, funcs); if (num(v) === undefined) ERR('neg'); return isFl(v) ? FL(-v.$float) : -v; }
    case 'is': { const v = this.eval(e.l, env, funcs); const t = typeOf(v); if (e.ty === 'number') return t === 'int' || t === 'float'; return t === e.ty; }
    case 'in': {
      const l = this.eval(e.l, env, funcs), r = this.eval(e.r, env, funcs);
      if (isList(r)) return r.some((x) => eqv(x, l));
      if (isSet(r)) return r.items.some((x) => eqv(x, l));
      if (isMap(r)) { if (typeof l !== 'string') ERR('in map non-string'); return Object.prototype.hasOwnProperty.call(r, l); }
      ERR('in: bad rhs ' + typeOf(r));
    }
    case 'bin': {
      const l = this.eval(e.l, env, funcs), r = this.eval(e.r, env, funcs);
      switch (e.op) {
        case '==': return eqv(l, r);
        case '!=': return !eqv(l, r);
        case '+':
          if (typeof l === 'string' && typeof r === 'string') return l + r;
          if (num(l) !== undefined && num(r) !== undefined) return numOut(l, r, num(l) + num(r));
          if (isTs(l) && isDur(r)) return TS(l.$ts + r.$dur);
          ERR('+ types ' + typeOf(l) + ' ' + typeOf(r));
        case '-':
          if (num(l) !== undefined && num(r) !== undefined) return numOut(l, r, num(l) - num(r));
          if (isTs(l) && isDur(r)) return TS(l.$ts - r.$dur);
          if (isTs(l) && isTs(r)) return DUR(l.$ts - r.$ts);
          ERR('- types ' + typeOf(l) + ' ' + typeOf(r));
        case '<': case '>': case '<=': case '>=': {
          let a, b;
          if (num(l) !== undefined && num(r) !== undefined) { a = num(l); b = num(r); }
          else if (isTs(l) && isTs(r)) { a = l.$ts; b = r.$ts; }
          else if (typeof l === 'string' && typeof r === 'string') { a = l; b = r; }
          else ERR('compare types ' + typeOf(l) + ' ' + typeOf(r));
          return e.op === '<' ? a < b : e.op === '>' ? a > b : e.op === '<=' ? a <= b : a >= b;
        }
        default: ERR('op ' + e.op);
      }
    }
    case 'field': {
      const o = this.eval(e.obj, env, funcs);
      if (o && o.$ns === 'duration') ERR('duration field');
      if (o && o.$resource) { if (e.n === 'data') return o.data; if (e.n === 'id') return o.id; ERR('resource field ' + e.n); }
      if (o && o.$request) { if (e.n in o) return o[e.n]; ERR('request field ' + e.n); }
      if (o && o.$auth) { if (e.n in o) return o[e.n]; ERR('auth field ' + e.n); }
      if (isMap(o)) { if (Object.prototype.hasOwnProperty.call(o, e.n)) return o[e.n]; ERR('missing field ' + e.n); }
      ERR('field ' + e.n + ' on ' + typeOf(o));
    }
    case 'index': {
      const o = this.eval(e.obj, env, funcs), ix = this.eval(e.ix, env, funcs);
      if (isMap(o)) { if (typeof ix !== 'string') ERR('map index'); if (Object.prototype.hasOwnProperty.call(o, ix)) return o[ix]; ERR('missing key ' + ix); }
      if (isList(o)) { if (typeof ix !== 'number' || !Number.isInteger(ix) || ix < 0 || ix >= o.length) ERR('list index'); return o[ix]; }
      ERR('index on ' + typeOf(o));
    }
    case 'mcall': {
      const o = this.eval(e.obj, env, funcs);
      const a = e.args.map((x) => self.eval(x, env, funcs));
      if (o && o.$ns === 'duration') {
        if (e.n === 'value') { const units = { w: 6048e5, d: 864e5, h: 36e5, m: 6e4, s: 1e3, ms: 1, ns: 1e-6 }; if (!(a[1] in units)) ERR('bad unit ' + a[1]); if (typeof a[0] !== 'number') ERR('dur mag'); return DUR(a[0] * units[a[1]]); }
        throw new Error('UNKNOWN duration.' + e.n);
      }
      const t = typeOf(o);
      const need = (n) => { if (a.length !== n) throw new Error('ARITY ' + e.n + ' expects ' + n); };
      if (t === 'map' || (o && o.$auth === undefined && o && o.$token)) {
        if (e.n === 'keys') { need(0); return Object.keys(o); }
        if (e.n === 'size') { need(0); return Object.keys(o).length; }
        if (e.n === 'values') { need(0); return Object.values(o); }
        if (e.n === 'get') { need(2); if (typeof a[0] !== 'string') ERR('get key'); return Object.prototype.hasOwnProperty.call(o, a[0]) ? o[a[0]] : a[1]; }
        if (e.n === 'diff') { need(1); if (!isMap(a[0])) ERR('diff non-map'); return { $diff: true, a: o, b: a[0] }; }
        throw new Error('UNKNOWN map method ' + e.n);
      }
      if (t === 'map_diff') {
        const A = o.a, B = o.b;
        const added = Object.keys(A).filter((k) => !(k in B));
        const removed = Object.keys(B).filter((k) => !(k in A));
        const changed = Object.keys(A).filter((k) => k in B && !eqv(A[k], B[k]));
        if (e.n === 'affectedKeys') { need(0); return setOf(added.concat(removed, changed)); }
        if (e.n === 'addedKeys') return setOf(added); if (e.n === 'removedKeys') return setOf(removed); if (e.n === 'changedKeys') return setOf(changed);
        throw new Error('UNKNOWN diff method ' + e.n);
      }
      if (t === 'list' || t === 'set') {
        const items = t === 'list' ? o : o.items;
        if (e.n === 'size') { need(0); return items.length; }
        if (['hasOnly', 'hasAll', 'hasAny'].includes(e.n)) { need(1); if (!isList(a[0]) && !isSet(a[0])) ERR(e.n + ' arg'); const arg = isList(a[0]) ? a[0] : a[0].items; const inArg = (x) => arg.some((y) => eqv(x, y)); const inItems = (y) => items.some((x) => eqv(x, y)); if (e.n === 'hasOnly') return items.every(inArg); if (e.n === 'hasAll') return arg.every(inItems); return arg.some(inItems); }
        throw new Error('UNKNOWN list method ' + e.n);
      }
      if (t === 'string') {
        if (e.n === 'size') { need(0); return [...o].length; }
        if (e.n === 'matches') { need(1); if (typeof a[0] !== 'string') ERR('matches arg'); return new RegExp('^(?:' + a[0] + ')$').test(o); }
        if (e.n === 'lower') return o.toLowerCase(); if (e.n === 'upper') return o.toUpperCase();
        throw new Error('UNKNOWN string method ' + e.n);
      }
      if (t === 'bytes') { if (e.n === 'size') { need(0); return o.length; } throw new Error('UNKNOWN bytes method ' + e.n); }
      ERR('method ' + e.n + ' on ' + t);
    }
    case 'call': {
      const a = () => e.args.map((x) => self.eval(x, env, funcs));
      if (funcs[e.n]) return this.call(funcs[e.n], a(), env, funcs);
      if (e.n === 'string') { const v = a(); if (v.length !== 1) throw new Error('ARITY string'); const x = v[0]; if (isFl(x)) return Number.isInteger(x.$float) ? x.$float.toFixed(1) : String(x.$float); if (typeof x === 'number' || typeof x === 'boolean') return String(x); if (typeof x === 'string') return x; if (x === null) return 'null'; ERR('string() of ' + typeOf(x)); }
      if (e.n === 'get' || e.n === 'exists') {
        const v = a(); if (v.length !== 1 || !v[0] || !v[0].$path) throw new Error('get() needs a path');
        const p = v[0].$path;
        const m = p.match(/^\/databases\/\(default\)\/documents(\/.*)$/); if (!m) ERR('get path outside documents: ' + p);
        const key = m[1];
        this.stats.gets.add(key); this.stats.getCalls++;
        const doc = this.db[key];
        if (e.n === 'exists') return !!doc;
        return doc ? { $resource: true, data: doc, id: key.split('/').pop() } : null;
      }
      throw new Error('UNKNOWN function ' + e.n + ' line ' + e.line);
    }
    default: throw new Error('bad node ' + e.k);
  }
};

// Walk the match tree for a document path; returns allow conditions with their env/funcs.
function collect(rules, docPath) {
  const segs = ['databases', '(default)', 'documents'].concat(docPath.split('/').filter(Boolean));
  const out = [];
  function walk(items, rest, vars, funcsIn) {
    const funcs = Object.assign({}, funcsIn);
    // functions of this block see vars of this block and all functions of this block + outer
    for (const it of items) if (it.kind === 'function') funcs[it.name] = it;
    for (const it of items) if (it.kind === 'function') { it.closureVars = Object.assign({}, vars); it.closureFuncs = funcs; }
    if (rest.length === 0) { for (const it of items) if (it.kind === 'allow') out.push({ allow: it, vars, funcs }); }
    for (const it of items) {
      if (it.kind !== 'match') continue;
      const p = it.path;
      if (p.length > rest.length) continue;
      const v = Object.assign({}, vars);
      let ok = true;
      for (let i = 0; i < p.length; i++) {
        if (p[i].wild !== undefined) { if (p[i].wild.includes('=**')) throw new Error('recursive wildcard not handled'); v[p[i].wild] = rest[i]; }
        else if (p[i].lit !== rest[i]) { ok = false; break; }
      }
      if (ok) walk(it.body, rest.slice(p.length), v, funcs);
    }
  }
  walk(rules.body, segs, {}, {});
  return out;
}

function evaluate(rules, db, req) {
  const method = req.method;
  const matches = collect(rules, req.path);
  const stats = { gets: new Set(), getCalls: 0 };
  const ev = new Evaluator(rules, db, stats);
  const existing = db[req.path] || null;
  const now = req.now;
  const auth = req.auth ? { $auth: true, uid: req.auth.uid, token: Object.assign({}, req.auth.token || {}) } : null;
  const request = { $request: true, auth, time: TS(now), resource: req.data !== undefined ? { $resource: true, data: req.data, id: req.path.split('/').pop() } : null, method };
  ev.req = { request, resource: existing ? { $resource: true, data: existing, id: req.path.split('/').pop() } : null };
  let allowed = false; const errors = [];
  for (const m of matches) {
    const ms = m.allow.methods;
    const applies = ms.includes(method) || (ms.includes('read') && (method === 'get' || method === 'list')) || (ms.includes('write') && ['create', 'update', 'delete'].includes(method));
    if (!applies) continue;
    try { const v = ev.eval(m.allow.cond, Object.assign({}, m.vars), m.funcs); if (v === true) { allowed = true; break; } }
    catch (x) { if (x instanceof RuleError) errors.push(x.message); else throw x; }
  }
  return { allowed, gets: stats.gets.size, getCalls: stats.getCalls, errors, matched: matches.length };
}

module.exports = { lex, Parser, evaluate, TS, DUR, FL, collect };
