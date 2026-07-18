/* ============================================================
   JAPAMALA — a vertical SCROLLING strand you pull one bead at a
   time (not a spinning wheel). Pure SVG/CSS, NO WebGL, so it works
   on every device with no settings.

   The 108 beads hang on a silk thread and slide through a fixed
   focus glow; the Guru (Meru) bead + tassel stay anchored at the
   bottom. Each count springs the strand down by exactly one bead
   with easing + a tiny bounce (inertia), only the moving beads
   animate, and beads nearer the focus are larger (a gentle depth
   lens). Warm wooden click + subtle thread friction per count, and
   a temple bell after a full mala (108).

   Data lives in the shared `track` object (track.japamala.total) so
   it rides backup/restore. Depends on globals from app.js: track,
   saveTrack, gaEvent.
============================================================ */
const JM_BEADS = 108;
const JM_CX = 150;        // strand centre x (viewBox units)
const JM_FOCUS_Y = 236;   // fixed counting-spot y
const JM_SPACING = 42;    // gap between beads along the strand
const JM_MARKERS = { 26: 1, 53: 1, 80: 1 };   // traditional marker beads (27th/54th/81st)

let jmBuilt = false;
let jmBeads = [];         // [{ g, r, tilt }]
let jmScroll = -1;        // animated float: index of the bead at the focus
let jmTarget = -1;
let jmVel = 0;
let jmRaf = null;

let jmMode = 'flow';      // 'flow' (complete mala, beads flow R→L) | 'strand' (pull) | 'full' (static loop)
try { jmMode = localStorage.getItem('jm_mode_v2') || 'flow'; } catch (e) {}
let jmFullBeads = [];
let jmFullBuilt = false;
let jmFlow = 0, jmFlowTarget = 0, jmFlowVel = 0;
let jmFlowBeads = [];
let jmFlowBuilt = false;

// deterministic per-bead "handcrafted" variation (stable across renders)
function jmRnd(n) { const x = Math.sin(n * 127.1 + 13.7) * 43758.545; return x - Math.floor(x); }

function ensureJapamalaData() {
    if (!track.japamala) track.japamala = { total: 0 };
    if (typeof track.japamala.total !== 'number') track.japamala.total = 0;
    return track.japamala;
}

/* ---------- open / build ---------- */
function openJapamala() {
    document.getElementById('searchOverlay').classList.remove('active');
    document.getElementById('daySheetOverlay').classList.remove('active');
    document.body.style.overflow = '';

    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.remove('active');
    document.getElementById('trackPage').classList.remove('active');
    document.getElementById('japamalaPage').classList.add('active');
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('headerActions').style.display = 'none';
    gaEvent('screen_view', { screen_name: 'Japamala' });

    buildJapamala();
    buildFull();
    buildFlow();
    const total0 = ensureJapamalaData().total;
    jmTarget = jmScrollForCount(total0); jmScroll = jmTarget; jmVel = 0;
    jmFlowTarget = total0; jmFlow = total0; jmFlowVel = 0;
    setJmMode(jmMode);                   // show the right look + render it
    renderCount();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- switch between the looks ---------- */
function setJmMode(mode) {
    jmMode = (mode === 'full' || mode === 'flow') ? mode : 'strand';
    try { localStorage.setItem('jm_mode_v2', jmMode); } catch (e) {}
    const stages = { strand: 'jmStageStrand', full: 'jmStageFull', flow: 'jmStageFlow' };
    Object.keys(stages).forEach(m => {
        const el = document.getElementById(stages[m]);
        if (el) el.style.display = (m === jmMode) ? '' : 'none';
    });
    document.querySelectorAll('.jm-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === jmMode));
    const total = ensureJapamalaData().total;
    if (jmMode === 'strand') { jmTarget = jmScrollForCount(total); jmScroll = jmTarget; jmVel = 0; renderStrand(); }
    else if (jmMode === 'flow') { jmFlowTarget = total; jmFlow = total; jmFlowVel = 0; renderFlow(); }
    else { renderFull(false); }
}

// which bead index should sit at the focus for a given cumulative total
function jmScrollForCount(total) {
    if (total <= 0) return -1;                 // nothing counted yet
    return (total - 1) % JM_BEADS;             // 0-indexed bead of the current round
}

function buildJapamala() {
    if (jmBuilt) return;
    const NS = 'http://www.w3.org/2000/svg';
    const beadsG = document.getElementById('jmBeads');
    jmBeads = [];
    for (let i = 0; i < JM_BEADS; i++) {
        const marker = JM_MARKERS[i];
        const r = (marker ? 15 : 13) + jmRnd(i) * 3;          // slight size imperfection
        const tilt = (jmRnd(i + 50) - 0.5) * 16;              // slight resting tilt
        const grad = marker ? 'gMarker' : 'gWood' + (1 + Math.floor(jmRnd(i + 9) * 3));

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'jm-bead');
        // bead body + a soft top highlight for a polished, hand-worn look
        g.innerHTML =
            `<circle r="${r.toFixed(1)}" fill="url(#${grad})" stroke="rgba(30,15,5,0.35)" stroke-width="0.6"/>` +
            `<ellipse cx="${(-r * 0.28).toFixed(1)}" cy="${(-r * 0.34).toFixed(1)}" rx="${(r * 0.34).toFixed(1)}" ry="${(r * 0.22).toFixed(1)}" fill="rgba(255,240,210,0.28)"/>`;
        beadsG.appendChild(g);
        jmBeads.push({ g, r, tilt });
    }

    // Guru (Meru) bead + gold cap + silk tassel, FIXED at the bottom
    const gy = 462;
    let threads = '';
    for (let k = -3; k <= 3; k++) {
        const x1 = JM_CX + k * 2.4, x2 = JM_CX + k * 4.6;
        threads += `<path class="jm-tassel-thread" d="M${x1} ${gy + 18} Q ${(x1 + k * 0.8).toFixed(1)} ${gy + 40}, ${x2.toFixed(1)} ${gy + 58}"/>`;
    }
    document.getElementById('jmGuru').innerHTML =
        `<circle cx="${JM_CX}" cy="${gy}" r="18" fill="url(#gGuru)" stroke="rgba(255,223,158,0.55)" stroke-width="0.8"/>` +
        `<ellipse cx="${JM_CX - 5}" cy="${gy - 6}" rx="6" ry="4" fill="rgba(255,240,210,0.30)"/>` +
        `<circle cx="${JM_CX}" cy="${gy - 16}" r="6.5" fill="url(#gGuruTop)"/>` +
        `<path class="jm-tassel-cap" d="M${JM_CX - 9} ${gy + 16} L${JM_CX + 9} ${gy + 16} L${JM_CX + 6} ${gy + 26} L${JM_CX - 6} ${gy + 26} Z" fill="url(#gGuruTop)"/>` +
        threads +
        `<circle cx="${JM_CX}" cy="${gy + 17}" r="3.5" fill="#b8860b"/>`;

    jmBuilt = true;
}

/* ---------- render (called every animation frame) ---------- */
function renderStrand() {
    for (let i = 0; i < JM_BEADS; i++) {
        const b = jmBeads[i];
        const rp = i - jmScroll;                       // relative position (0 = at focus)
        const sy = JM_FOCUS_Y - rp * JM_SPACING;       // upcoming above, counted below
        // cull anything well outside the window
        if (sy < -30 || sy > 452) { b.g.style.display = 'none'; continue; }
        b.g.style.display = '';
        const ad = Math.abs(rp);
        const scale = Math.max(0.5, 1.12 - ad * 0.055);
        let op = Math.max(0, 1 - Math.max(0, ad - 1) * 0.16);
        if (sy > 400) op *= Math.max(0, (452 - sy) / 52);   // fade into the guru at the bottom
        const rot = b.tilt + rp * 3.5;                      // gentle roll as it moves
        b.g.setAttribute('transform', `translate(${JM_CX} ${sy.toFixed(1)}) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(1)})`);
        b.g.setAttribute('opacity', op.toFixed(3));
        b.g.classList.toggle('cur', ad < 0.5);
    }
}

function renderCount() {
    const jm = ensureJapamalaData();
    const inRound = jm.total % JM_BEADS;
    const shown = (jm.total > 0 && inRound === 0) ? JM_BEADS : inRound;
    document.getElementById('jmCount').textContent = shown;
    const malas = Math.floor(jm.total / JM_BEADS);
    document.getElementById('jmRounds').textContent = malas > 0 ? ('పూర్తయిన మాలలు: ' + malas) : '';
}

/* ---------- LOOK 2: complete mala (full 108-bead loop) ---------- */
function buildFull() {
    if (jmFullBuilt) return;
    const NS = 'http://www.w3.org/2000/svg';
    const cx = 160, cy = 188, rx = 120, ry = 150, gap = 34;
    const g = document.getElementById('jmFullBeads');
    jmFullBeads = [];
    for (let i = 0; i < JM_BEADS; i++) {
        // bead 0 next to guru → up right → right-to-left over top → down left
        const deg = 165 - i * ((360 - gap) / (JM_BEADS - 1));
        const t = deg * Math.PI / 180;
        const x = cx + rx * Math.sin(t);
        const y = cy - ry * Math.cos(t);
        const marker = JM_MARKERS[i];
        const base = marker ? 'url(#gMarker)' : 'url(#gWood' + (1 + Math.floor(jmRnd(i + 9) * 3)) + ')';
        const r = (marker ? 5.4 : 4.6) + jmRnd(i) * 0.7;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1));
        c.setAttribute('r', r.toFixed(1));
        c.setAttribute('class', 'jm-fbead');
        c.setAttribute('fill', base);
        c.dataset.base = base;
        g.appendChild(c);
        jmFullBeads.push(c);
    }
    const by = cy + ry;
    let threads = '';
    for (let k = -3; k <= 3; k++) {
        const x1 = cx + k * 2, x2 = cx + k * 3.6;
        threads += `<path class="jm-tassel-thread" d="M${x1} ${by + 13} Q ${(x1 + k * 0.6).toFixed(1)} ${by + 30}, ${x2.toFixed(1)} ${by + 44}"/>`;
    }
    document.getElementById('jmFullGuru').innerHTML =
        `<circle cx="${cx}" cy="${by}" r="12" fill="url(#gGuru)" stroke="rgba(255,223,158,0.5)" stroke-width="0.7"/>` +
        `<circle cx="${cx}" cy="${by - 10}" r="5" fill="url(#gGuruTop)"/>` +
        `<path class="jm-tassel-cap" d="M${cx - 7} ${by + 11} L${cx + 7} ${by + 11} L${cx + 5} ${by + 19} L${cx - 5} ${by + 19} Z" fill="url(#gGuruTop)"/>` +
        threads +
        `<circle cx="${cx}" cy="${by + 12}" r="2.6" fill="#b8860b"/>`;
    jmFullBuilt = true;
}

function renderFull(pop) {
    const jm = ensureJapamalaData();
    const inRound = jm.total % JM_BEADS;
    const filled = (jm.total > 0 && inRound === 0) ? JM_BEADS : inRound;
    for (let i = 0; i < JM_BEADS; i++) {
        const c = jmFullBeads[i];
        if (!c) continue;
        c.setAttribute('fill', i < filled ? 'url(#gGold)' : c.dataset.base);
        c.classList.toggle('cur', i === filled - 1);
    }
    if (pop && filled > 0) {
        const c = jmFullBeads[filled - 1];
        if (c) { c.classList.remove('pop'); void c.getBoundingClientRect(); c.classList.add('pop'); }
    }
    const fc = document.getElementById('jmFullCount');
    if (fc) fc.textContent = filled;
}

/* ---------- LOOK 3: complete mala with beads flowing right→left ---------- */
const JM_FLOW = { cx: 170, cy: 194, rx: 128, ry: 150 };
function buildFlow() {
    if (jmFlowBuilt) return;
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.getElementById('jmFlowBeads');
    jmFlowBeads = [];
    for (let i = 0; i < JM_BEADS; i++) {
        const marker = JM_MARKERS[i];
        const r = (marker ? 8.0 : 6.8) + jmRnd(i) * 1.0;
        const tilt = (jmRnd(i + 50) - 0.5) * 20;
        const base = i === 0 ? 'url(#gGold)' : (marker ? 'url(#gMarker)' : 'url(#gWood' + (1 + Math.floor(jmRnd(i + 9) * 3)) + ')');
        const el = document.createElementNS(NS, 'g');
        el.setAttribute('class', 'jm-flowbead' + (i === 0 ? ' start' : ''));
        el.innerHTML =
            `<circle r="${r.toFixed(1)}" fill="${base}" stroke="rgba(30,15,5,0.35)" stroke-width="0.5"/>` +
            `<ellipse cx="${(-r * 0.3).toFixed(1)}" cy="${(-r * 0.34).toFixed(1)}" rx="${(r * 0.32).toFixed(1)}" ry="${(r * 0.2).toFixed(1)}" fill="rgba(255,240,210,0.28)"/>`;
        g.appendChild(el);
        jmFlowBeads.push({ el, r, tilt });
    }
    const cx = JM_FLOW.cx, by = JM_FLOW.cy + JM_FLOW.ry;
    let threads = '';
    for (let k = -3; k <= 3; k++) {
        const x1 = cx + k * 2.2, x2 = cx + k * 4;
        threads += `<path class="jm-tassel-thread" d="M${x1} ${by + 15} Q ${(x1 + k * 0.7).toFixed(1)} ${by + 34}, ${x2.toFixed(1)} ${by + 50}"/>`;
    }
    document.getElementById('jmFlowGuru').innerHTML =
        `<circle cx="${cx}" cy="${by}" r="15" fill="url(#gGuru)" stroke="rgba(255,223,158,0.55)" stroke-width="0.8"/>` +
        `<ellipse cx="${cx - 4}" cy="${by - 5}" rx="5" ry="3.4" fill="rgba(255,240,210,0.3)"/>` +
        `<circle cx="${cx}" cy="${by - 13}" r="5.5" fill="url(#gGuruTop)"/>` +
        `<path class="jm-tassel-cap" d="M${cx - 8} ${by + 13} L${cx + 8} ${by + 13} L${cx + 5.5} ${by + 22} L${cx - 5.5} ${by + 22} Z" fill="url(#gGuruTop)"/>` +
        threads +
        `<circle cx="${cx}" cy="${by + 14}" r="3" fill="#b8860b"/>`;
    jmFlowBuilt = true;
}

function renderFlow() {
    const { cx, cy, rx, ry } = JM_FLOW;
    const step = 360 / JM_BEADS;
    const curIdx = ((Math.round(jmFlow) % JM_BEADS) + JM_BEADS) % JM_BEADS;
    for (let i = 0; i < JM_BEADS; i++) {
        const b = jmFlowBeads[i];
        if (!b) continue;
        const phi = ((i - jmFlow) * step) * Math.PI / 180;
        const x = cx + rx * Math.sin(phi);
        const y = cy - ry * Math.cos(phi);
        const c = Math.cos(phi);                       // 1 at top, -1 at bottom
        const scale = 1 + Math.max(0, c) * 0.22;       // beads at the top (focus) a touch larger
        const roll = b.tilt - jmFlow * 2;              // gentle roll as the strand moves
        b.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)}) rotate(${roll.toFixed(1)})`);
        b.el.classList.toggle('cur', i === curIdx);
    }
    const fc = document.getElementById('jmFlowCount');
    if (fc) {
        const jm = ensureJapamalaData();
        const inR = jm.total % JM_BEADS;
        fc.textContent = (jm.total > 0 && inR === 0) ? JM_BEADS : inR;
    }
}

/* ---------- spring animation (inertia + tiny bounce) ---------- */
function jmAnimate() {
    const k = 0.16, damp = 0.72;
    if (jmMode === 'flow') {
        jmFlowVel = (jmFlowVel + (jmFlowTarget - jmFlow) * k) * damp;
        jmFlow += jmFlowVel;
        renderFlow();
        if (Math.abs(jmFlowVel) > 0.002 || Math.abs(jmFlowTarget - jmFlow) > 0.004) jmRaf = requestAnimationFrame(jmAnimate);
        else { jmFlow = jmFlowTarget; jmFlowVel = 0; renderFlow(); jmRaf = null; }
    } else {
        jmVel = (jmVel + (jmTarget - jmScroll) * k) * damp;
        jmScroll += jmVel;
        renderStrand();
        if (Math.abs(jmVel) > 0.002 || Math.abs(jmTarget - jmScroll) > 0.004) jmRaf = requestAnimationFrame(jmAnimate);
        else { jmScroll = jmTarget; jmVel = 0; renderStrand(); jmRaf = null; }
    }
}
function jmStartAnim() { if (!jmRaf) jmRaf = requestAnimationFrame(jmAnimate); }

/* ---------- counting ---------- */
function bumpJapa() {
    jmAudio();
    const jm = ensureJapamalaData();
    jm.total += 1;
    saveTrack();

    const newTarget = jmScrollForCount(jm.total);
    // new round wrapped back to bead 0 → snap to the start so it doesn't rewind 108 beads
    if (newTarget < jmScroll - 10) { jmScroll = -1; jmVel = 0; }
    jmTarget = newTarget;
    jmFlowTarget = jm.total;
    if (jmMode === 'full') renderFull(true); else jmStartAnim();

    jmPlayClick();
    jmThreadFriction();
    jmBuzz(12);
    if (jm.total % JM_BEADS === 0) {
        jmPlayBell();
        jmBuzz([40, 30, 120]);
        jmCelebrate();
        gaEvent('japamala_complete', { malas: jm.total / JM_BEADS });
    } else {
        gaEvent('japamala_count');
    }
    renderCount();
}

function resetJapa() {
    const jm = ensureJapamalaData();
    if (!jm.total) return;
    if (!confirm('జపమాల count 0కి తిరిగి సెట్ చేయాలా? / Reset japamala to 0?')) return;
    jm.total = 0;
    gaEvent('japamala_reset');
    saveTrack();
    jmTarget = -1; jmScroll = -1; jmVel = 0;
    jmFlowTarget = 0; jmFlow = 0; jmFlowVel = 0;
    if (jmMode === 'strand') renderStrand();
    else if (jmMode === 'flow') renderFlow();
    else renderFull(false);
    renderCount();
}

function jmCelebrate() {
    const svg = document.getElementById(jmMode === 'full' ? 'jmSvgFull' : (jmMode === 'flow' ? 'jmSvgFlow' : 'jmSvg'));
    if (svg) { svg.classList.remove('celebrate'); void svg.getBoundingClientRect(); svg.classList.add('celebrate'); }
    jmConfetti();
}

/* ---------- lightweight confetti (no library) ---------- */
function jmConfetti() {
    const colors = ['#ffdf9e', '#d9b25a', '#b5341f', '#f6ead2', '#e8c25c'];
    for (let i = 0; i < 60; i++) {
        const d = document.createElement('div');
        d.className = 'jm-confetti';
        d.style.left = Math.random() * 100 + 'vw';
        d.style.background = colors[i % colors.length];
        d.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
        d.style.animationDuration = (1.8 + Math.random() * 1.2).toFixed(2) + 's';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 3200);
    }
}

/* ---------- haptics ---------- */
function jmBuzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

/* ---------- audio (Web Audio) ---------- */
let jmCtx = null;
function jmAudio() {
    if (!jmCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) jmCtx = new AC();
    }
    if (jmCtx && jmCtx.state === 'suspended') jmCtx.resume();
    return jmCtx;
}
// unlock audio on first interaction anywhere (fixes "no sound" on first tap)
let jmAudioUnlocked = false;
function jmUnlockAudio() {
    if (jmAudioUnlocked) return;
    const c = jmAudio();
    if (!c) return;
    try {
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
    if (c.state === 'suspended') c.resume();
    jmAudioUnlocked = true;
}
['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    window.addEventListener(ev, jmUnlockAudio, { passive: true }));

// warm wooden bead knock (no harsh/artificial tick)
function jmPlayClick() {
    const c = jmAudio();
    if (!c) return;
    const t = c.currentTime;
    const out = c.createGain(); out.gain.value = 0.85; out.connect(c.destination);

    const body = c.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    body.frequency.exponentialRampToValueAtTime(95, t + 0.05);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.7, t + 0.005);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    body.connect(bg).connect(out);

    const knock = c.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(760, t);
    knock.frequency.exponentialRampToValueAtTime(430, t + 0.03);
    const kg = c.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.exponentialRampToValueAtTime(0.18, t + 0.003);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    knock.connect(kg).connect(out);

    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.04), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const noise = c.createBufferSource(); noise.buffer = buf;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 2600;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.15, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    noise.connect(nf).connect(ng).connect(out);

    body.start(t); body.stop(t + 0.14);
    knock.start(t); knock.stop(t + 0.06);
    noise.start(t); noise.stop(t + 0.05);
}

// very subtle silk-thread friction swish under the click
function jmThreadFriction() {
    const c = jmAudio();
    if (!c) return;
    const t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.13), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const e = 1 - i / d.length; d[i] = (Math.random() * 2 - 1) * e * e; }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = 0.045;   // barely there
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t); src.stop(t + 0.14);
}

// temple bell after completing a mala (108)
function jmPlayBell() {
    const c = jmAudio();
    if (!c) return;
    const t = c.currentTime;
    const out = c.createGain(); out.gain.value = 0.5; out.connect(c.destination);
    [[523.25, 1], [1046.5, 0.5], [1567.98, 0.25], [2349, 0.12]].forEach(([f, a]) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * a, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + 3.3);
    });
}

/* Space bar advances while the japamala page is open */
window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.key === ' ') &&
        document.getElementById('japamalaPage') &&
        document.getElementById('japamalaPage').classList.contains('active')) {
        e.preventDefault();
        bumpJapa();
    }
});
