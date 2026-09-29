'use strict';
/* ============================================================
   UI contract checker for the redesign (docs/redesign-research/contract.md).

   Static, file-based: no browser, no build. CSS is parsed with postcss
   (a devDependency); index.html and the classic scripts in public/assets
   are read with the small tolerant parsers at the bottom of this file.

     node tools/check-ui-contract.cjs            grouped report
     node tools/check-ui-contract.cjs --all      do not truncate long groups
     node tools/check-ui-contract.cjs --json     machine-readable report
     node tools/check-ui-contract.cjs --only=a,d run only some checks
     node tools/check-ui-contract.cjs --root=DIR check another checkout

   Exit code: 0 clean, 1 violations found, 2 could not run (postcss missing).

   Which files count:
   - "Site CSS" is every local stylesheet reachable from styles/app.css
     through @import, in cascade order. The legacy files (styles.css,
     reading.css, design-system.css) are not imported, so they are ignored:
     they are read-only reference and get deleted in Phase 3 (importing one
     is itself a violation). admin.css belongs to admin.html; only check (c)
     reads it. Any other file in styles/ that no page loads is reported.
   - "Page files" for check (a) are the ten files contract §0.4 names.
   - "Site scripts" are the local <script src> files index.html loads, in
     order, plus its inline scripts. admin.html's scripts form a second
     global scope for check (f) and share the icon sprite for check (i).
     admin-dashboard.js is admin.html's script: its markup uses admin.css
     (Tailwind), so checks (d) and (h) do not read it; check (e) reads
     every public/assets/*.js.

   Checks:
   (a) Reserved selectors, §0.4. For every rule in behavior.css, a page file
       must not declare the same property (shorthands and longhands count as
       the same, and vendor prefixes are ignored) on a selector whose LAST
       compound equals the behaviour selector's last compound. Selector lists
       are split; ::before / ::after make a different element. Two stricter
       cases count too, because they reach the same element: a last compound
       that adds to the behaviour one (a :hover state, a modifier class, a
       tag: "a.card" or ".card.shiva" outrank ".card" despite the load
       order), and one that names the same index.html element through
       another id or class ("#readerPage" for ".reader-page",
       ".updates-overlay" for ".sheet-overlay"). Last compounds with no
       class, id or type (such as "*" or "[hidden]") are compared as whole
       selectors, and a type-only behaviour compound (the "circle" of
       ".jm-bead.cur circle") only by equality. Behaviour rules inside an
       @media only clash with page rules inside the same @media. A page file
       may not redefine a behavior.css @keyframes name either.
   (b) Containing-block ban, §0.5. .header, .reader-page, .day-sheet-overlay,
       .japamala-page, .jm-stage* and #homePage (plus the ids / unique tag
       index.html gives those elements) get no transform, translate, rotate,
       scale, filter, backdrop-filter, perspective, contain, will-change,
       container(-type) or content-visibility, and no animation whose
       @keyframes animate one of those. .jm-stage* also gets no animation,
       transition or display (§3, §7). Reset values (none / auto / normal)
       are allowed; pseudo-elements are not the element and are skipped.
   (c) No overflow on html, :root or body in any shipped stylesheet (the
       site CSS, admin.css and anything else in styles/ except the legacy
       trio). The value "visible" is allowed.
   (d) index.html: one a[data-home-target] per target; .header-utilities
       buttons in the order search, account, updates; #practice's first two
       buttons open Japamala then Track; exactly one summary inside
       .reader-options; the last .font-btn is changeFontSize(2); jm-mode-btn
       data-mode order; one .jm-btn-count / .jm-btn-reset / .footer-feedback;
       every static <button> in #japamalaPage has data-info or stops
       propagation; no ⓘ inside a <summary> or #meaningToggle; unique ids;
       every function an inline on* handler calls (bare calls, not methods)
       is defined by a site script (top-level function/const/let/var/class or
       window.X =) or is a browser built-in. Inline handlers inside JS-built
       markup strings are checked the same way.
   (e) Every data-info key used in index.html and in string literals of
       public/assets/*.js (plus dataset.info / setAttribute('data-info') /
       showInfo calls) is a key of help.js's HELP object, every HELP key is
       used, and the set equals contract §6. Each entry has a title, body
       and gloss.
   (f) Top-level names shared by two classic scripts on the same page.
       Two declarations where one is let/const/class make the later script
       a load-time SyntaxError; let/const against window.X = leaves two
       drifting copies; function, var and window.X = silently override.
       "window.X = window.X || …" is an idempotent namespace and is ignored.
   (g) Every non-generic font-family name in the site CSS is declared by an
       @font-face that app.css imports (the @fontsource-variable Noto Telugu
       packages) or is an allowed system fallback.
   (h) Every class used in index.html, in class="…" string literals, and in
       className = / classList.add|toggle|replace(…) literals of the site
       scripts matches at least one selector in the site CSS, except the
       JS-only hooks listed in JS_ONLY_HOOKS below.
   (i) Every /icons.svg#icon-x reference (index.html, admin.html, site and
       admin scripts, CSS url()) and every icon('x') helper call names a
       <symbol id="icon-x"> in public/icons.svg.
   (j) Readable text, §0.7: no font-size (or font shorthand size) under 14px
       in the site CSS, resolving px, rem, token var()s, clamp(), min() and
       max(). text-transform and positive letter-spacing are reported as
       notes, since they must never touch Telugu.

   JS_ONLY_HOOKS: classes that exist so a script, a test or the browser can
   find an element, with nothing to style on the element itself. Each was
   checked against the scripts and tests before being listed; anything else
   without a selector is reported, even if it looks harmless, so that dead
   markup gets removed or styled deliberately:
   - grandham: the fixed <body> class; tools/verify-reader-theme.cjs requires
     it, and the new CSS deliberately does not key off it.
   - particle, big, gold: app.js createParticles() children inside
     #particles, which behavior.css hides (display: none).
   - cloud-card: admin.js marks Firestore-loaded cards with it and removes
     them with querySelectorAll('.card.cloud-card') before re-rendering.
   - hdr-search: contract §3 names the header buttons .hdr-search,
     .hdr-account and .hdr-updates, and check (d) finds them by those
     classes to hold the DOM order the e2e test clicks by position. The
     search button has no look of its own (.hdr-btn styles it).
   - jm-defs: the 0-size <svg> holding the Japamala gradients. It is styled
     inline on purpose: a stylesheet rule that hid it would break every
     gradient fill, so it must stay without a selector.
============================================================ */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const argv = process.argv.slice(2);
const rootArg = argv.find(arg => arg.startsWith('--root='));
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : path.resolve(__dirname, '..');
const abs = file => path.join(ROOT, file);

let postcss;
try {
    postcss = require('postcss');
} catch (error) {
    console.error('check-ui-contract: cannot load postcss (' + error.message + '). It is a devDependency: run npm install.');
    process.exit(2);
}

const OPT_JSON = argv.includes('--json');
const OPT_ALL = argv.includes('--all');
const onlyArg = argv.find(arg => arg.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) : null;
const MAX_LINES = 50;

const PAGE_FILES = ['layout', 'home', 'library', 'reader', 'practice', 'japamala', 'japamala-3d', 'overlays', 'components', 'base']
    .map(name => 'styles/' + name + '.css');
const HOME_TARGETS = ['homePage', 'library', 'favoritesSection', 'practice'];
const JM_MODES = ['flow', 'strand', 'full', 'rudraksha3d'];
const JS_ONLY_HOOKS = new Set(['grandham', 'particle', 'big', 'gold', 'cloud-card', 'hdr-search', 'jm-defs', 'jm-tassel-cap' /* SVG path coloured by its own fill attributes */]);
const SYSTEM_FONTS = new Set(['system-ui', '-apple-system', 'segoe ui', 'noto sans telugu', 'noto serif telugu']);
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
    'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const BROWSER_GLOBALS = new Set(['alert', 'confirm', 'prompt', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Number',
    'String', 'Boolean', 'Array', 'Object', 'Date', 'Promise', 'Error', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI',
    'decodeURI', 'fetch', 'structuredClone', 'print', 'focus', 'blur', 'scrollTo', 'open', 'close']);

/* ---------------------------------------------------------------- report */

const GROUPS = [
    ['setup', 'Inputs: files the checker cannot read or parse, and stylesheets no page loads'],
    ['a', 'Reserved selectors: page files must not re-declare behavior.css properties (§0.4)'],
    ['b', 'Containing-block ban on header, pages, day sheet, japamala stages (§0.5)'],
    ['c', 'No overflow on html / body (§0.5)'],
    ['d', 'index.html structure and inline handlers (§3, §8)'],
    ['e', 'ⓘ data-info keys match the HELP dictionary (§6)'],
    ['f', 'Global-scope collisions between classic scripts (§0.9)'],
    ['g', 'Font families are self-hosted or allowed system fallbacks'],
    ['h', 'Every class used in markup has a CSS selector'],
    ['i', 'Icon sprite references exist in public/icons.svg'],
    ['j', 'Readable text: no font-size under 14px (§0.7)'],
];
const results = new Map(GROUPS.map(([id, title]) => [id, {id, title, violations: [], notes: []}]));
const seenMessages = new Set();
function violation(group, where, message) {
    const key = group + '|' + where + '|' + message;
    if (seenMessages.has(key)) return;
    seenMessages.add(key);
    results.get(group).violations.push({where, message});
}
function note(group, where, message) {
    const key = 'note|' + group + '|' + where + '|' + message;
    if (seenMessages.has(key)) return;
    seenMessages.add(key);
    results.get(group).notes.push({where, message});
}
const wanted = group => !ONLY || ONLY.has(group);

/* ---------------------------------------------------------------- files */

function readText(file, {required = true} = {}) {
    try {
        return fs.readFileSync(abs(file), 'utf8').replace(/^\uFEFF/, '');
    } catch (error) {
        if (required) violation('setup', file, 'cannot read (' + (error.code || error.message) + ')');
        return null;
    }
}
const exists = file => fs.existsSync(abs(file));
const posixJoin = (...parts) => path.posix.normalize(path.posix.join(...parts));

/* ---------------------------------------------------------------- CSS model */

const cssCache = new Map();
function loadCss(file) {
    if (cssCache.has(file)) return cssCache.get(file);
    const text = readText(file);
    let root = null;
    if (text != null) {
        try {
            root = postcss.parse(text, {from: abs(file)});
        } catch (error) {
            violation('setup', file + ':' + (error.line || '?'), 'CSS parse error: ' + (error.reason || error.message));
        }
    }
    const entry = {file, text, root};
    cssCache.set(file, entry);
    return entry;
}
const lineOf = node => (node && node.source && node.source.start ? node.source.start.line : '?');
const stripCssComments = text => String(text).replace(/\/\*[\s\S]*?\*\//g, '');

function importSpec(params) {
    const match = params.match(/^\s*(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)"';]+))/);
    return match ? (match[1] || match[2] || match[3]) : null;
}
function resolvePackageCss(spec) {
    const parts = spec.split('/');
    const scoped = spec.startsWith('@');
    const name = parts.slice(0, scoped ? 2 : 1).join('/');
    const sub = parts.slice(scoped ? 2 : 1).join('/');
    const dir = posixJoin('node_modules', name);
    if (!exists(dir)) return {missing: true, file: dir};
    if (sub) return {file: posixJoin(dir, path.posix.extname(sub) ? sub : sub + '.css')};
    let entry = 'index.css';
    try {
        const pkg = JSON.parse(fs.readFileSync(abs(posixJoin(dir, 'package.json')), 'utf8'));
        const dot = pkg.exports && (typeof pkg.exports === 'string' ? pkg.exports : pkg.exports['.']);
        entry = (typeof dot === 'string' ? dot : dot && (dot.style || dot.default)) || pkg.style || pkg.main || entry;
    } catch { /* keep index.css */ }
    return {file: posixJoin(dir, entry)};
}

/* Walk styles/app.css's @import graph. Post-order = cascade order. */
const siteCss = [];
const packageCss = [];
(function walk(file, seen) {
    if (seen.has(file)) return;
    seen.add(file);
    const entry = loadCss(file);
    if (!entry.root) return;
    entry.root.walkAtRules('import', atRule => {
        const where = file + ':' + lineOf(atRule);
        const spec = importSpec(atRule.params);
        if (!spec) return violation('setup', where, 'unreadable @import ' + atRule.params);
        if (/^(?:[a-z]+:)?\/\//i.test(spec)) return note('setup', where, 'remote @import is not checked: ' + spec);
        const relative = spec.startsWith('/') ? spec.slice(1) : posixJoin(path.posix.dirname(file), spec);
        /* A bare "x.css" is relative too when that file exists next to the importer. */
        if (spec.startsWith('.') || spec.startsWith('/') || (!spec.startsWith('@') && /\.css$/i.test(spec) && exists(relative))) {
            if (!exists(relative)) return violation('setup', where, '@import target does not exist: ' + spec);
            return walk(relative, seen);
        }
        const pkg = resolvePackageCss(spec);
        if (pkg.missing) return violation('setup', where, 'package ' + spec + ' is not installed (run npm install)');
        if (!exists(pkg.file)) return violation('setup', where, '@import ' + spec + ' resolves to a missing file ' + pkg.file);
        if (!packageCss.includes(pkg.file)) packageCss.push(pkg.file);
    });
    siteCss.push(file);
})('styles/app.css', new Set());

/* Selector helpers ------------------------------------------------------ */

function scanTopLevel(text, onChar) {
    let depth = 0;
    let quote = null;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === '\\') i++;
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === '\\') { i++; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (depth === 0) onChar(ch, i);
    }
}
function splitList(text) {
    const out = [];
    let from = 0;
    scanTopLevel(text, (ch, i) => {
        if (ch === ',') { out.push(text.slice(from, i)); from = i + 1; }
    });
    out.push(text.slice(from));
    return out.map(s => s.trim()).filter(Boolean);
}
/* "a > b c" -> [{comb:'', text:'a'}, {comb:'>', text:'b'}, {comb:' ', text:'c'}] */
function splitCompounds(selector) {
    const pieces = [];
    let from = 0;
    const cut = end => {
        const text = selector.slice(from, end);
        if (text) pieces.push({text});
    };
    scanTopLevel(selector, (ch, i) => {
        if (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~') {
            cut(i);
            if (ch !== ' ' && !/\s/.test(ch)) pieces.push({comb: ch});
            from = i + 1;
        }
    });
    cut(selector.length);
    const out = [];
    let pending = null;
    for (const piece of pieces) {
        if (piece.comb) { pending = piece.comb; continue; }
        out.push({comb: out.length ? (pending || ' ') : '', text: piece.text});
        pending = null;
    }
    return out;
}
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const SELECTOR_PSEUDOS = new Set(['not', 'is', 'where', 'has', 'matches', '-webkit-any', '-moz-any']);
const USER_STATES = new Set(['hover', 'active', 'focus', 'focus-visible', 'focus-within']);

function parseCompound(text) {
    const out = {type: null, ids: [], classes: [], attrs: [], pseudos: [], pseudoElement: null};
    let i = 0;
    const ident = () => {
        let s = '';
        while (i < text.length) {
            const ch = text[i];
            if (ch === '\\') { s += text[i + 1] || ''; i += 2; continue; }
            if (/[\w-]/.test(ch) || ch.charCodeAt(0) > 127) { s += ch; i++; } else break;
        }
        return s;
    };
    const balanced = (open, close) => {
        let depth = 0;
        let quote = null;
        const start = i;
        for (; i < text.length; i++) {
            const ch = text[i];
            if (quote) {
                if (ch === '\\') i++;
                else if (ch === quote) quote = null;
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; continue; }
            if (ch === open) depth++;
            else if (ch === close && --depth === 0) { i++; break; }
        }
        return text.slice(start, i);
    };
    while (i < text.length) {
        const ch = text[i];
        if (ch === '*') { out.type = '*'; i++; }
        else if (ch === '&') { out.nesting = true; i++; }
        else if (ch === '#') { i++; out.ids.push(ident()); }
        else if (ch === '.') { i++; out.classes.push(ident()); }
        else if (ch === '[') out.attrs.push(normalizeAttr(balanced('[', ']')));
        else if (ch === ':') {
            const isElement = text[i + 1] === ':';
            i += isElement ? 2 : 1;
            const name = ident().toLowerCase();
            const arg = text[i] === '(' ? balanced('(', ')') : '';
            if (isElement || LEGACY_PSEUDO_ELEMENTS.has(name)) out.pseudoElement = '::' + name + arg.replace(/\s+/g, '');
            else out.pseudos.push({name, arg});
        } else if (/[\w-]/.test(ch) || ch === '\\' || ch.charCodeAt(0) > 127) out.type = ident().toLowerCase();
        else i++;
    }
    return out;
}
function normalizeAttr(raw) {
    const inner = raw.slice(1, -1).trim();
    const match = inner.match(/^([^\s~|^$*!=]+)\s*(?:([~|^$*]?=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s\]]+))\s*([iIsS])?)?$/);
    if (!match) return '[' + inner.replace(/\s+/g, '') + ']';
    const name = match[1].toLowerCase();
    if (!match[2]) return '[' + name + ']';
    const value = match[3] ?? match[4] ?? match[5];
    return '[' + name + match[2] + '"' + value + '"' + (match[6] ? ' ' + match[6].toLowerCase() : '') + ']';
}
function normalizeSelector(selector) {
    return splitCompounds(selector).map(c => (c.comb && c.comb !== ' ' ? ' ' + c.comb + ' ' : c.comb) + compoundKey(parseCompound(c.text))).join('');
}
function pseudoKey(ps) {
    if (!ps.arg) return ':' + ps.name;
    const inner = ps.arg.slice(1, -1);
    return ':' + ps.name + '(' + (SELECTOR_PSEUDOS.has(ps.name) ? splitList(inner).map(normalizeSelector).sort().join(',') : inner.replace(/\s+/g, '')) + ')';
}
function compoundKey(p) {
    const pseudos = p.pseudos.map(pseudoKey).sort();
    const others = p.ids.length || p.classes.length || p.attrs.length || pseudos.length;
    const type = p.type && p.type !== '*' ? p.type : (others ? '' : '*');
    return type + p.ids.map(x => '#' + x).sort().join('') + p.classes.map(x => '.' + x).sort().join('')
        + [...p.attrs].sort().join('') + pseudos.join('') + (p.pseudoElement || '');
}
/* The simple selectors of a compound as comparable strings: type, #ids, .classes, [attrs], :pseudo-classes. */
function simpleParts(p) {
    const parts = new Set();
    if (p.type && p.type !== '*') parts.add(p.type);
    for (const id of p.ids) parts.add('#' + id);
    for (const cls of p.classes) parts.add('.' + cls);
    for (const attr of p.attrs) parts.add(attr);
    for (const ps of p.pseudos) parts.add(pseudoKey(ps));
    return parts;
}
const isGeneric = p => !p.ids.length && !p.classes.length && (!p.type || p.type === '*');

function inKeyframes(node) {
    for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
    return false;
}
/* Resolve CSS nesting (& or implicit descendant) into full selectors. */
function ruleSelectors(rule) {
    const own = splitList(stripCssComments(rule.selector));
    let parent = rule.parent;
    while (parent && parent.type === 'atrule') parent = parent.parent;
    if (!parent || parent.type !== 'rule') return own;
    const outer = ruleSelectors(parent);
    const out = [];
    for (const sel of own) for (const up of outer) out.push(sel.includes('&') ? sel.replace(/&/g, up) : up + ' ' + sel);
    return out;
}
function atChain(node) {
    const chain = [];
    for (let p = node.parent; p; p = p.parent) {
        if (p.type === 'atrule' && /^(media|supports|container|layer)$/i.test(p.name)) {
            chain.unshift('@' + p.name.toLowerCase() + ' ' + p.params.replace(/\s+/g, ' ').replace(/\s*:\s*/g, ': ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim().toLowerCase());
        }
    }
    return chain;
}
const normProp = prop => prop.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, '');
const cleanValue = value => String(value).replace(/!\s*important\s*$/i, '').trim().toLowerCase();

/* Every style rule of a file, flattened: {file, line, selectors, chain, decls}. */
function cssRules(file) {
    const entry = loadCss(file);
    const rules = [];
    if (!entry.root) return rules;
    entry.root.walkRules(rule => {
        if (inKeyframes(rule)) return;
        const decls = [];
        rule.each(node => {
            if (node.type === 'decl' && !node.prop.startsWith('--')) {
                decls.push({prop: normProp(node.prop), raw: node.prop, value: node.value, line: lineOf(node)});
            }
        });
        rules.push({file, line: lineOf(rule), selectors: ruleSelectors(rule), chain: atChain(rule), decls, rule});
    });
    return rules;
}
function keyframesIn(file) {
    const out = [];
    const entry = loadCss(file);
    if (!entry.root) return out;
    entry.root.walkAtRules(/keyframes$/i, atRule => {
        const props = new Set();
        atRule.walkDecls(decl => props.add(normProp(decl.prop)));
        out.push({name: atRule.params.trim().replace(/^["']|["']$/g, ''), file, line: lineOf(atRule), props});
    });
    return out;
}

/* Shorthand <-> longhand relations, so "overflow" clashes with "overflow-x". */
const SIDES = ['top', 'right', 'bottom', 'left'];
const LOGICAL = ['block', 'inline', 'block-start', 'block-end', 'inline-start', 'inline-end'];
const SHORTHANDS = {
    margin: [...SIDES, ...LOGICAL].map(s => 'margin-' + s),
    padding: [...SIDES, ...LOGICAL].map(s => 'padding-' + s),
    inset: [...SIDES, ...LOGICAL.map(s => 'inset-' + s)],
    overflow: ['overflow-x', 'overflow-y', 'overflow-block', 'overflow-inline'],
    animation: ['name', 'duration', 'timing-function', 'delay', 'iteration-count', 'direction', 'fill-mode', 'play-state', 'timeline', 'composition', 'range'].map(s => 'animation-' + s),
    transition: ['property', 'duration', 'timing-function', 'delay', 'behavior'].map(s => 'transition-' + s),
    background: ['color', 'image', 'position', 'position-x', 'position-y', 'size', 'repeat', 'attachment', 'origin', 'clip'].map(s => 'background-' + s),
    flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
    'flex-flow': ['flex-direction', 'flex-wrap'],
    gap: ['row-gap', 'column-gap', 'grid-gap', 'grid-row-gap', 'grid-column-gap'],
    font: ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'line-height'],
    'place-items': ['align-items', 'justify-items'],
    'place-content': ['align-content', 'justify-content'],
    'place-self': ['align-self', 'justify-self'],
    'scroll-margin': [...SIDES, ...LOGICAL].map(s => 'scroll-margin-' + s),
    'scroll-padding': [...SIDES, ...LOGICAL].map(s => 'scroll-padding-' + s),
    border: ['border-width', 'border-style', 'border-color', ...SIDES.flatMap(s => ['border-' + s, 'border-' + s + '-width', 'border-' + s + '-style', 'border-' + s + '-color'])],
    'border-color': SIDES.map(s => 'border-' + s + '-color'),
    'border-width': SIDES.map(s => 'border-' + s + '-width'),
    'border-style': SIDES.map(s => 'border-' + s + '-style'),
    ...Object.fromEntries(SIDES.map(s => ['border-' + s, ['width', 'style', 'color'].map(k => 'border-' + s + '-' + k)])),
    'border-radius': ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(s => 'border-' + s + '-radius'),
    outline: ['outline-width', 'outline-style', 'outline-color'],
    grid: ['grid-template', 'grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow'],
    'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],
    'text-decoration': ['text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness'],
    transform: ['translate', 'rotate', 'scale'],
    container: ['container-name', 'container-type'],
    mask: ['mask-image', 'mask-position', 'mask-size', 'mask-repeat', 'mask-origin', 'mask-clip', 'mask-mode', 'mask-composite'],
};
const coverCache = new Map();
function covers(prop) {
    if (coverCache.has(prop)) return coverCache.get(prop);
    const set = new Set([prop]);
    for (const [short, longs] of Object.entries(SHORTHANDS)) {
        if (short === prop) longs.forEach(l => set.add(l));
        if (longs.includes(prop)) set.add(short);
    }
    coverCache.set(prop, set);
    return set;
}
const propsClash = (a, b) => a === b || covers(a).has(b) || covers(b).has(a);

/* ---------------------------------------------------------------- HTML model */

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TAGS = new Set(['script', 'style', 'textarea', 'title']);
function decodeEntities(value) {
    return value.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g, (m, name) => ({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'"}[name]));
}
function lineIndex(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return offset => {
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
        }
        return lo + 1;
    };
}
function parseHtml(text) {
    const lineAt = lineIndex(text);
    const root = {tag: '#root', attrs: {}, classes: [], children: [], parent: null, line: 0};
    const all = [];
    let current = root;
    const tagRe = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
    let match;
    while ((match = tagRe.exec(text))) {
        if (match[0].startsWith('<!')) continue;
        if (match[1]) {
            const tag = match[1].toLowerCase();
            let node = current;
            while (node !== root && node.tag !== tag) node = node.parent;
            if (node !== root) current = node.parent;
            continue;
        }
        const tag = match[2].toLowerCase();
        const attrs = {};
        for (const a of match[3].matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
            attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
        }
        const el = {tag, attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean), children: [], parent: current, line: lineAt(match.index)};
        current.children.push(el);
        all.push(el);
        if (RAW_TAGS.has(tag)) {
            const close = new RegExp('</' + tag + '\\s*>', 'ig');
            close.lastIndex = tagRe.lastIndex;
            const end = close.exec(text);
            el.text = text.slice(tagRe.lastIndex, end ? end.index : text.length);
            el.textLine = lineAt(tagRe.lastIndex);
            tagRe.lastIndex = end ? close.lastIndex : text.length;
            continue;
        }
        if (!VOID_TAGS.has(tag) && !match[4]) current = el;
    }
    return {root, all};
}
function descendants(el) {
    const out = [];
    (function walk(node) {
        for (const child of node.children) { out.push(child); walk(child); }
    })(el);
    return out;
}
function insideTag(el, tag) {
    for (let p = el.parent; p; p = p.parent) if (p.tag === tag) return true;
    return false;
}
const hasClass = (el, cls) => el.classes.includes(cls);
const where = (file, line) => file + ':' + line;

/* ---------------------------------------------------------------- JS model */

const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'with', 'new', 'void', 'delete',
    'await', 'yield', 'do', 'else', 'try', 'finally', 'throw', 'case', 'in', 'of', 'instanceof', 'var', 'let', 'const', 'class',
    'super', 'this', 'import', 'export', 'default', 'break', 'continue', 'async', 'static', 'get', 'set']);
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const STATEMENT_WORDS = new Set(['const', 'let', 'var', 'function', 'class', 'if', 'for', 'while', 'return', 'switch', 'try', 'do', 'throw']);
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
    '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const UNESCAPE = {n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '', '\r': ''};

/* Tolerant tokenizer: strings, template pieces, regex literals, identifiers,
   numbers and punctuators, each with its line, offsets and bracket depth. */
function tokenizeJs(source) {
    const src = source.replace(/^\uFEFF/, '');
    const toks = [];
    const stack = [];
    const n = src.length;
    let i = 0;
    let line = 1;
    let prev = null;
    const push = (t, v, s, extra) => {
        const tok = Object.assign({t, v, s, e: i, line, depth: stack.length}, extra);
        toks.push(tok);
        prev = tok;
        return tok;
    };
    const regexAllowed = () => {
        if (!prev) return true;
        if (prev.t === 'id') return REGEX_AFTER_WORD.has(prev.v);
        if (prev.t === 'p') return !(prev.v === ')' || prev.v === ']' || prev.v === '++' || prev.v === '--');
        return false;
    };
    const readTemplate = afterExpr => {
        const s = i;
        const startLine = line;
        let v = '';
        while (i < n) {
            const ch = src[i];
            if (ch === '\\') {
                const next = src[i + 1];
                v += UNESCAPE[next] ?? next ?? '';
                if (next === '\n') line++;
                i += 2;
                continue;
            }
            if (ch === '`') { i++; return Object.assign(push('tpl', v, s, {afterExpr, beforeExpr: false}), {line: startLine}); }
            if (ch === '$' && src[i + 1] === '{') {
                i += 2;
                const tok = Object.assign(push('tpl', v, s, {afterExpr, beforeExpr: true}), {line: startLine});
                stack.push('${');
                return tok;
            }
            if (ch === '\n') line++;
            v += ch;
            i++;
        }
        return Object.assign(push('tpl', v, s, {afterExpr, beforeExpr: false}), {line: startLine});
    };
    while (i < n) {
        const ch = src[i];
        if (ch === '\n') { line++; i++; continue; }
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (ch === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end < 0 ? n : end + 2;
            for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
            i = stop;
            continue;
        }
        const s = i;
        if (ch === '"' || ch === "'") {
            i++;
            let v = '';
            while (i < n && src[i] !== ch && src[i] !== '\n') {
                if (src[i] === '\\') {
                    const next = src[i + 1];
                    v += UNESCAPE[next] ?? next ?? '';
                    if (next === '\n') line++;
                    i += 2;
                    continue;
                }
                v += src[i++];
            }
            if (src[i] === ch) i++;
            push('str', v, s);
            continue;
        }
        if (ch === '`') { i++; readTemplate(false); continue; }
        if (ch === '}' && stack[stack.length - 1] === '${') { stack.pop(); i++; readTemplate(true); continue; }
        if (/[A-Za-z_$]/.test(ch) || ch.charCodeAt(0) > 127) {
            let j = i + 1;
            while (j < n && (/[\w$]/.test(src[j]) || src.charCodeAt(j) > 127)) j++;
            const v = src.slice(i, j);
            i = j;
            push('id', v, s);
            continue;
        }
        if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || ''))) {
            let j = i + 1;
            while (j < n && /[\w.]/.test(src[j])) j++;
            const v = src.slice(i, j);
            i = j;
            push('num', v, s);
            continue;
        }
        if (ch === '/' && regexAllowed()) {
            let j = i + 1;
            let inClass = false;
            while (j < n && src[j] !== '\n') {
                const c = src[j];
                if (c === '\\') { j += 2; continue; }
                if (inClass) { if (c === ']') inClass = false; }
                else if (c === '[') inClass = true;
                else if (c === '/') break;
                j++;
            }
            j++;
            while (j < n && /[a-z]/i.test(src[j])) j++;
            const v = src.slice(i, j);
            i = j;
            push('re', v, s);
            continue;
        }
        let p = PUNCT.find(op => src.startsWith(op, i)) || ch;
        if (p === '?.' && /\d/.test(src[i + 2] || '')) p = '?';
        if (p === '{' || p === '(' || p === '[') { i++; push('p', p, s); stack.push(p); continue; }
        if (p === '}' || p === ')' || p === ']') { stack.pop(); i++; push('p', p, s); continue; }
        i += p.length;
        push('p', p, s);
    }
    return toks;
}
const isMember = tok => tok && tok.t === 'p' && (tok.v === '.' || tok.v === '?.');

function statementStart(toks, k) {
    const prev = toks[k - 1];
    if (!prev) return true;
    if (prev.t === 'p' && (prev.v === ';' || prev.v === '}' || prev.v === '{')) return true;
    if (prev.line < toks[k].line) {
        if (prev.t === 'p') return prev.v === ')' || prev.v === ']' || prev.v === '++' || prev.v === '--';
        return !(prev.t === 'id' && (JS_KEYWORDS.has(prev.v) && !['this', 'super'].includes(prev.v)));
    }
    return false;
}
/* Top-level bindings of a classic script (shared global scope). */
function topLevelNames(toks) {
    const names = [];
    for (let k = 0; k < toks.length; k++) {
        const tok = toks[k];
        if (tok.t !== 'id' || tok.depth !== 0 || isMember(toks[k - 1])) continue;
        if (tok.v === 'function' || tok.v === 'class') {
            const start = tok.v === 'function' && toks[k - 1] && toks[k - 1].t === 'id' && toks[k - 1].v === 'async' ? k - 1 : k;
            if (!statementStart(toks, start)) continue;
            let j = k + 1;
            if (toks[j] && toks[j].v === '*') j++;
            if (toks[j] && toks[j].t === 'id') names.push({name: toks[j].v, kind: tok.v, line: toks[j].line});
            continue;
        }
        if (!['const', 'let', 'var'].includes(tok.v) || !statementStart(toks, k)) continue;
        let j = k + 1;
        let done = false;
        while (!done && j < toks.length) {
            const d = toks[j];
            if (d.t === 'id') names.push({name: d.v, kind: tok.v, line: d.line});
            else if (d.t === 'p' && (d.v === '{' || d.v === '[')) {
                for (let m = j + 1; m < toks.length && toks[m].depth > 0; m++) {
                    const x = toks[m];
                    const after = toks[m + 1];
                    if (x.t === 'id' && x.depth === 1 && !isMember(toks[m - 1]) && after && [',', '}', ']', '='].includes(after.v)) {
                        names.push({name: x.v, kind: tok.v, line: x.line});
                    }
                }
            }
            j++;
            while (j < toks.length) {
                const x = toks[j];
                if (x.depth === 0 && x.t === 'p' && x.v === ';') { done = true; break; }
                if (x.depth === 0 && x.t === 'p' && x.v === ',') { j++; break; }
                if (x.depth === 0 && x.t === 'id' && STATEMENT_WORDS.has(x.v) && toks[j - 1].line < x.line) { done = true; break; }
                j++;
            }
            if (j >= toks.length) done = true;
        }
    }
    return names;
}
/* window.X = … (not the idempotent "window.X = window.X || …"). */
function windowAssignments(toks) {
    const out = [];
    for (let k = 0; k + 3 < toks.length; k++) {
        const tok = toks[k];
        if (tok.t !== 'id' || !['window', 'globalThis', 'self'].includes(tok.v) || isMember(toks[k - 1])) continue;
        if (toks[k + 1].v !== '.' || toks[k + 2].t !== 'id') continue;
        const op = toks[k + 3];
        if (op.t !== 'p' || op.v !== '=') continue;   /* ||= and ??= are idempotent */
        const name = toks[k + 2].v;
        const r = toks.slice(k + 4, k + 8);
        const idempotent = r.length >= 4 && r[0].v === tok.v && r[1].v === '.' && r[2].v === name && ['||', '??'].includes(r[3].v);
        out.push({name, kind: 'window.' + name + ' =', line: toks[k + 2].line, idempotent});
    }
    return out;
}
function bareCalls(code) {
    const toks = tokenizeJs(code);
    const optional = new Set();
    toks.forEach((tok, k) => {
        if (tok.t === 'id' && tok.v === 'typeof' && toks[k + 1] && toks[k + 1].t === 'id') optional.add(toks[k + 1].v);
    });
    const calls = [];
    toks.forEach((tok, k) => {
        if (tok.t !== 'id' || JS_KEYWORDS.has(tok.v) || optional.has(tok.v)) return;
        const next = toks[k + 1];
        const prev = toks[k - 1];
        if (!next || next.v !== '(' || isMember(prev)) return;
        if (prev && prev.t === 'id' && prev.v === 'function') return;
        calls.push(tok.v);
    });
    return calls;
}
const literals = toks => toks.filter(tok => tok.t === 'str' || tok.t === 'tpl');
/* A literal that is (part of) HTML markup, not a log message or selector. */
const looksLikeMarkup = text => text.includes('<') || /^\s+[\w-]+\s*=/.test(text);
const SPRITE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ---------------------------------------------------------------- inputs */

const indexHtmlText = readText('index.html');
const adminHtmlText = readText('admin.html', {required: false});
const indexDoc = indexHtmlText != null ? parseHtml(indexHtmlText) : {root: {children: []}, all: []};
const adminDoc = adminHtmlText != null ? parseHtml(adminHtmlText) : {root: {children: []}, all: []};

function pageScripts(doc, htmlFile) {
    const out = [];
    let inline = 0;
    for (const el of doc.all) {
        if (el.tag !== 'script') continue;
        const src = el.attrs.src;
        if (src) {
            if (/^(?:[a-z]+:)?\/\//i.test(src)) continue;
            const file = 'public/' + src.replace(/^\//, '').replace(/[?#].*$/, '');
            const text = readText(file);
            if (text == null) continue;
            out.push({file, text, toks: tokenizeJs(text)});
        } else if (el.text && el.text.trim() && !/json|template|module/i.test(el.attrs.type || '')) {
            inline++;
            out.push({file: htmlFile + ' <script> #' + inline, text: el.text, toks: tokenizeJs(el.text), lineOffset: el.textLine - 1});
        }
    }
    return out;
}
const indexScripts = pageScripts(indexDoc, 'index.html');
const adminScripts = pageScripts(adminDoc, 'admin.html');
const jsLine = (script, line) => script.file + ':' + (line + (script.lineOffset || 0));

/* Every public/assets/*.js, whichever page loads it (check (e) reads them all). */
const listDir = (dir, ext) => (exists(dir) ? fs.readdirSync(abs(dir)).filter(name => name.endsWith(ext)).sort().map(name => dir + '/' + name) : []);
const loadedScripts = new Set([...indexScripts, ...adminScripts].map(s => s.file));
const allAssetScripts = listDir('public/assets', '.js').map(file => {
    const known = [...indexScripts, ...adminScripts].find(s => s.file === file);
    if (known) return known;
    const text = readText(file);
    return text == null ? null : {file, text, toks: tokenizeJs(text)};
}).filter(Boolean);
for (const script of allAssetScripts) {
    if (!loadedScripts.has(script.file)) note('setup', script.file, 'loaded by neither index.html nor admin.html, so only check (e) reads it');
}

/* Every stylesheet in styles/: the ones app.css imports, admin.html's own, the legacy trio and anything else. */
const LEGACY_CSS = new Set(['styles/styles.css', 'styles/reading.css', 'styles/design-system.css']);
const adminCss = adminDoc.all
    .filter(el => el.tag === 'link' && /\bstylesheet\b/i.test(el.attrs.rel || '') && el.attrs.href && !/^(?:[a-z]+:)?\/\//i.test(el.attrs.href))
    .map(el => el.attrs.href.replace(/^\//, '').replace(/[?#].*$/, ''));
const stylesheets = listDir('styles', '.css');
for (const file of siteCss) if (LEGACY_CSS.has(file)) violation('setup', file, 'legacy stylesheet is imported; it is read-only reference and must not load (contract §0.8)');
for (const file of stylesheets) {
    if (!siteCss.includes(file) && !adminCss.includes(file) && !LEGACY_CSS.has(file)) {
        violation('setup', file, 'no page loads this stylesheet: add it to styles/app.css in cascade order, or delete it');
    }
}
/* Check (c) reads every shipped stylesheet; the legacy files never load and are deleted in Phase 3. */
const shippedCss = [...new Set([...siteCss, ...adminCss.filter(exists), ...stylesheets.filter(file => !LEGACY_CSS.has(file))])];

function globalDefinitions(scripts) {
    const defs = new Map();
    for (const script of scripts) {
        for (const d of [...topLevelNames(script.toks), ...windowAssignments(script.toks)]) {
            if (d.idempotent) continue;
            if (!defs.has(d.name)) defs.set(d.name, []);
            defs.get(d.name).push({file: script.file, kind: d.kind, line: jsLine(script, d.line)});
        }
    }
    return defs;
}
const indexGlobals = globalDefinitions(indexScripts);
const siteScriptFiles = indexScripts.filter(s => s.file.startsWith('public/assets/'));

/* ---------------------------------------------------------------- (a) reserved selectors */

const BEHAVIOR = 'styles/behavior.css';
/* index.html's static elements by id and by class, so a selector can be tied to the element it names. */
function elementIndex() {
    const byId = new Map();
    const byClass = new Map();
    for (const el of indexDoc.all) {
        if (el.attrs.id && !byId.has(el.attrs.id)) byId.set(el.attrs.id, el);
        for (const cls of el.classes) {
            if (!byClass.has(cls)) byClass.set(cls, []);
            byClass.get(cls).push(el);
        }
    }
    return {byId, byClass};
}
const elements = elementIndex();
/* The simple selectors a page compound certainly carries: its own, plus the
   tag, id and static classes of the index.html element it names, when it
   names exactly one (by id, or by a class that sits on one element only).
   So "#readerPage" also carries ".reader-page", and ".updates-overlay" also
   carries ".sheet-overlay" and "#updatesOverlay". */
function elementParts(p) {
    const parts = simpleParts(p);
    const named = new Set();
    for (const id of p.ids) if (elements.byId.has(id)) named.add(elements.byId.get(id));
    for (const cls of p.classes) {
        const list = elements.byClass.get(cls) || [];
        if (list.length === 1) named.add(list[0]);
    }
    for (const el of named) {
        if (p.type && p.type !== '*' && p.type !== el.tag) continue;
        if (p.ids.some(id => id !== el.attrs.id)) continue;
        parts.add(el.tag);
        if (el.attrs.id) parts.add('#' + el.attrs.id);
        for (const cls of el.classes) parts.add('.' + cls);
    }
    return parts;
}
function selectorInfo(selector) {
    const compounds = splitCompounds(selector);
    if (!compounds.length) return null;
    const last = parseCompound(compounds[compounds.length - 1].text);
    return {
        selector,
        last,
        key: compoundKey(last),
        parts: simpleParts(last),
        generic: isGeneric(last),
        identified: last.ids.length > 0 || last.classes.length > 0,
        full: normalizeSelector(selector),
    };
}
/* How page selector `info` reaches the element behaviour selector `b` owns, or null.
   - A last compound with no class, id or type ("*", "[hidden]", "[data-panel]:not(…)")
     on either side: only the identical whole selector counts.
   - A type-only behaviour compound (the "circle" of ".jm-bead.cur circle"): only an
     identical last compound counts, as §0.4 words it; the ancestors pick the element.
   - Otherwise the page compound clashes when it carries every simple selector of the
     behaviour compound: identical, or more specific (a state, a modifier class, a tag),
     which outranks behavior.css despite the load order, or it names the same
     index.html element through another id or class. */
function reachesReserved(info, b) {
    if (b.generic || info.generic) return info.full === b.full ? 'same selector' : null;
    if (info.last.pseudoElement !== b.last.pseudoElement) return null;
    if (info.key === b.key) return 'same last compound';
    if (!b.identified) return null;
    const own = info.parts;
    if ([...b.parts].every(part => own.has(part))) {
        const extra = [...own].filter(part => !b.parts.has(part));
        if (!extra.length) return 'same last compound';
        return extra.every(part => USER_STATES.has(part.replace(/^:/, '')))
            ? 'same element in a ' + extra.join('') + ' state'
            : 'more specific compound on the same element (adds ' + extra.join('') + '), which outranks behavior.css';
    }
    const named = elementParts(info.last);
    if ([...b.parts].every(part => named.has(part))) {
        return 'same element: in index.html the tag `' + compoundKey(info.last) + '` names also carries ' + [...b.parts].filter(part => !own.has(part)).join('');
    }
    return null;
}

if (wanted('a')) {
    const reserved = [];
    for (const rule of cssRules(BEHAVIOR)) {
        if (!rule.decls.length) continue;
        for (const selector of rule.selectors) {
            const info = selectorInfo(selector);
            if (info) reserved.push({...info, chain: rule.chain, props: rule.decls.map(d => d.prop), line: rule.line});
        }
    }
    const reservedKeyframes = new Map(keyframesIn(BEHAVIOR).map(k => [k.name, k]));
    const reported = new Set();   /* one line per page declaration, even if several behaviour rules own the property */
    for (const file of PAGE_FILES) {
        if (!exists(file)) { violation('setup', file, 'page file is missing'); continue; }
        for (const rule of cssRules(file)) {
            for (const selector of rule.selectors) {
                const info = selectorInfo(selector);
                if (!info) continue;
                for (const b of reserved) {
                    /* A behaviour rule inside @media print / reduced-motion only reserves the property there. */
                    if (!b.chain.every(c => rule.chain.includes(c))) continue;
                    const how = reachesReserved(info, b);
                    if (!how) continue;
                    for (const decl of rule.decls) {
                        const clash = b.props.find(bp => propsClash(decl.prop, bp));
                        const once = file + ':' + decl.line + ':' + decl.raw + ':' + selector;
                        if (!clash || reported.has(once)) continue;
                        reported.add(once);
                        violation('a', where(file, decl.line), '`' + selector + '` sets ' + decl.raw + ', but ' + BEHAVIOR + ':' + b.line
                            + ' `' + b.selector + '` owns ' + clash + (b.chain.length ? ' in ' + b.chain.join(' ') : '') + ' (' + how + ')');
                    }
                }
            }
        }
        for (const kf of keyframesIn(file)) {
            const owner = reservedKeyframes.get(kf.name);
            if (owner) violation('a', where(file, kf.line), '@keyframes ' + kf.name + ' redefines the behavior.css animation at ' + BEHAVIOR + ':' + owner.line);
        }
    }
}

/* ---------------------------------------------------------------- (b) containing-block ban */

const CB_RESETS = new Map([['transform', 'none'], ['translate', 'none'], ['rotate', 'none'], ['scale', 'none'], ['filter', 'none'],
    ['backdrop-filter', 'none'], ['perspective', 'none'], ['contain', 'none'], ['will-change', 'auto'], ['container', 'none'],
    ['container-type', 'normal'], ['content-visibility', 'visible']]);
const MOTION_RESETS = new Set(['none', '0s', '0ms', 'initial', 'unset']);
const ANIMATION_WORDS = new Set(['none', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end', 'infinite',
    'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards', 'both', 'running', 'paused', 'initial', 'inherit', 'unset']);
function animationNames(value) {
    const names = [];
    for (const layer of splitList(value)) {
        const words = [];
        let from = 0;
        scanTopLevel(layer, (ch, i) => { if (/\s/.test(ch)) { words.push(layer.slice(from, i)); from = i + 1; } });
        words.push(layer.slice(from));
        for (const word of words.map(w => w.trim()).filter(Boolean)) {
            if (ANIMATION_WORDS.has(word.toLowerCase()) || /\(/.test(word) || /^-?[\d.]+(m?s)?$/i.test(word)) continue;
            names.push(word.replace(/^["']|["']$/g, ''));
        }
    }
    return names;
}
function cbTargets() {
    const tagCounts = new Map();
    for (const el of indexDoc.all) tagCounts.set(el.tag, (tagCounts.get(el.tag) || 0) + 1);
    const make = (label, classTest, idList, motion) => {
        const ids = new Set(idList);
        const types = new Set();
        for (const el of indexDoc.all) {
            if (el.classes.some(classTest) || ids.has(el.attrs.id)) {
                if (el.attrs.id) ids.add(el.attrs.id);
                if (tagCounts.get(el.tag) === 1 && !['div', 'span', 'section', 'nav', 'main'].includes(el.tag)) types.add(el.tag);
            }
        }
        return {label, motion, test: p => p.classes.some(classTest) || p.ids.some(id => ids.has(id)) || Boolean(p.type && types.has(p.type))};
    };
    return [
        make('.header', c => c === 'header', [], false),
        make('.reader-page', c => c === 'reader-page', [], false),
        make('.day-sheet-overlay', c => c === 'day-sheet-overlay', [], false),
        make('.japamala-page', c => c === 'japamala-page', [], false),
        make('.jm-stage*', c => c.startsWith('jm-stage'), [], true),
        make('#homePage', c => c === 'home-page', ['homePage'], false),
    ];
}
if (wanted('b')) {
    const targets = cbTargets();
    const keyframes = new Map();
    for (const file of siteCss) for (const kf of keyframesIn(file)) keyframes.set(kf.name, kf);
    for (const file of siteCss) {
        for (const rule of cssRules(file)) {
            for (const selector of rule.selectors) {
                const info = selectorInfo(selector);
                if (!info || info.last.pseudoElement) continue;
                for (const target of targets.filter(t => t.test(info.last))) {
                    for (const decl of rule.decls) {
                        const value = cleanValue(decl.value);
                        const at = where(file, decl.line);
                        if (CB_RESETS.has(decl.prop) && value !== CB_RESETS.get(decl.prop)) {
                            violation('b', at, '`' + selector + '` sets ' + decl.raw + ': ' + decl.value + ' on ' + target.label + ' (creates a containing block / stacking trap)');
                        }
                        if (target.motion && (/^(animation|transition)(-|$)/.test(decl.prop) || decl.prop === 'display') && !(decl.prop !== 'display' && MOTION_RESETS.has(value))) {
                            violation('b', at, '`' + selector + '` sets ' + decl.raw + ' on ' + target.label + ' (stages get no display, animation or transition; JS writes display inline)');
                        }
                        if (decl.prop === 'animation' || decl.prop === 'animation-name') {
                            for (const name of animationNames(decl.value)) {
                                const kf = keyframes.get(name);
                                const bad = kf && [...kf.props].filter(p => CB_RESETS.has(p));
                                if (bad && bad.length) {
                                    violation('b', at, '`' + selector + '` runs @keyframes ' + name + ' (' + where(kf.file, kf.line) + '), which animates ' + bad.join(', ') + ' on ' + target.label);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------------------------------------------------------------- (c) overflow on html/body */

if (wanted('c')) {
    for (const file of shippedCss) {
        for (const rule of cssRules(file)) {
            for (const selector of rule.selectors) {
                const info = selectorInfo(selector);
                if (!info || info.last.pseudoElement) continue;
                const p = info.last;
                const isRoot = p.type === 'html' || p.type === 'body' || p.pseudos.some(ps => ps.name === 'root');
                if (!isRoot) continue;
                for (const decl of rule.decls) {
                    if (/^overflow(-x|-y|-block|-inline)?$/.test(decl.prop) && cleanValue(decl.value) !== 'visible') {
                        violation('c', where(file, decl.line), '`' + selector + '` sets ' + decl.raw + ': ' + decl.value + ' (breaks body scroll-lock and the sticky header)');
                    }
                }
            }
        }
    }
}

/* ---------------------------------------------------------------- (d) index.html */

function inlineHandlers(el) {
    return Object.entries(el.attrs).filter(([name]) => /^on[a-z]+$/.test(name));
}
function firstCall(el) {
    const handler = el.attrs.onclick || '';
    return bareCalls(handler)[0] || null;
}
if (wanted('d') && indexHtmlText != null) {
    const H = 'index.html';
    const all = indexDoc.all;

    const targets = all.filter(el => 'data-home-target' in el.attrs);
    for (const el of targets) {
        if (el.tag !== 'a') violation('d', where(H, el.line), 'data-home-target="' + el.attrs['data-home-target'] + '" must be on an <a>, found <' + el.tag + '>');
        if (!HOME_TARGETS.includes(el.attrs['data-home-target'])) violation('d', where(H, el.line), 'unknown data-home-target "' + el.attrs['data-home-target'] + '"');
    }
    for (const target of HOME_TARGETS) {
        const count = targets.filter(el => el.attrs['data-home-target'] === target).length;
        if (count !== 1) violation('d', H, 'expected exactly one [data-home-target="' + target + '"], found ' + count);
    }

    const utilities = all.filter(el => hasClass(el, 'header-utilities'));
    if (utilities.length !== 1) violation('d', H, 'expected one .header-utilities, found ' + utilities.length);
    else {
        const buttons = descendants(utilities[0]).filter(el => el.tag === 'button');
        const order = buttons.map(b => ['hdr-search', 'hdr-account', 'hdr-updates'].find(c => hasClass(b, c)) || '?' + (b.attrs.id || b.classes.join('.')));
        if (order.join(',') !== 'hdr-search,hdr-account,hdr-updates') {
            violation('d', where(H, utilities[0].line), '.header-utilities buttons must be search, account, updates (DOM order; use CSS order), found ' + order.join(', '));
        }
        const updates = buttons.find(b => hasClass(b, 'hdr-updates'));
        if (updates && updates.attrs.id !== 'updatesBtn') violation('d', where(H, updates.line), '.hdr-updates must be #updatesBtn');
    }

    const practice = all.find(el => el.attrs.id === 'practice');
    if (!practice) violation('d', H, '#practice is missing');
    else {
        const buttons = descendants(practice).filter(el => el.tag === 'button');
        const calls = buttons.slice(0, 2).map(firstCall);
        if (calls[0] !== 'openJapamala' || calls[1] !== 'openTrack') {
            violation('d', where(H, practice.line), '#practice\'s first two buttons must call openJapamala() then openTrack(), found ' + calls.map(String).join(', '));
        }
    }

    const options = all.filter(el => hasClass(el, 'reader-options'));
    if (options.length !== 1) violation('d', H, 'expected one .reader-options, found ' + options.length);
    for (const el of options) {
        const summaries = descendants(el).filter(d => d.tag === 'summary');
        if (summaries.length !== 1) violation('d', where(H, el.line), '.reader-options must contain exactly one <summary>, found ' + summaries.length);
    }

    const fontButtons = all.filter(el => hasClass(el, 'font-btn'));
    if (fontButtons.length < 2) violation('d', H, 'expected two .font-btn, found ' + fontButtons.length);
    else {
        const last = fontButtons[fontButtons.length - 1];
        if (!/changeFontSize\(\s*2\s*\)/.test(last.attrs.onclick || '')) violation('d', where(H, last.line), 'the last .font-btn must be changeFontSize(2) (the larger one)');
        if (!/changeFontSize\(\s*-2\s*\)/.test(fontButtons[0].attrs.onclick || '')) violation('d', where(H, fontButtons[0].line), 'the first .font-btn must be changeFontSize(-2)');
    }

    const modeButtons = all.filter(el => hasClass(el, 'jm-mode-btn'));
    const modes = modeButtons.map(el => el.attrs['data-mode']);
    if (modes.join(',') !== JM_MODES.join(',')) violation('d', H, '.jm-mode-btn data-mode order must be ' + JM_MODES.join(', ') + ', found ' + modes.join(', '));
    const dataModes = all.filter(el => 'data-mode' in el.attrs);
    if (dataModes.length !== modeButtons.length) {
        for (const el of dataModes.filter(d => !modeButtons.includes(d))) violation('d', where(H, el.line), 'only .jm-mode-btn may carry data-mode (e2e locators are strict)');
    }
    for (const cls of ['jm-btn-count', 'jm-btn-reset', 'footer-feedback']) {
        const count = all.filter(el => hasClass(el, cls)).length;
        if (count !== 1) violation('d', H, 'expected exactly one .' + cls + ', found ' + count);
    }

    const japamala = all.find(el => el.attrs.id === 'japamalaPage');
    if (!japamala) violation('d', H, '#japamalaPage is missing');
    else {
        for (const button of descendants(japamala).filter(el => el.tag === 'button')) {
            if (!('data-info' in button.attrs) && !/stopPropagation/.test(button.attrs.onclick || '')) {
                violation('d', where(H, button.line), 'button inside #japamalaPage needs data-info or onclick="event.stopPropagation(); …" (the page counts a bead on every click)');
            }
        }
    }

    for (const el of all.filter(e => 'data-info' in e.attrs)) {
        const inSummary = insideTag(el, 'summary') || el.tag === 'summary';
        let inToggle = false;
        for (let p = el; p; p = p.parent) if (p.attrs && p.attrs.id === 'meaningToggle') inToggle = true;
        if (inSummary || inToggle) violation('d', where(H, el.line), 'ⓘ [data-info="' + el.attrs['data-info'] + '"] must not sit inside ' + (inSummary ? 'a <summary>' : '#meaningToggle'));
    }

    const ids = new Map();
    for (const el of all) {
        const id = el.attrs.id;
        if (!id) continue;
        if (ids.has(id)) violation('d', where(H, el.line), 'duplicate id "' + id + '" (first at line ' + ids.get(id) + ')');
        else ids.set(id, el.line);
    }

    const checkCalls = (code, at, context) => {
        for (const name of bareCalls(code)) {
            if (indexGlobals.has(name) || BROWSER_GLOBALS.has(name)) continue;
            violation('d', at, context + ' calls ' + name + '(), which no script on index.html defines globally');
        }
    };
    for (const el of all) {
        for (const [attr, code] of inlineHandlers(el)) checkCalls(code, where(H, el.line), '<' + el.tag + ' ' + attr + '>');
    }
    for (const script of siteScriptFiles) {
        for (const tok of literals(script.toks).filter(t => looksLikeMarkup(t.v))) {
            for (const m of tok.v.matchAll(/(?:^|[\s<'"])on([a-z]+)\s*=\s*(?:"([^"]*)"?|'([^']*)'?)/g)) {
                checkCalls(m[2] ?? m[3] ?? '', jsLine(script, tok.line), 'JS-built on' + m[1] + ' handler');
            }
        }
    }
}

/* ---------------------------------------------------------------- (e) HELP keys */

function helpDictionary() {
    const file = 'public/assets/help.js';
    const text = readText(file);
    if (text == null) return null;
    const toks = tokenizeJs(text);
    for (let k = 0; k + 2 < toks.length; k++) {
        if (toks[k].t !== 'id' || toks[k].v !== 'HELP' || isMember(toks[k - 1]) || toks[k + 1].v !== '=' || toks[k + 2].v !== '{') continue;
        const open = toks[k + 2];
        const keys = [];
        let close = null;
        for (let m = k + 3; m < toks.length; m++) {
            const tok = toks[m];
            if (tok.depth === open.depth && tok.v === '}') { close = tok; break; }
            if (tok.depth === open.depth + 1 && (tok.t === 'str' || tok.t === 'id') && toks[m + 1] && toks[m + 1].v === ':'
                && ['{', ','].includes(toks[m - 1].v)) keys.push({key: tok.v, line: tok.line});
        }
        let value = null;
        if (close) {
            try { value = vm.runInNewContext('(' + text.replace(/^\uFEFF/, '').slice(open.s, close.e) + ')', {}, {timeout: 1000}); }
            catch (error) { note('e', file, 'could not evaluate HELP for the entry-shape checks: ' + error.message); }
        }
        return {file, keys, value, line: toks[k].line};
    }
    violation('e', file, 'no `HELP = { … }` object literal found');
    return null;
}
if (wanted('e')) {
    const help = helpDictionary();
    const used = new Map();
    const use = (key, at) => { if (!used.has(key)) used.set(key, at); };
    for (const el of indexDoc.all) {
        if ('data-info' in el.attrs) use(el.attrs['data-info'], where('index.html', el.line));
        for (const [, code] of inlineHandlers(el)) for (const m of code.matchAll(/\bshowInfo\(\s*['"]([^'"]+)['"]/g)) use(m[1], where('index.html', el.line));
    }
    for (const script of allAssetScripts) {
        const toks = script.toks;
        toks.forEach((tok, k) => {
            if ((tok.t === 'str' || tok.t === 'tpl') && looksLikeMarkup(tok.v)) {
                for (const m of tok.v.matchAll(/data-info\s*=\s*(?:"([^"]*)("?)|'([^']*)('?))/g)) {
                    const value = m[1] ?? m[3];
                    const closed = (m[2] ?? m[4]) !== '';
                    if (closed && value) use(value, jsLine(script, tok.line));
                    else note('e', jsLine(script, tok.line), 'data-info built from an expression; its key cannot be checked statically');
                }
            }
            if (tok.t === 'id' && tok.v === 'dataset' && toks[k + 1] && toks[k + 1].v === '.' && toks[k + 2] && toks[k + 2].v === 'info'
                && toks[k + 3] && toks[k + 3].v === '=' && toks[k + 4] && toks[k + 4].t === 'str') use(toks[k + 4].v, jsLine(script, tok.line));
            if (tok.t === 'id' && tok.v === 'setAttribute' && toks[k + 2] && toks[k + 2].t === 'str' && toks[k + 2].v === 'data-info'
                && toks[k + 4] && toks[k + 4].t === 'str') use(toks[k + 4].v, jsLine(script, tok.line));
            if (tok.t === 'id' && tok.v === 'showInfo' && !isMember(toks[k - 1]) && toks[k + 1] && toks[k + 1].v === '(' && toks[k + 2] && toks[k + 2].t === 'str'
                && script.file !== 'public/assets/help.js') use(toks[k + 2].v, jsLine(script, tok.line));
        });
    }
    if (help) {
        const helpKeys = new Set(help.keys.map(k => k.key));
        for (const [key, at] of used) if (!helpKeys.has(key)) violation('e', at, 'data-info="' + key + '" has no HELP entry in ' + help.file);
        for (const {key, line} of help.keys) if (!used.has(key)) violation('e', where(help.file, line), 'HELP key "' + key + '" is never used by any data-info');
        const contractText = readText('docs/redesign-research/contract.md', {required: false});
        const listLine = contractText && contractText.split('\n').find(l => /^The keys are:/.test(l));
        if (listLine) {
            const contractKeys = new Set([...listLine.matchAll(/`([^`]+)`/g)].map(m => m[1]));
            for (const key of contractKeys) if (!helpKeys.has(key)) violation('e', help.file, 'contract §6 key "' + key + '" is missing from HELP');
            for (const key of helpKeys) if (!contractKeys.has(key)) violation('e', help.file, 'HELP key "' + key + '" is not in contract §6');
        }
        if (help.value && typeof help.value === 'object') {
            for (const {key, line} of help.keys) {
                const entry = help.value[key];
                const at = where(help.file, line);
                const text = v => typeof v === 'string' && v.trim().length > 0;
                if (!entry || typeof entry !== 'object') { violation('e', at, 'HELP["' + key + '"] is not an object'); continue; }
                if (!text(entry.title)) violation('e', at, 'HELP["' + key + '"].title is missing');
                const body = Array.isArray(entry.body) ? entry.body : [entry.body];
                if (!body.length || !body.every(text)) violation('e', at, 'HELP["' + key + '"].body must be a string or an array of strings');
                else if (body.length > 3) note('e', at, 'HELP["' + key + '"].body has ' + body.length + ' paragraphs (contract: 1–3 short sentences)');
                if (!text(entry.gloss)) violation('e', at, 'HELP["' + key + '"].gloss (one English line) is missing');
            }
        }
    }
}

/* ---------------------------------------------------------------- (f) global collisions */

if (wanted('f')) {
    const LEXICAL = new Set(['const', 'let', 'class']);
    for (const [page, scripts] of [['index.html', indexScripts], ['admin.html', adminScripts]]) {
        const defs = globalDefinitions(scripts);
        for (const [name, list] of defs) {
            const files = [...new Set(list.map(d => d.file))];
            if (files.length < 2) continue;
            const perFile = files.map(file => list.find(d => d.file === file));
            const declared = perFile.filter(d => !d.kind.startsWith('window.'));
            let effect;
            if (declared.length >= 2 && declared.some(d => LEXICAL.has(d.kind))) {
                effect = 'the later script throws a SyntaxError and does not run at all (a let/const/class name can be declared only once in the shared global scope)';
            } else if (declared.some(d => LEXICAL.has(d.kind))) {
                effect = 'window.' + name + ' = … creates a separate property; code that reads the bare name still sees the let/const binding, so the two copies drift apart';
            } else {
                effect = 'the later script silently overrides the earlier one';
            }
            violation('f', perFile.map(d => d.line).join(' + '), page + ': `' + name + '` is declared by '
                + perFile.map(d => d.file.replace('public/assets/', '') + ' (' + d.kind + ')').join(' and ') + ': ' + effect);
        }
    }
}

/* ---------------------------------------------------------------- (g) font families */

function fontFamiliesIn(value) {
    return splitList(value).map(f => f.trim()).filter(Boolean).filter(f => !/^var\(/i.test(f)).map(f => f.replace(/^["']|["']$/g, '').trim());
}
if (wanted('g')) {
    const declared = new Map();
    const fontsourceDir = 'node_modules/@fontsource-variable';
    const packages = exists(fontsourceDir) ? fs.readdirSync(abs(fontsourceDir)).filter(name => /^noto-.*-telugu$/.test(name)) : [];
    if (!packages.length) violation('setup', fontsourceDir, 'no @fontsource-variable/noto-*-telugu package installed (run npm install)');
    for (const pkg of packages) {
        const file = posixJoin(fontsourceDir, pkg, 'index.css');
        const entry = loadCss(file);
        if (!entry.root) continue;
        const imported = packageCss.includes(file);
        entry.root.walkAtRules('font-face', face => face.walkDecls('font-family', decl => {
            for (const family of fontFamiliesIn(decl.value)) declared.set(family.toLowerCase(), {family, file, imported});
        }));
    }
    for (const file of siteCss) {
        const entry = loadCss(file);
        if (!entry.root) continue;
        entry.root.walkAtRules('font-face', face => face.walkDecls('font-family', decl => {
            for (const family of fontFamiliesIn(decl.value)) declared.set(family.toLowerCase(), {family, file, imported: true});
        }));
    }
    const checkFamily = (family, at, context) => {
        const lower = family.toLowerCase();
        if (GENERIC_FONTS.has(lower) || SYSTEM_FONTS.has(lower)) return;
        const face = declared.get(lower);
        if (!face) return violation('g', at, context + ' uses "' + family + '", which no imported @font-face declares and is not an allowed system fallback');
        if (!face.imported) violation('g', at, context + ' uses "' + family + '" from ' + face.file + ', but styles/app.css does not import that package');
    };
    for (const file of siteCss) {
        const entry = loadCss(file);
        if (!entry.root) continue;
        entry.root.walkDecls(decl => {
            if (decl.parent && decl.parent.type === 'atrule' && decl.parent.name === 'font-face') return;
            const prop = decl.prop.toLowerCase();
            const at = where(file, lineOf(decl));
            if (prop === 'font-family') {
                for (const family of fontFamiliesIn(decl.value)) checkFamily(family, at, 'font-family');
            } else if (prop === 'font') {
                const value = decl.value.trim();
                if (/^(inherit|initial|unset|revert|revert-layer|caption|icon|menu|message-box|small-caption|status-bar)$/i.test(value)) return;
                const m = value.match(/(?:^|\s)(?:[\d.]+(?:px|r?em|%|pt|vw|vh|ch|ex)|var\([^)]*\)|(?:xx?-)?(?:small|large)|medium|smaller|larger|(?:clamp|min|max|calc)\([^)]*\)+)(?:\s*\/\s*\S+)?\s+(.+)$/i);
                if (m) for (const family of fontFamiliesIn(m[1])) checkFamily(family, at, 'font shorthand');
            } else if (prop.startsWith('--') && /font(?!-size|-weight|-scale)/.test(prop) && !/size|weight|scale|lh|line/.test(prop)) {
                if (/^[\d.]/.test(decl.value.trim())) return;
                for (const family of fontFamiliesIn(decl.value)) checkFamily(family, at, prop);
            }
        });
    }
}

/* ---------------------------------------------------------------- (h) classes */

const VALID_CLASS = /^-?[A-Za-z_][\w-]*$/;
/* class="…" inside one literal. When the literal ends before the closing
   quote (string concatenation or a template ${…}), a last word ending in
   "-" or "_" is only a prefix ("tag-" + kind) and is dropped. */
function classesFromAttributeText(text) {
    const out = [];
    for (const m of text.matchAll(/(?:^|[\s<'"])class\s*=\s*(?:"([^"]*)("?)|'([^']*)('?))/g)) {
        const value = m[1] ?? m[3];
        const closed = (m[2] ?? m[4]) !== '';
        const parts = value.split(/\s+/);
        if (!closed && /[-_]$/.test(value)) parts.pop();
        out.push(...parts);
    }
    return out.filter(c => VALID_CLASS.test(c));
}
function literalClassPieces(tok, prev, next) {
    const parts = tok.v.split(/\s+/);
    if (tok.t === 'tpl' ? tok.afterExpr && /^\S/.test(tok.v) : prev && prev.v === '+' && /^\S/.test(tok.v)) parts.shift();
    if (tok.t === 'tpl' ? tok.beforeExpr && /\S$/.test(tok.v) : next && next.v === '+' && /\S$/.test(tok.v)) {
        if (/[-_]$/.test(parts[parts.length - 1] || '')) parts.pop();
    }
    return parts.filter(c => VALID_CLASS.test(c));
}
function jsClassUses(script) {
    const uses = [];
    const toks = script.toks;
    toks.forEach((tok, k) => {
        if ((tok.t === 'str' || tok.t === 'tpl') && looksLikeMarkup(tok.v)) {
            for (const cls of classesFromAttributeText(tok.v)) {
                uses.push({cls, at: jsLine(script, tok.line), how: 'class="…"'});
            }
        }
        if (tok.t === 'id' && tok.v === 'className' && isMember(toks[k - 1]) && toks[k + 1] && toks[k + 1].t === 'p' && ['=', '+='].includes(toks[k + 1].v)) {
            const depth = tok.depth;
            for (let m = k + 2; m < toks.length; m++) {
                const x = toks[m];
                if (x.depth < depth || (x.depth === depth && x.t === 'p' && [';', ','].includes(x.v))) break;
                if (x.line > tok.line + 2) break;
                if (x.t === 'str' || x.t === 'tpl') for (const cls of literalClassPieces(x, toks[m - 1], toks[m + 1])) uses.push({cls, at: jsLine(script, x.line), how: 'className ='});
            }
        }
        if (tok.t === 'id' && tok.v === 'classList' && toks[k + 1] && toks[k + 1].v === '.' && toks[k + 2] && ['add', 'toggle', 'replace'].includes(toks[k + 2].v)
            && toks[k + 3] && toks[k + 3].v === '(') {
            const open = toks[k + 3];
            const args = [[]];
            for (let m = k + 4; m < toks.length; m++) {
                const x = toks[m];
                if (x.depth <= open.depth) break;
                if (x.depth === open.depth + 1 && x.t === 'p' && x.v === ',') { args.push([]); continue; }
                args[args.length - 1].push(x);
            }
            const method = toks[k + 2].v;
            const pick = method === 'toggle' ? args.slice(0, 1) : method === 'replace' ? args.slice(1, 2) : args;
            for (const arg of pick) {
                if (arg.length !== 1 || arg[0].t !== 'str') continue;   /* only plain literals are knowable */
                for (const cls of arg[0].v.split(/\s+/).filter(c => VALID_CLASS.test(c))) uses.push({cls, at: jsLine(script, arg[0].line), how: 'classList.' + method});
            }
        }
    });
    return uses;
}
function cssClassIndex() {
    const exact = new Set();
    const matchers = [];
    for (const file of siteCss) {
        const entry = loadCss(file);
        if (!entry.root) continue;
        entry.root.walkRules(rule => {
            if (inKeyframes(rule)) return;
            for (const selector of ruleSelectors(rule)) {
                const withoutStrings = selector.replace(/\[\s*class\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))[^\]]*\]/gi, (m, op, a, b, c) => {
                    matchers.push({op, value: a ?? b ?? c});
                    return '';
                }).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/\[[^\]]*\]/g, '');
                for (const m of withoutStrings.matchAll(/\.((?:[\w-]|\\.|[^\x00-\x7f])+)/g)) exact.add(m[1].replace(/\\(.)/g, '$1'));
            }
        });
    }
    const test = cls => exact.has(cls) || matchers.some(({op, value}) =>
        (op === '~=' && cls === value) || (op === '=' && cls === value) || (op === '^=' && cls.startsWith(value))
        || (op === '*=' && cls.includes(value)) || (op === '$=' && cls.endsWith(value)) || (op === '|=' && (cls === value || cls.startsWith(value + '-'))));
    return {exact, test};
}
if (wanted('h')) {
    const css = cssClassIndex();
    const firstUse = new Map();
    const use = (cls, at, how) => { if (!firstUse.has(cls)) firstUse.set(cls, {at, how}); };
    for (const el of indexDoc.all) {
        if (insideTag(el, 'script')) continue;
        for (const cls of el.classes) use(cls, where('index.html', el.line), 'index.html');
    }
    for (const script of siteScriptFiles) for (const u of jsClassUses(script)) use(u.cls, u.at, u.how);
    const unused = [...JS_ONLY_HOOKS].filter(cls => !firstUse.has(cls));
    for (const cls of unused) note('h', 'tools/check-ui-contract.cjs', 'JS_ONLY_HOOKS entry "' + cls + '" is no longer used; remove it from the allowlist');
    for (const [cls, {at, how}] of firstUse) {
        if (JS_ONLY_HOOKS.has(cls) || css.test(cls)) continue;
        violation('h', at, '.' + cls + ' (' + how + ') matches no selector in the site CSS');
    }
}

/* ---------------------------------------------------------------- (i) icons */

if (wanted('i')) {
    const sprite = readText('public/icons.svg');
    if (sprite != null) {
        const symbols = new Set([...sprite.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]));
        const check = (name, at) => { if (!symbols.has('icon-' + name)) violation('i', at, 'icon "icon-' + name + '" is not a <symbol> in public/icons.svg'); };
        for (const [file, doc] of [['index.html', indexDoc], ['admin.html', adminDoc]]) {
            for (const el of doc.all) {
                const href = el.attrs.href || el.attrs['xlink:href'] || el.attrs.src || '';
                const m = href.match(/\/icons\.svg#icon-([\w-]+)$/);
                if (m) check(m[1], where(file, el.line));
            }
        }
        for (const script of [...siteScriptFiles, ...adminScripts.filter(s => s.file.startsWith('public/assets/') && !siteScriptFiles.some(x => x.file === s.file))]) {
            const toks = script.toks;
            const helpers = new Set();
            toks.forEach((tok, k) => {
                if (tok.t === 'id' && tok.v === 'function' && toks[k + 1] && /^(icon|ico)$/.test(toks[k + 1].v)) helpers.add(toks[k + 1].v);
            });
            toks.forEach((tok, k) => {
                if (tok.t === 'str' || tok.t === 'tpl') {
                    for (const m of tok.v.matchAll(/\/icons\.svg#icon-([\w-]*)/g)) {
                        const cut = m.index + m[0].length === tok.v.length && (tok.t === 'tpl' ? tok.beforeExpr : toks[k + 1] && toks[k + 1].v === '+');
                        if (m[1] && !cut) check(m[1], jsLine(script, tok.line));
                    }
                }
                if (tok.t === 'id' && helpers.has(tok.v) && !isMember(toks[k - 1]) && toks[k + 1] && toks[k + 1].v === '(' && toks[k + 2] && toks[k + 2].t === 'str'
                    && SPRITE_NAME.test(toks[k + 2].v) && !(toks[k - 1] && toks[k - 1].v === 'function')) check(toks[k + 2].v, jsLine(script, tok.line));
                if (helpers.size && tok.t === 'id' && tok.v === 'icon' && toks[k + 1] && toks[k + 1].v === ':' && toks[k + 2] && toks[k + 2].t === 'str'
                    && SPRITE_NAME.test(toks[k + 2].v)) check(toks[k + 2].v, jsLine(script, tok.line));
            });
        }
        for (const file of siteCss) {
            const entry = loadCss(file);
            if (!entry.root) continue;
            entry.root.walkDecls(decl => {
                for (const m of decl.value.matchAll(/url\(\s*["']?[^"')]*\/icons\.svg#icon-([\w-]+)/g)) check(m[1], where(file, lineOf(decl)));
            });
        }
    }
}

/* ---------------------------------------------------------------- (j) readable text */

function tokenPx() {
    const map = new Map();
    const entry = loadCss('styles/tokens.css');
    if (!entry.root) return map;
    entry.root.walkDecls(/^--/, decl => { if (!map.has(decl.prop)) map.set(decl.prop, decl.value.trim()); });
    return map;
}
const TOKENS = tokenPx();
const KEYWORD_SIZES = {'xx-small': 9, 'x-small': 10, small: 13};
/* Smallest size a font-size value can resolve to, in px (null when unknown). */
function minFontPx(value, seen = new Set()) {
    const v = value.replace(/!\s*important\s*$/i, '').trim();
    let m;
    if ((m = v.match(/^(-?[\d.]+)px$/i))) return Number(m[1]);
    if ((m = v.match(/^(-?[\d.]+)rem$/i))) return Number(m[1]) * 16;
    if (v.toLowerCase() in KEYWORD_SIZES) return KEYWORD_SIZES[v.toLowerCase()];
    if ((m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/))) {
        if (seen.has(m[1])) return null;
        seen.add(m[1]);
        if (TOKENS.has(m[1])) return minFontPx(TOKENS.get(m[1]), seen);
        return m[2] ? minFontPx(m[2], seen) : null;
    }
    if ((m = v.match(/^(clamp|min|max)\(([\s\S]*)\)$/i))) {
        const args = splitList(m[2]).map(a => minFontPx(a, new Set(seen)));
        const known = args.filter(a => a != null);
        const fn = m[1].toLowerCase();
        if (fn === 'clamp') return args[0];
        if (fn === 'max') return known.length ? Math.max(...known) : null;
        return known.length === args.length ? Math.min(...known) : null;
    }
    return null;
}
if (wanted('j')) {
    for (const file of siteCss) {
        for (const rule of cssRules(file)) {
            for (const decl of rule.decls) {
                const at = where(file, decl.line);
                const label = '`' + rule.selectors.join(', ') + '`';
                let size = null;
                if (decl.prop === 'font-size') size = decl.value;
                else if (decl.prop === 'font') {
                    const m = decl.value.match(/(?:^|\s)((?:[\d.]+(?:px|rem))|var\([^)]*\)|(?:clamp|min|max)\([^)]*\)+)(?:\s*\/\s*\S+)?\s+\S/i);
                    if (m) size = m[1];
                }
                if (size != null) {
                    const px = minFontPx(size);
                    if (px != null && px > 0 && px < 14) violation('j', at, label + ' font-size ' + size.trim() + ' ≈ ' + Math.round(px * 10) / 10 + 'px (text is never under 14px)');
                }
                if (decl.prop === 'text-transform' && /uppercase|capitalize/i.test(decl.value)) note('j', at, label + ' text-transform: ' + decl.value + ' (never on Telugu text)');
                if (decl.prop === 'letter-spacing' && /^[\d.]*[1-9]/.test(decl.value.trim())) note('j', at, label + ' letter-spacing: ' + decl.value + ' (never on Telugu text)');
            }
        }
    }
}

/* ---------------------------------------------------------------- output */

const groups = [...results.values()].filter(g => g.id === 'setup' || wanted(g.id));
const total = groups.reduce((n, g) => n + g.violations.length, 0);
const failing = groups.filter(g => g.violations.length);
if (OPT_JSON) {
    console.log(JSON.stringify({ok: total === 0, violations: total, groups}, null, 2));
} else {
    const out = [];
    out.push('UI contract check (docs/redesign-research/contract.md)');
    out.push('  CSS: ' + siteCss.length + ' site files from styles/app.css, ' + packageCss.length + ' font package(s); JS: '
        + indexScripts.length + ' scripts on index.html, ' + adminScripts.length + ' on admin.html');
    for (const g of groups) {
        if (g.id === 'setup' && !g.violations.length && !g.notes.length) continue;
        const status = g.violations.length ? 'FAIL' : 'ok  ';
        out.push('');
        out.push(status + ' [' + g.id + '] ' + g.title + (g.violations.length ? ': ' + g.violations.length + ' violation' + (g.violations.length === 1 ? '' : 's') : ''));
        const show = OPT_ALL ? g.violations : g.violations.slice(0, MAX_LINES);
        for (const v of show) out.push('       ' + v.where + '  ' + v.message);
        if (show.length < g.violations.length) out.push('       … and ' + (g.violations.length - show.length) + ' more (run with --all)');
        const notes = OPT_ALL ? g.notes : g.notes.slice(0, 15);
        for (const n of notes) out.push('       note: ' + n.where + '  ' + n.message);
        if (notes.length < g.notes.length) out.push('       note: … and ' + (g.notes.length - notes.length) + ' more notes (run with --all)');
    }
    out.push('');
    out.push(total
        ? 'FAIL: ' + total + ' violation' + (total === 1 ? '' : 's') + ' in ' + failing.length + ' check' + (failing.length === 1 ? '' : 's') + ' (' + failing.map(g => g.id).join(', ') + ').'
        : 'PASS: UI contract holds (' + groups.filter(g => g.id !== 'setup').map(g => g.id).join(', ') + ').');
    console.log(out.join('\n'));
}
process.exitCode = total ? 1 : 0;
