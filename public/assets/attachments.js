/* ============================================================
   ATTACHMENTS (screenshots and PDFs) → window.StotramFiles
   Build contract: docs/conversations-contract.md §1.3, §2, §5, §6.

   Loaded on index.html and admin.html, after the Firebase SDK and
   before the scripts that use it. Nothing here touches the DOM or
   Firebase at load time, so the file also runs in a node vm sandbox.

   Files live in Firestore (no Firebase Storage on the free plan):
     feedback/{fbid}/files/{mid-n}
       { mid, n, name, type, size, data: Bytes, from, createdAt, key? }
   The parent (mid 'first') or the message doc must declare the file in
   its `files` list BEFORE upload() runs; the rules check that.

   Images are decoded (createImageBitmap, <img> fallback), redrawn on a
   canvas at long side ≤ 1600 px and re-encoded as WebP (JPEG where the
   browser cannot write WebP), stepping quality and then size down
   until the bytes fit. Re-encoding drops EXIF and never passes SVG.
   PDFs pass through unchanged when they start with "%PDF-".

   Markup (§5), built with textContent / setAttribute only:
     div.attach-list > div.attach-item[data-kind="image|pdf"]
        > button (the tap target) > img.attach-thumb | span.attach-pdf > svg
        > span.attach-name, span.attach-size, button.attach-remove (picker only)
     div.attach-error[role=alert], div.attach-loading[role=status]
     div.file-viewer[role=dialog][aria-modal=true] > img.file-viewer-img + button.file-viewer-close
   The viewer is shown and hidden with the `hidden` attribute.
============================================================ */
(function () {
  'use strict';

  const G = typeof window !== 'undefined' ? window : globalThis;

  const PDF = 'application/pdf';
  const LIMITS = Object.freeze({
    maxFiles: 3,
    maxBytes: 800000,
    maxSide: 1600,
    imageTypes: Object.freeze(['image/webp', 'image/jpeg', 'image/png']),
    pdfType: PDF
  });

  const QUALITIES = [0.82, 0.72, 0.62, 0.5];   // first value is the contract's 0.82
  const SHRINK = 0.8;                           // then the long side shrinks by 20% a step
  const MIN_SIDE = 320;                         // below this a screenshot is unreadable anyway
  const MAX_IMAGE_INPUT = 40 * 1024 * 1024;     // refuse to decode huge files on old phones
  const WRITE_MS = 20000;
  const READ_MS = 20000;
  const NAME_MAX = 120;
  const CACHE_MAX = 48;                         // object URLs kept per page (≤ 800 KB each)
  const MID_RE = /^(first|m-[0-9]{10,16}-[a-z0-9]{4,10})$/;
  const FILE_ID_RE = /^(first|m-[0-9]{10,16}-[a-z0-9]{4,10})-[0-2]$/;
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
  const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

  /* ---------- copy (§6) ---------- */
  const TE = {
    type: 'చిత్రం లేదా PDF మాత్రమే జోడించవచ్చు.',
    size: 'ఈ PDF చాలా పెద్దది. 750 KB లోపు ఉన్నది ఎంచుకోండి.',
    count: '3 కంటే ఎక్కువ జోడించలేం.',
    decode: 'ఈ చిత్రం తెరవలేకపోయాం. వేరే స్క్రీన్‌షాట్ ప్రయత్నించండి.',
    preparing: 'చిత్రం సిద్ధమవుతోంది… ఒక్క క్షణం.',
    failedLoad: 'చూపించలేకపోయాం',
    remove: 'తొలగించు ',
    close: 'మూసివేయి / Close',
    viewImage: 'చిత్రం చూడండి: ',
    openPdf: 'PDF తెరవండి: ',
    openingPdf: 'PDF తెరుస్తున్నాం…',
    image: 'చిత్రం'
  };
  const NOTIFY_SIGNED_IN = 'నమస్కారం {name}, స్తోత్రములు సైట్‌లో మీరు పంపిన సందేశానికి జవాబు ఇచ్చాం. {siteUrl} తెరిచి, \'నా ఖాతా\' → \'నా సందేశాలు\' లో చూడండి. — స్తోత్రములు బృందం';
  const NOTIFY_GUEST = 'నమస్కారం {name}, స్తోత్రములు సైట్‌లో మీరు పంపిన సందేశానికి మా జవాబు: {reply} — మరిన్ని వివరాలకు {siteUrl} లో Google తో సైన్ ఇన్ చేసి \'నా సందేశాలు\' చూడండి. — స్తోత్రములు బృందం';
  const NOTIFY_SUBJECT = 'స్తోత్రములు — మీ సందేశానికి జవాబు';
  const NOTIFY_LABELS = { email: 'ఈమెయిల్ / Email', whatsapp: 'వాట్సాప్ / WhatsApp', sms: 'ఎస్‌ఎంఎస్ / SMS' };
  const NOTIFY_NAME_MAX = 60;
  const NOTIFY_REPLY_MAX = 1000;   // keeps the prefilled links short enough for every mail / SMS app

  /* ---------- small helpers ---------- */
  function hasDom() {
    return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function';
  }
  function fbNs() {
    if (G.firebase && G.firebase.firestore) return G.firebase;
    try {
      const c = G.StotramCloud;
      if (c && c.firebase && c.firebase.firestore) return c.firebase;
    } catch (e) {}
    return null;
  }
  function makeError(code, message) {
    const e = new Error(message || ('attachment rejected: ' + code));
    e.code = code;
    e.te = TE[code] || TE.decode;
    return e;
  }
  function icon(name) {
    return '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-' + name + '"/></svg>';
  }
  function focusQuietly(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
  }
  function isConnected(el) {
    return !!(el && (el.isConnected === true || (hasDom() && document.contains && document.contains(el))));
  }
  function randomBytes(n) {
    const out = new Uint8Array(n);
    const c = G.crypto;
    if (c && typeof c.getRandomValues === 'function') {
      try { c.getRandomValues(out); return out; } catch (e) {}
    }
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  // Resolves / rejects with `work`, or rejects with 'timeout' after ms.
  // The work itself is not cancelled (a Firestore write may still land later).
  function capTime(work, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      Promise.resolve(work).then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }
  function readBytes(blob) {
    if (blob && typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
    }
    return new Promise((resolve, reject) => {
      if (typeof G.FileReader !== 'function') { reject(new Error('no FileReader')); return; }
      const r = new G.FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsArrayBuffer(blob);
    });
  }
  function asBytes(v) {
    if (!v) return null;
    if (typeof v.toUint8Array === 'function') {
      try { v = v.toUint8Array(); } catch (e) { return null; }
    }
    if (v && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v) && v.BYTES_PER_ELEMENT === 1) {
      return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    }
    return null;
  }
  function startsWith(bytes, ascii) {
    if (!bytes || bytes.length < ascii.length) return false;
    for (let i = 0; i < ascii.length; i++) if (bytes[i] !== ascii.charCodeAt(i)) return false;
    return true;
  }
  // Text that opens with "<" (after a BOM or spaces) is markup: SVG, HTML, XML.
  function looksLikeMarkup(bytes) {
    let i = 0;
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) i = 3;
    while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0A || bytes[i] === 0x0D)) i++;
    return i < bytes.length && bytes[i] === 0x3C;
  }

  /* ---------- names ---------- */
  // Basename only, no control / bidi-override characters, no path separators,
  // at most `max` UTF-16 units (never splitting a character).
  function cleanName(raw, fallback, max) {
    const limit = max || NAME_MAX;
    let s = String(raw == null ? '' : raw);
    s = s.split(/[\\/]/).pop();
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) s = fallback || '';
    return clip(s, limit);
  }
  function clip(s, max) {
    if (s.length <= max) return s;
    let out = '';
    for (const ch of s) {
      if (out.length + ch.length > max) break;
      out += ch;
    }
    return out;
  }
  function withExtension(name, ext, fallback) {
    let base = cleanName(name, '', NAME_MAX).replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[\s.]+$/, '');
    if (!base) base = fallback;
    return clip(base, NAME_MAX - ext.length) + ext;
  }

  /* ---------- sizes ---------- */
  function humanSize(bytes) {
    const b = Number(bytes);
    if (!isFinite(b) || b <= 0) return '0 KB';
    const kb = Math.max(1, Math.round(b / 1000));
    if (kb < 1000) return kb + ' KB';
    const mb = Math.round(b / 100000) / 10;
    return String(mb).replace(/\.0$/, '') + ' MB';
  }

  /* ============================================================
     prepare(file) → Prepared { name, type, size, bytes, url }
  ============================================================ */
  function kindOf(file) {
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '');
    if (/svg/.test(type) || /\.svgz?$/i.test(name)) return '';
    if (type.indexOf('image/') === 0) return 'image';
    if (type === PDF || /\.pdf$/i.test(name)) return 'pdf';
    if ((!type || type === 'application/octet-stream') && IMAGE_EXT.test(name)) return 'image';
    return '';
  }

  function prepare(file) {
    return Promise.resolve().then(() => {
      if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') throw makeError('type');
      const kind = kindOf(file);
      if (!kind || file.size <= 0) throw makeError('type');
      return kind === 'pdf' ? preparePdf(file) : prepareImage(file);
    });
  }

  function preparePdf(file) {
    if (file.size > LIMITS.maxBytes) return Promise.reject(makeError('size'));
    return readBytes(file).then((bytes) => {
      if (!startsWith(bytes, '%PDF-')) throw makeError('type');
      if (bytes.length > LIMITS.maxBytes) throw makeError('size');
      let name = cleanName(file.name, 'document.pdf');
      if (!/\.pdf$/i.test(name)) name = withExtension(name, '.pdf', 'document');
      return finish(name, PDF, bytes, null);
    }, (e) => {
      if (e && e.code) throw e;
      throw makeError('type', 'could not read the PDF');
    });
  }

  function prepareImage(file) {
    if (file.size > MAX_IMAGE_INPUT) return Promise.reject(makeError('decode', 'image file too large to decode'));
    if (!hasDom()) return Promise.reject(makeError('decode', 'no canvas here'));
    return readBytes(file.slice(0, 64)).catch(() => new Uint8Array(0)).then((head) => {
      if (looksLikeMarkup(head)) throw makeError('type', 'markup, not a picture');
      return decodeImage(file);
    }).then((img) => encodeToFit(img).then(
      (blob) => { img.release(); return blob; },
      (e) => { img.release(); throw e; }
    )).then((blob) => readBytes(blob).then((bytes) => {
      const type = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      const name = withExtension(file.name, type === 'image/webp' ? '.webp' : '.jpg', 'image');
      return finish(name, type, bytes, blob);
    }));
  }

  function finish(name, type, bytes, blob) {
    let url = '';
    try {
      const b = blob && blob.type === type ? blob : new Blob([bytes], { type: type });
      url = G.URL && typeof G.URL.createObjectURL === 'function' ? G.URL.createObjectURL(b) : '';
    } catch (e) { url = ''; }
    return { name: name, type: type, size: bytes.length, bytes: bytes, url: url };
  }

  // → Promise<{ source, width, height, release() }>
  function decodeImage(file) {
    const viaBitmap = () => {
      if (typeof G.createImageBitmap !== 'function') return Promise.reject(new Error('no createImageBitmap'));
      let p;
      try { p = G.createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) { return Promise.reject(e); }
      return Promise.resolve(p).then((bmp) => {
        if (!bmp || !bmp.width || !bmp.height) throw new Error('empty bitmap');
        return { source: bmp, width: bmp.width, height: bmp.height, release: () => { try { bmp.close(); } catch (e) {} } };
      });
    };
    // <img> honours EXIF orientation and decodes some formats (HEIC on
    // Safari) that createImageBitmap refuses.
    const viaImg = () => new Promise((resolve, reject) => {
      let url = '';
      try { url = G.URL.createObjectURL(file); } catch (e) { reject(e); return; }
      const img = document.createElement('img');
      const release = () => { try { G.URL.revokeObjectURL(url); } catch (e) {} };
      img.decoding = 'async';
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { release(); reject(new Error('empty image')); return; }
        resolve({ source: img, width: w, height: h, release: release });
      };
      img.onerror = () => { release(); reject(new Error('img decode failed')); };
      img.src = url;
    });
    return viaBitmap().catch(viaImg).catch(() => { throw makeError('decode'); });
  }

  let canWebp = null;   // learnt from the first toBlob answer

  function encodeToFit(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return Promise.reject(makeError('decode', 'no 2d canvas'));
    const long = Math.max(img.width, img.height);
    let side = Math.min(LIMITS.maxSide, long);

    const draw = () => {
      const scale = side / long;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = 'white';           // transparent PNG parts must not turn black in JPEG
      ctx.fillRect(0, 0, w, h);
      try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch (e) {}
      ctx.drawImage(img.source, 0, 0, w, h);
    };
    const tryQuality = (qi) => encode(canvas, QUALITIES[qi]).then((blob) => {
      if (blob.size <= LIMITS.maxBytes) return blob;
      if (qi + 1 < QUALITIES.length) return tryQuality(qi + 1);
      const next = Math.floor(side * SHRINK);
      if (next < MIN_SIDE) throw makeError('size', 'image still too large at the smallest size');
      side = next;
      draw();
      return tryQuality(0);
    });

    try { draw(); } catch (e) { return Promise.reject(makeError('decode', 'draw failed')); }
    return tryQuality(0).then((blob) => {
      canvas.width = canvas.height = 1;   // hand the pixel memory back early (Safari)
      return blob;
    }, (e) => {
      canvas.width = canvas.height = 1;
      throw e;
    });
  }

  // WebP first; a browser that cannot write WebP answers with PNG, so JPEG it is.
  function encode(canvas, quality) {
    const want = canWebp === false ? 'image/jpeg' : 'image/webp';
    return toBlob(canvas, want, quality).then((blob) => {
      if (want === 'image/webp') {
        canWebp = blob.type === 'image/webp';
        if (!canWebp) return toBlob(canvas, 'image/jpeg', quality);
      }
      return blob;
    }).then((blob) => {
      if (blob.type !== 'image/webp' && blob.type !== 'image/jpeg') throw makeError('decode', 'encoder gave ' + blob.type);
      return blob;
    });
  }

  function toBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      const fail = () => reject(makeError('decode', 'canvas encode failed'));
      if (typeof canvas.toBlob === 'function') {
        try { canvas.toBlob((b) => (b ? resolve(b) : fail()), type, quality); } catch (e) { fail(); }
        return;
      }
      try {
        const url = canvas.toDataURL(type, quality);
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(url);
        if (!m || !m[2]) { fail(); return; }
        const bin = G.atob(m[3]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: m[1] || 'image/png' }));
      } catch (e) { fail(); }
    });
  }

  /* ============================================================
     ids and metadata
  ============================================================ */
  function newMessageId() {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let tail = '';
    randomBytes(6).forEach((b) => { tail += abc[b % abc.length]; });
    return 'm-' + Date.now() + '-' + tail;
  }
  function newClaimKey() {
    let hex = '';
    randomBytes(16).forEach((b) => { hex += (b < 16 ? '0' : '') + b.toString(16); });
    return hex;
  }
  function fileId(mid, n) {
    return String(mid) + '-' + String(n);
  }
  // The one name both meta() and upload() store for a prepared file.
  function storedName(p) {
    return cleanName(p && p.name, p && p.type === PDF ? 'document.pdf' : 'image');
  }
  function meta(prepared, mid) {
    return (Array.isArray(prepared) ? prepared : []).slice(0, LIMITS.maxFiles).map((p, n) => ({
      id: fileId(mid, n),
      name: storedName(p),
      type: String(p && p.type || ''),
      size: p && asBytes(p.bytes) ? asBytes(p.bytes).length : (Number(p && p.size) || 0)
    }));
  }
  // Metadata from the cloud (or a caller), reduced to what render() can trust.
  function cleanMeta(files) {
    if (!Array.isArray(files)) return [];
    const out = [];
    files.slice(0, LIMITS.maxFiles).forEach((f) => {
      if (!f || typeof f.id !== 'string' || !FILE_ID_RE.test(f.id)) return;
      const type = String(f.type || '');
      if (type !== PDF && LIMITS.imageTypes.indexOf(type) < 0) return;
      out.push({ id: f.id, name: cleanName(f.name, type === PDF ? 'document.pdf' : 'image'), type: type, size: Number(f.size) || 0 });
    });
    return out;
  }
  function validFbid(fbid) {
    return typeof fbid === 'string' && fbid.length > 0 && fbid.length <= 100 && fbid.indexOf('/') < 0;
  }

  /* ============================================================
     upload(db, fbid, mid, prepared[], { from, key }) → { ok, failed }
  ============================================================ */
  // Prepared → Map(docPath → true | pending write). A retry with the same
  // picked files skips what already landed (file docs are create-only, so a
  // second set() would be denied) and waits on a write still in flight.
  const stored = new WeakMap();

  function upload(db, fbid, mid, prepared, opts) {
    const o = opts || {};
    const list = (Array.isArray(prepared) ? prepared : []).slice(0, LIMITS.maxFiles);
    const fb = fbNs();
    if (!list.length) return Promise.resolve({ ok: 0, failed: 0 });
    if (!db || typeof db.collection !== 'function' || !fb || !validFbid(fbid) || !MID_RE.test(String(mid))) {
      return Promise.resolve({ ok: 0, failed: list.length });
    }
    let ok = 0;
    let failed = 0;
    let chain = Promise.resolve();
    list.forEach((p, n) => {
      chain = chain
        .then(() => uploadOne(db, fb, fbid, String(mid), p, n, o))
        .then((done) => { if (done) ok++; else failed++; }, () => { failed++; });
    });
    return chain.then(() => ({ ok: ok, failed: failed }), () => ({ ok: ok, failed: list.length - ok }));
  }

  function uploadOne(db, fb, fbid, mid, p, n, o) {
    const bytes = p && asBytes(p.bytes);
    const type = p && String(p.type || '');
    if (!bytes || !bytes.length || bytes.length > LIMITS.maxBytes) return Promise.resolve(false);
    if (type !== PDF && LIMITS.imageTypes.indexOf(type) < 0) return Promise.resolve(false);
    const id = fileId(mid, n);
    const path = fbid + '/' + id;
    let marks = stored.get(p);
    if (!marks) { marks = new Map(); stored.set(p, marks); }
    const prev = marks.get(path);
    if (prev === true) return Promise.resolve(true);
    let write = prev;
    if (!write) {
      try {
        const doc = {
          mid: mid,
          n: n,
          name: storedName(p),
          type: type,
          size: bytes.length,
          data: fb.firestore.Blob.fromUint8Array(bytes),
          from: o.from === 'admin' ? 'admin' : 'user',
          createdAt: fb.firestore.FieldValue.serverTimestamp()
        };
        if (o.key != null && o.key !== '') doc.key = String(o.key);
        write = Promise.resolve(db.collection('feedback').doc(fbid).collection('files').doc(id).set(doc));
      } catch (e) {
        return Promise.resolve(false);
      }
      marks.set(path, write);
      write.then(() => { marks.set(path, true); }, () => { if (marks.get(path) === write) marks.delete(path); });
    }
    return capTime(write, WRITE_MS).then(() => true, () => false);
  }

  /* ============================================================
     load(db, fbid, fileId) → { url, type, name }   (cached object URL)
  ============================================================ */
  const cache = new Map();   // 'fbid/fileId' → { promise, result }

  function load(db, fbid, id) {
    const key = fbid + '/' + id;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); cache.set(key, hit);   // most recently used last
      return hit.promise;
    }
    const entry = { promise: null, result: null };
    entry.promise = Promise.resolve().then(() => {
      if (!db || typeof db.collection !== 'function' || !validFbid(fbid) || !FILE_ID_RE.test(String(id))) throw new Error('bad file reference');
      return capTime(db.collection('feedback').doc(fbid).collection('files').doc(String(id)).get(), READ_MS);
    }).then((snap) => {
      const exists = snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
      if (!exists) throw new Error('file not found');
      const d = (typeof snap.data === 'function' ? snap.data() : null) || {};
      const type = String(d.type || '');
      if (type !== PDF && LIMITS.imageTypes.indexOf(type) < 0) throw new Error('unexpected file type');
      const bytes = asBytes(d.data);
      if (!bytes || !bytes.length) throw new Error('no file data');
      if (type === PDF && !startsWith(bytes, '%PDF-')) throw new Error('not a PDF');
      if (type !== PDF && looksLikeMarkup(bytes.subarray(0, 64))) throw new Error('not a picture');
      const url = G.URL.createObjectURL(new Blob([bytes], { type: type }));
      entry.result = { url: url, type: type, name: cleanName(d.name, type === PDF ? 'document.pdf' : TE.image) };
      return entry.result;
    });
    cache.set(key, entry);
    entry.promise.catch(() => { if (cache.get(key) === entry) cache.delete(key); });   // a later tap retries
    trimCache();
    return entry.promise;
  }

  function loaded(fbid, id) {
    const hit = cache.get(fbid + '/' + id);
    return hit && hit.result ? hit.result : null;
  }

  function trimCache() {
    if (cache.size <= CACHE_MAX) return;
    const showing = viewerImg ? viewerImg.getAttribute('src') : '';
    for (const [key, entry] of cache) {
      if (cache.size <= CACHE_MAX) break;
      if (!entry.result || entry.result.url === showing) continue;
      try { G.URL.revokeObjectURL(entry.result.url); } catch (e) {}
      cache.delete(key);
    }
  }

  /* ============================================================
     render(container, db, fbid, files[]) — saved attachments
  ============================================================ */
  let observer = null;
  const lazyJobs = new WeakMap();

  function lazy(node, job) {
    if (!observer && typeof G.IntersectionObserver === 'function') {
      try {
        observer = new G.IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting && !(en.intersectionRatio > 0)) return;
            const run = lazyJobs.get(en.target);
            observer.unobserve(en.target);
            lazyJobs.delete(en.target);
            if (run) run();
          });
        }, { rootMargin: '200px 0px' });
      } catch (e) { observer = null; }
    }
    if (!observer) { job(); return; }
    lazyJobs.set(node, job);
    observer.observe(node);
  }
  function forgetLazy(root) {
    if (!observer || !root || typeof root.querySelectorAll !== 'function') return;
    Array.prototype.forEach.call(root.querySelectorAll('.attach-item'), (node) => {
      if (lazyJobs.has(node)) { observer.unobserve(node); lazyJobs.delete(node); }
    });
  }

  function render(container, db, fbid, files) {
    if (!container || !hasDom()) return;
    forgetLazy(container);
    container.textContent = '';
    const list = cleanMeta(files);
    if (!list.length) return;
    let wrap = container;
    if (!(container.classList && container.classList.contains('attach-list'))) {
      wrap = document.createElement('div');
      wrap.className = 'attach-list';
      container.appendChild(wrap);
    }
    list.forEach((f) => wrap.appendChild(savedItem(db, fbid, f)));
  }

  function savedItem(db, fbid, f) {
    const isPdf = f.type === PDF;
    const item = document.createElement('div');
    item.className = 'attach-item';
    item.setAttribute('data-kind', isPdf ? 'pdf' : 'image');

    const open = document.createElement('button');
    open.type = 'button';
    open.setAttribute('aria-label', (isPdf ? TE.openPdf : TE.viewImage) + f.name);
    let img = null;
    if (isPdf) {
      const chip = document.createElement('span');
      chip.className = 'attach-pdf';
      chip.innerHTML = icon('file');
      open.appendChild(chip);
    } else {
      img = document.createElement('img');
      img.className = 'attach-thumb';
      img.alt = '';
      img.width = 64;
      img.height = 64;
      img.decoding = 'async';
      open.appendChild(img);
    }
    item.appendChild(open);
    item.appendChild(textSpan('attach-name', f.name));
    if (f.size > 0) item.appendChild(textSpan('attach-size', humanSize(f.size)));

    let failedOnce = false;
    const showFailure = () => {
      if (failedOnce) return;
      failedOnce = true;
      item.removeAttribute('aria-busy');
      const hadFocus = hasDom() && document.activeElement === open;
      const err = document.createElement('div');
      err.className = 'attach-error';
      err.setAttribute('role', 'alert');
      err.textContent = TE.failedLoad;
      if (open.parentNode === item) item.replaceChild(err, open);
      else item.appendChild(err);
      if (hadFocus) { err.setAttribute('tabindex', '-1'); focusQuietly(err); }
    };

    if (img) {
      img.addEventListener('error', () => { if (img.getAttribute('src')) showFailure(); });
      item.setAttribute('aria-busy', 'true');
      lazy(item, () => {
        load(db, fbid, f.id).then((res) => {
          img.src = res.url;
          item.removeAttribute('aria-busy');
        }, showFailure);
      });
    }

    open.addEventListener('click', () => {
      const ready = loaded(fbid, f.id);
      if (ready) { openViewer(ready); return; }
      if (!isPdf) { load(db, fbid, f.id).then(openViewer, showFailure); return; }
      // Not fetched yet. Open the tab now, inside the tap, so no pop-up
      // blocker stops it; point it at the PDF when the bytes arrive.
      let tab = null;
      try { tab = G.open('', '_blank'); } catch (e) { tab = null; }
      if (tab) {
        try { tab.opener = null; } catch (e) {}
        try { tab.document.title = f.name; tab.document.body.textContent = TE.openingPdf; } catch (e) {}
      }
      load(db, fbid, f.id).then((res) => {
        if (tab && !tab.closed) {
          try { tab.location.href = res.url; return; } catch (e) {}
        }
        openViewer(res);
      }, () => {
        if (tab) { try { tab.close(); } catch (e) {} }
        showFailure();
      });
    });
    return item;
  }

  function textSpan(cls, text) {
    const s = document.createElement('span');
    if (cls === 'attach-name') s.className = 'attach-name';
    else s.className = 'attach-size';
    s.textContent = text;
    return s;
  }

  /* ============================================================
     openViewer({ url, type, name })
  ============================================================ */
  let viewer = null;
  let viewerImg = null;
  let viewerClose = null;
  let viewerOpen = false;
  let viewerReturn = null;
  let viewerOverflow = '';

  function ensureViewer() {
    if (viewer && isConnected(viewer)) return true;
    if (!hasDom() || !document.body) return false;
    viewer = document.createElement('div');
    viewer.className = 'file-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.hidden = true;
    viewerImg = document.createElement('img');
    viewerImg.className = 'file-viewer-img';
    viewerImg.alt = '';
    viewerClose = document.createElement('button');
    viewerClose.type = 'button';
    viewerClose.className = 'file-viewer-close';
    viewerClose.setAttribute('aria-label', TE.close);
    viewerClose.innerHTML = icon('close');
    viewer.appendChild(viewerImg);
    viewer.appendChild(viewerClose);
    viewerClose.addEventListener('click', closeViewer);
    viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer(); });   // backdrop
    document.body.appendChild(viewer);
    return true;
  }

  function openViewer(file) {
    const f = file || {};
    const url = typeof f.url === 'string' ? f.url : '';
    if (url.indexOf('blob:') !== 0) return;                 // only bytes this page created or fetched
    const type = String(f.type || '');
    if (type === PDF) {
      try { G.open(url, '_blank', 'noopener'); } catch (e) {}
      return;
    }
    if (LIMITS.imageTypes.indexOf(type) < 0) return;
    if (!ensureViewer()) return;
    const name = cleanName(f.name, TE.image);
    viewer.setAttribute('aria-label', name);
    viewerImg.alt = name;
    viewerImg.src = url;
    if (!viewerOpen) {
      viewerOpen = true;
      viewerReturn = document.activeElement;
      viewerOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      viewer.hidden = false;
      // window + capture runs before every sheet's document-level listener.
      G.addEventListener('keydown', onViewerKey, true);
    }
    focusQuietly(viewerClose);
  }

  function closeViewer() {
    if (!viewerOpen) return;
    viewerOpen = false;
    G.removeEventListener('keydown', onViewerKey, true);
    viewer.hidden = true;
    viewerImg.removeAttribute('src');
    document.body.style.overflow = viewerOverflow;
    viewerOverflow = '';
    const back = viewerReturn;
    viewerReturn = null;
    if (isConnected(back) && back !== document.body) focusQuietly(back);
  }

  // The viewer is modal: its keys never reach the sheet underneath (Escape
  // would close that sheet too, Tab would be pulled back into its focus trap,
  // Space would count a bead on the Japamala page). Default actions such as
  // Enter / Space pressing the close button still happen.
  function onViewerKey(e) {
    if (!viewerOpen) return;
    const key = e.key;
    if (key === 'Escape' || key === 'Esc') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeViewer();
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      focusQuietly(viewerClose);
      return;
    }
    e.stopPropagation();
  }

  /* ============================================================
     createPicker({ button, input, list, onChange }) → Picker
  ============================================================ */
  const pickers = new WeakMap();   // input → teardown of an earlier picker on the same input

  function createPicker(opts) {
    const o = opts || {};
    const button = o.button || null;
    const input = o.input || null;
    const list = o.list || null;
    const onChange = typeof o.onChange === 'function' ? o.onChange : null;

    let items = [];        // Prepared[], in the order picked
    let errors = [];       // Telugu messages from the latest pick
    let pending = 0;       // files still being prepared
    let gen = 0;           // bumped by clear(): late results are dropped
    let queue = Promise.resolve();

    const picker = {
      files: () => items.slice(),
      count: () => items.length,
      busy: () => pending > 0,
      clear: clear
    };
    if (!hasDom()) return picker;

    function notify() {
      if (!onChange) return;
      try { onChange(picker); } catch (e) { console.warn('[attachments] onChange failed:', e); }
    }
    function revoke(p) {
      if (p && p.url) { try { G.URL.revokeObjectURL(p.url); } catch (e) {} }
    }
    function addError(msg) {
      if (msg && errors.indexOf(msg) < 0) errors.push(msg);
    }

    function draw() {
      if (!list) return;
      list.classList.add('attach-list');
      list.textContent = '';
      items.forEach((p, i) => list.appendChild(pickedItem(p, i)));
      if (pending > 0) {
        const wait = document.createElement('div');
        wait.className = 'attach-loading';
        wait.setAttribute('role', 'status');
        wait.textContent = TE.preparing;
        list.appendChild(wait);
      }
      errors.forEach((msg) => {
        const err = document.createElement('div');
        err.className = 'attach-error';
        err.setAttribute('role', 'alert');
        err.textContent = msg;
        list.appendChild(err);
      });
    }

    function pickedItem(p, i) {
      const isPdf = p.type === PDF;
      const item = document.createElement('div');
      item.className = 'attach-item';
      item.setAttribute('data-kind', isPdf ? 'pdf' : 'image');

      const open = document.createElement('button');
      open.type = 'button';
      open.setAttribute('aria-label', (isPdf ? TE.openPdf : TE.viewImage) + p.name);
      if (isPdf) {
        const chip = document.createElement('span');
        chip.className = 'attach-pdf';
        chip.innerHTML = icon('file');
        open.appendChild(chip);
      } else {
        const img = document.createElement('img');
        img.className = 'attach-thumb';
        img.alt = '';
        img.width = 64;
        img.height = 64;
        if (p.url) img.src = p.url;
        open.appendChild(img);
      }
      open.addEventListener('click', () => openViewer({ url: p.url, type: p.type, name: p.name }));
      item.appendChild(open);
      item.appendChild(textSpan('attach-name', p.name));
      item.appendChild(textSpan('attach-size', humanSize(p.size)));

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'attach-remove';
      rm.setAttribute('aria-label', TE.remove + p.name);
      rm.innerHTML = icon('close');
      rm.addEventListener('click', () => removeAt(i));
      item.appendChild(rm);
      return item;
    }

    function removeAt(i) {
      const gone = items[i];
      if (!gone) return;
      items.splice(i, 1);
      revoke(gone);
      errors = [];
      draw();
      notify();
      // Keep keyboard focus nearby: the next remove button, else the attach button.
      const rms = list ? list.querySelectorAll('.attach-remove') : [];
      focusQuietly(rms[Math.min(i, rms.length - 1)] || button);
    }

    function clear() {
      gen++;
      items.forEach(revoke);
      items = [];
      errors = [];
      pending = 0;
      draw();
      notify();
    }

    function onPick() {
      const picked = Array.prototype.slice.call((input && input.files) || []);
      try { input.value = ''; } catch (e) {}   // picking the same file again must fire change
      if (!picked.length) return;
      const mine = gen;
      errors = [];
      pending += picked.length;
      draw();
      notify();
      picked.forEach((file) => {
        queue = queue.then(() => {
          if (mine !== gen) return null;
          if (items.length >= LIMITS.maxFiles) { addError(TE.count); return null; }
          return prepare(file).then((p) => {
            if (mine !== gen) { revoke(p); return; }
            if (items.length >= LIMITS.maxFiles) { revoke(p); addError(TE.count); return; }
            items.push(p);
          }, (e) => {
            if (mine === gen) addError((e && e.te) || TE.decode);
          });
        }).catch(() => {}).then(() => {
          if (mine !== gen) return;
          pending = Math.max(0, pending - 1);
          draw();
          notify();
        });
      });
    }

    function onButton(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();   // never submit a form
      if (!input || input.disabled) return;
      try { input.click(); } catch (err) {}
    }

    if (input) {
      const old = pickers.get(input);
      if (old) old();
      input.addEventListener('change', onPick);
    }
    if (button) button.addEventListener('click', onButton);
    if (input) {
      pickers.set(input, () => {
        input.removeEventListener('change', onPick);
        if (button) button.removeEventListener('click', onButton);
      });
    }
    return picker;
  }

  /* ============================================================
     phoneDigits(text) and notifyLinks({...}) for the admin's buttons
  ============================================================ */
  // International digits without '+', or ''. Indian mobiles (6–9 + 9 digits)
  // get 91 in front; '+…' and '00…' numbers are kept as dialled.
  function phoneDigits(text) {
    const s = String(text == null ? '' : text).replace(/[^\s@]+@[^\s@]+/g, ' ');   // ignore digits inside emails
    const found = s.match(/\+?\d[\d\s().-]{5,}\d/g) || [];
    for (const raw of found) {
      const got = dialled(raw);
      if (got) return got;
      // "98765 43210 99887 76655": two numbers in one run. Try each run of
      // whole space-separated groups, left to right.
      const parts = raw.trim().split(/\s+/);
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j <= parts.length; j++) {
          if (i === 0 && j === parts.length) continue;
          const sub = dialled(parts.slice(i, j).join(' '));
          if (sub) return sub;
        }
      }
    }
    return '';
  }
  function dialled(raw) {
    const d = raw.replace(/\D/g, '');
    return raw.charAt(0) === '+' ? intl(d) : national(d);
  }
  function intl(d) {
    if (/^91[6-9]\d{9}$/.test(d)) return d;
    if (/^91/.test(d)) return '';                  // +91 but not a mobile
    return /^[1-9]\d{7,14}$/.test(d) ? d : '';
  }
  function national(d) {
    if (/^[6-9]\d{9}$/.test(d)) return '91' + d;
    if (/^0[6-9]\d{9}$/.test(d)) return '91' + d.slice(1);
    if (/^91[6-9]\d{9}$/.test(d)) return d;
    if (/^00\d+$/.test(d)) return intl(d.slice(2));
    return '';
  }

  function oneLine(v, max) {
    return clip(String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim(), max);
  }
  function replyText(v) {
    let s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (s.length > NOTIFY_REPLY_MAX) {
      s = clip(s, NOTIFY_REPLY_MAX);
      const cut = s.lastIndexOf(' ');
      if (cut > NOTIFY_REPLY_MAX * 0.7) s = s.slice(0, cut);
      s = s.replace(/[\s.,;:!?-]+$/, '') + '…';
    }
    return s;
  }

  function notifyText(o) {
    const name = oneLine(o.name, NOTIFY_NAME_MAX);
    const reply = replyText(o.reply);
    let site = oneLine(o.siteUrl, 300);
    if (!site && G.location && G.location.origin && /^https?:/.test(G.location.origin)) site = G.location.origin + '/';
    // A guest's text carries the reply itself; with no reply written yet, say
    // that we answered and where to read it (signing in claims the message).
    let tpl = (o.signedIn || !reply) ? NOTIFY_SIGNED_IN : NOTIFY_GUEST;
    if (!name) tpl = tpl.replace('నమస్కారం {name},', 'నమస్కారం,');
    const vals = { name: name, reply: reply, siteUrl: site };
    return tpl.replace(/\{(name|reply|siteUrl)\}/g, (m, k) => vals[k]);
  }

  function notifyLinks(opts) {
    const o = opts || {};
    const links = [];
    const text = notifyText(o);

    const email = String(o.email == null ? '' : o.email).trim();
    if (EMAIL_RE.test(email) && email.length <= 254) {
      const to = email.replace(/[^A-Za-z0-9@._+-]/gu, (c) => encodeURIComponent(c));
      links.push({
        kind: 'email',
        href: 'mailto:' + to + '?subject=' + encodeURIComponent(NOTIFY_SUBJECT) + '&body=' + encodeURIComponent(text.replace(/\n/g, '\r\n')),
        label: NOTIFY_LABELS.email
      });
    }

    const rawPhone = String(o.phone == null ? '' : o.phone).trim();
    const digits = /^[1-9]\d{7,14}$/.test(rawPhone) ? rawPhone : phoneDigits(rawPhone);
    if (digits) {
      // wa.me takes bare digits; the sms: link gets a '+' so every messaging
      // app reads it as an international number (sms:+919876543210).
      links.push({ kind: 'whatsapp', href: 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text), label: NOTIFY_LABELS.whatsapp });
      links.push({ kind: 'sms', href: 'sms:+' + digits + '?&body=' + encodeURIComponent(text), label: NOTIFY_LABELS.sms });
    }
    return links;
  }

  /* ---------- export ---------- */
  G.StotramFiles = {
    LIMITS: LIMITS,
    prepare: prepare,
    newMessageId: newMessageId,
    newClaimKey: newClaimKey,
    fileId: fileId,
    meta: meta,
    upload: upload,
    load: load,
    render: render,
    openViewer: openViewer,
    createPicker: createPicker,
    humanSize: humanSize,
    phoneDigits: phoneDigits,
    notifyLinks: notifyLinks
  };
})();
