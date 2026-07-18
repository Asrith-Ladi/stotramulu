// ============ STOTRAM DATA ============
// Per-stotram data lives in data/stotras/<key>.js — each file registers
// itself onto window.STOTRAS_DATA. Add a new stotram by creating a file
// there and adding its <script> tag in index.html.
const stotramConfig = window.STOTRAS_DATA || {};
const origins = Object.fromEntries(
    Object.entries(stotramConfig).map(([k, v]) => [k, v.origin || ''])
);
const meanings = Object.fromEntries(
    Object.entries(stotramConfig).map(([k, v]) => [k, v.meanings || {}])
);

// ============ APP ============
let currentFontSize = 22;
let currentType = null;

function createParticles() {
    const c = document.getElementById('particles');
    for (let i = 0; i < 35; i++) {
        const p = document.createElement('div');
        p.className = 'particle ' + (Math.random() > 0.7 ? 'big' : 'gold');
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 10 + 's';
        p.style.animationDuration = (7 + Math.random() * 8) + 's';
        c.appendChild(p);
    }
}

function openReader(type) {
    const cfg = stotramConfig[type];
    if (!cfg) return;
    currentType = type;

    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.add('active');
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('headerActions').style.display = 'none';
    gaEvent('screen_view', { screen_name: 'Reader: ' + type });
    gaEvent('open_stotram', { stotram: type });

    const ts = document.getElementById('readerTitleSection');
    ts.className = 'reader-title-section ' + cfg.theme;
    document.getElementById('readerTitle').textContent = cfg.title;
    document.getElementById('readerSubtitle').textContent = cfg.subtitle;

    const bg = document.getElementById('readerDeityBg');
    bg.innerHTML = `<svg style="width:100%;height:100%;color:${cfg.svgColor}"><use href="${cfg.svgId}"/></svg>`;

    const originEl = document.getElementById('originBlock');
    const originText = origins[type];
    if (originText) {
        originEl.innerHTML = `<span class="origin-label">📜 ఉద్భవం &amp; ప్రాముఖ్యత</span><div class="origin-text">${originText}</div>`;
        originEl.classList.add('visible');
    } else {
        originEl.classList.remove('visible');
        originEl.innerHTML = '';
    }

    renderSlokams(cfg.data, type);
    initStotramCounter(type, cfg.title);
    clearReaderSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
    // close any open overlays/sheets and release scroll lock
    document.getElementById('searchOverlay').classList.remove('active');
    document.getElementById('daySheetOverlay').classList.remove('active');
    document.body.style.overflow = '';
    activeDay = null;

    document.getElementById('homePage').style.display = 'flex';
    document.getElementById('readerPage').classList.remove('active');
    document.getElementById('trackPage').classList.remove('active');
    const jmPage = document.getElementById('japamalaPage');
    if (jmPage) jmPage.classList.remove('active');
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('headerActions').style.display = 'flex';
    document.getElementById('readerDeityBg').innerHTML = '';
    currentType = null;
    renderHomePradakshina();
    gaEvent('screen_view', { screen_name: 'Home' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSlokams(data, type) {
    const c = document.getElementById('slokamContainer');
    c.innerHTML = '';
    const meaningSet = (type && meanings[type]) || {};
    data.forEach((item, idx) => {
        const meaning = meaningSet[idx];
        const meaningHtml = meaning
            ? `<div class="slokam-meaning"><span class="meaning-label">అర్థం</span><br>${meaning}</div>`
            : '';
        const b = document.createElement('div');
        b.className = 'slokam-block';
        b.innerHTML = `<span class="slokam-number">${item.number}</span><div class="slokam-text" style="font-size:${currentFontSize}px">${item.text}</div>${meaningHtml}`;
        c.appendChild(b);
    });
}

function changeFontSize(d) {
    currentFontSize = Math.max(16, Math.min(36, currentFontSize + d));
    document.getElementById('fontSizeDisplay').textContent = currentFontSize;
    document.querySelectorAll('.slokam-text').forEach(e => e.style.fontSize = currentFontSize + 'px');
}

function toggleMeanings() {
    const enabled = !document.body.classList.contains('show-meanings');
    document.body.classList.toggle('show-meanings', enabled);
    document.getElementById('meaningToggle').classList.toggle('on', enabled);
    try { localStorage.setItem('showMeanings', enabled ? '1' : '0'); } catch (e) {}
    // If a search is active, re-run it so meaning matches appear/disappear with the toggle.
    const q = document.getElementById('readerSearchInput');
    if (q && q.value.trim()) onReaderSearch(q.value);
}

function initMeaningsToggle() {
    let saved = '0';
    try { saved = localStorage.getItem('showMeanings') || '0'; } catch (e) {}
    if (saved === '1') {
        document.body.classList.add('show-meanings');
        document.getElementById('meaningToggle').classList.add('on');
    }
}

/* ============================================================
   IN-STOTRAM SEARCH — highlight matches in slokam text + Artham,
   step through with ↑/↓ (or Shift+Enter / Enter), Esc to clear.

   Telugu queries: literal substring.
   English queries: phonetic — "padmanabha" matches "పద్మనాభ" by
   reducing both to a consonant skeleton (drops vowels, collapses
   aspirated/retroflex distinctions). Highlights whole word.
============================================================ */
let readerMatches = [];
let readerMatchIdx = 0;
let readerSearchTimer = null;       // debounce handle (typing fires after 250ms pause)
let readerScrolledOnce = false;     // whether user has scrolled to a match in the current result set

// Telugu consonants → single Roman letter (retroflex/dental + aspirated/non
// collapse on purpose — casual Roman typists don't distinguish them).
const TELUGU_CONS_MAP = {
    'క':'k','ఖ':'k','గ':'g','ఘ':'g','ఙ':'n',
    'చ':'c','ఛ':'c','జ':'j','ఝ':'j','ఞ':'n',
    'ట':'t','ఠ':'t','డ':'d','ఢ':'d','ణ':'n',
    'త':'t','థ':'t','ద':'d','ధ':'d','న':'n',
    'ప':'p','ఫ':'p','బ':'b','భ':'b','మ':'m',
    'య':'y','ర':'r','ల':'l','వ':'v',
    'శ':'s','ష':'s','స':'s','హ':'h',
    'ళ':'l','ఱ':'r',
    // Vocalic R (independent + matra) → 'r' so "krishna"/"కృష్ణ" lines up
    'ఋ':'r','ౠ':'r','ృ':'r','ౄ':'r',
    // Visarga (anusvara handled contextually below)
    'ః':'h'
};
const TELUGU_LABIALS = 'పఫబభమ';
function teluguSkeleton(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === 'ం') {
            // Anusvara: 'm' before labials (గంభీర → gambhir), 'n' otherwise (గోవింద → govinda).
            let j = i + 1;
            while (j < text.length && !TELUGU_CONS_MAP[text[j]]) j++;
            out += TELUGU_LABIALS.includes(text[j] || '') ? 'm' : 'n';
        } else if (TELUGU_CONS_MAP[ch]) {
            out += TELUGU_CONS_MAP[ch];
        }
    }
    return out;
}
function romanSkeleton(text) {
    let s = text.toLowerCase().replace(/[^a-z]/g, '');
    s = s.replace(/x/g, 'ks').replace(/w/g, 'v');
    s = s.replace(/([kgcjtdpb])h/g, '$1').replace(/sh/g, 's');
    s = s.replace(/[aeiou]/g, '');
    return s;
}
function isAsciiQuery(q) {
    return /[a-zA-Z]/.test(q) && !/[ఀ-౿]/.test(q);
}

function onReaderSearch(query) {
    const q = (query || '').trim();
    const clearBtn = document.getElementById('readerSearchClear');
    if (clearBtn) clearBtn.style.display = q ? '' : 'none';

    // Strip any existing highlights, then rejoin adjacent text nodes.
    document.querySelectorAll('#slokamContainer mark').forEach(m => {
        const tn = document.createTextNode(m.textContent);
        m.parentNode.replaceChild(tn, m);
    });
    document.querySelectorAll('#slokamContainer .slokam-text, #slokamContainer .slokam-meaning')
        .forEach(el => el.normalize());

    readerMatches = [];
    readerMatchIdx = 0;
    if (!q) { updateMatchCount(); updateNavButtons(); return; }

    const ascii = isAsciiQuery(q);
    const querySkel = ascii ? romanSkeleton(q) : null;
    if (ascii && querySkel.length < 2) {
        // Too short to be useful (e.g., "a" or "k") — don't pollute with thousands of hits.
        updateMatchCount(); updateNavButtons(); return;
    }

    const includeMeanings = document.body.classList.contains('show-meanings');
    const sel = includeMeanings
        ? '#slokamContainer .slokam-text, #slokamContainer .slokam-meaning'
        : '#slokamContainer .slokam-text';
    const targets = document.querySelectorAll(sel);
    const lowerQ = q.toLowerCase();

    targets.forEach(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let n; while ((n = walker.nextNode())) textNodes.push(n);
        textNodes.forEach(tn => {
            const text = tn.nodeValue;
            const parent = tn.parentNode;

            if (ascii) {
                // Word-level phonetic match. Each whitespace-separated token's
                // consonant skeleton is checked for the query skeleton; whole word
                // gets highlighted on hit.
                const tokens = text.split(/(\s+)/);
                let hasMatch = false;
                const frags = [];
                for (const tok of tokens) {
                    if (!tok) continue;
                    if (/^\s+$/.test(tok)) { frags.push(document.createTextNode(tok)); continue; }
                    const tokSkel = teluguSkeleton(tok);
                    if (tokSkel.length >= 2 && tokSkel.includes(querySkel)) {
                        const mark = document.createElement('mark');
                        mark.textContent = tok;
                        frags.push(mark);
                        readerMatches.push(mark);
                        hasMatch = true;
                    } else {
                        frags.push(document.createTextNode(tok));
                    }
                }
                if (hasMatch) {
                    frags.forEach(f => parent.insertBefore(f, tn));
                    parent.removeChild(tn);
                }
            } else {
                // Telugu literal substring path.
                const lower = text.toLowerCase();
                let pos = 0, idx;
                const frags = [];
                while ((idx = lower.indexOf(lowerQ, pos)) !== -1) {
                    if (idx > pos) frags.push(document.createTextNode(text.substring(pos, idx)));
                    const mark = document.createElement('mark');
                    mark.textContent = text.substring(idx, idx + q.length);
                    frags.push(mark);
                    readerMatches.push(mark);
                    pos = idx + q.length;
                }
                if (pos === 0) return;
                if (pos < text.length) frags.push(document.createTextNode(text.substring(pos)));
                frags.forEach(f => parent.insertBefore(f, tn));
                parent.removeChild(tn);
            }
        });
    });

    if (readerMatches.length) {
        readerMatches[0].classList.add('current');
        // Don't auto-scroll on every keystroke — only on Enter / ↓ / ↑.
        gaEvent('reader_search', { stotram: currentType || '', q: q.slice(0, 32), hits: readerMatches.length, mode: ascii ? 'phonetic' : 'literal' });
    }
    readerScrolledOnce = false;
    updateMatchCount();
    updateNavButtons();
}

function updateMatchCount() {
    const el = document.getElementById('readerSearchCount');
    if (!el) return;
    el.textContent = readerMatches.length ? (readerMatchIdx + 1) + '/' + readerMatches.length : '';
}
function updateNavButtons() {
    const has = readerMatches.length > 0;
    document.querySelectorAll('.reader-search .rs-nav').forEach(b => b.disabled = !has);
}

function nextSearchMatch() {
    if (!readerMatches.length) return;
    if (!readerScrolledOnce) {
        // First nav after a fresh search: scroll to current (match[0]) without advancing.
        readerMatches[readerMatchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        readerScrolledOnce = true;
        return;
    }
    readerMatches[readerMatchIdx].classList.remove('current');
    readerMatchIdx = (readerMatchIdx + 1) % readerMatches.length;
    readerMatches[readerMatchIdx].classList.add('current');
    readerMatches[readerMatchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateMatchCount();
}
function prevSearchMatch() {
    if (!readerMatches.length) return;
    if (!readerScrolledOnce) {
        readerMatches[readerMatchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        readerScrolledOnce = true;
        return;
    }
    readerMatches[readerMatchIdx].classList.remove('current');
    readerMatchIdx = (readerMatchIdx - 1 + readerMatches.length) % readerMatches.length;
    readerMatches[readerMatchIdx].classList.add('current');
    readerMatches[readerMatchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateMatchCount();
}
// Debounced wrapper called from oninput — search runs once typing pauses.
function onReaderSearchInput(query) {
    clearTimeout(readerSearchTimer);
    readerSearchTimer = setTimeout(() => { readerSearchTimer = null; onReaderSearch(query); }, 250);
}
function flushReaderSearch(query) {
    if (readerSearchTimer) { clearTimeout(readerSearchTimer); readerSearchTimer = null; onReaderSearch(query); }
}
function onReaderSearchKey(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        flushReaderSearch(event.target.value);    // make sure search is up-to-date before navigating
        if (event.shiftKey) prevSearchMatch(); else nextSearchMatch();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        clearReaderSearch();
        event.target.blur();
    }
}
function clearReaderSearch() {
    clearTimeout(readerSearchTimer); readerSearchTimer = null;
    const inp = document.getElementById('readerSearchInput');
    if (inp) inp.value = '';
    onReaderSearch('');
}

// Mic for in-stotram search: speak in Telugu, transcript drops into the
// search box and runs the literal-match path. Reuses the same SpeechRecognition
// API that powers the home-page search and feedback form.
function startReaderVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('readerMicBtn');
    if (!SR) {
        alert('ఈ బ్రౌజర్‌లో వాయిస్ సదుపాయం లేదు. దయచేసి టైప్ చేయండి.');
        return;
    }
    const inp = document.getElementById('readerSearchInput');
    const rec = new SR();
    rec.lang = 'te-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
        const text = e.results[0][0].transcript.trim();
        if (!text) return;
        inp.value = text;
        clearTimeout(readerSearchTimer); readerSearchTimer = null;
        onReaderSearch(text);
        gaEvent('reader_search_voice', { stotram: currentType || '', q: text.slice(0, 32) });
    };
    rec.onend = () => btn && btn.classList.remove('listening');
    rec.onerror = (e) => {
        btn && btn.classList.remove('listening');
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
            alert('🎤 మైక్ అనుమతి ఇవ్వండి, లేదా టైప్ చేయండి.');
    };
    try { rec.start(); btn && btn.classList.add('listening'); } catch (e) { /* already running */ }
}

window.addEventListener('scroll', () => {
    document.getElementById('scrollTopBtn').classList.toggle('visible', window.scrollY > 400);
});

/* ============================================================
   SEARCH + VOICE
   Index is built automatically from stotramConfig, so any new
   stotram added there becomes searchable with no extra work.
============================================================ */
function buildSearchIndex() {
    const icons = {
        vishnu:'🔱', lalitha:'🪷', shiva:'🙏', bilva:'🌿', venkat:'⛰️', ganesha:'🐘',
        hanuman:'🚩', lakshmi:'🪙', saibaba:'🕉️', ayyappa:'🛕', durga:'🗡️',
        govinda:'🪈', chalisa:'🚩', manidweepa:'🌺', harati:'🪔'
    };
    return Object.keys(stotramConfig).filter(type => !stotramConfig[type].hidden).map(type => {
        const cfg = stotramConfig[type];
        const themeKey = (cfg.theme || '').replace('-theme', '');
        return { type, title: cfg.title, subtitle: cfg.subtitle || '', icon: icons[themeKey] || '🕉️' };
    });
}
let searchIndex = [];

function openSearch() {
    if (!searchIndex.length) searchIndex = buildSearchIndex();
    document.getElementById('searchOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    gaEvent('screen_view', { screen_name: 'Search' });
    runSearch('');
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
}
function closeSearch() {
    document.getElementById('searchOverlay').classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('searchInput').value = '';
}
function runSearch(q) {
    const results = document.getElementById('searchResults');
    const query = (q || '').trim().toLowerCase();
    let list = searchIndex;
    if (query) {
        list = searchIndex.filter(s =>
            s.title.toLowerCase().includes(query) ||
            s.subtitle.toLowerCase().includes(query)
        );
    }
    if (!list.length) {
        results.innerHTML = '<div class="search-empty">😔 ఏమీ దొరకలేదు. వేరే పేరు ప్రయత్నించండి.</div>';
        return;
    }
    results.innerHTML = list.map(s =>
        `<div class="search-result" onclick="pickSearch('${s.type}')">
            <span class="sr-icon">${s.icon}</span>
            <div>
                <div class="sr-title">${s.title}</div>
                <div class="sr-sub">${s.subtitle}</div>
            </div>
        </div>`
    ).join('');
}
function pickSearch(type) {
    closeSearch();
    openReader(type);
}

let recognition = null;
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('micBtn');
    if (!SR) { micBtn.style.display = 'none'; return; }
    recognition = new SR();
    recognition.lang = 'te-IN';            // Telugu; works alongside typed search
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const input = document.getElementById('searchInput');
        input.value = text;
        runSearch(text);
        document.getElementById('searchHint').textContent = '🔎 "' + text + '" కోసం వెతుకుతోంది…';
    };
    recognition.onend = () => micBtn.classList.remove('listening');
    recognition.onerror = (e) => {
        micBtn.classList.remove('listening');
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
            document.getElementById('searchHint').textContent = '🎤 మైక్ అనుమతి ఇవ్వండి, లేదా టైప్ చేయండి.';
    };
}
function startVoice() {
    if (!recognition) return;
    const micBtn = document.getElementById('micBtn');
    try {
        recognition.start();
        micBtn.classList.add('listening');
        document.getElementById('searchHint').textContent = '🎙️ వింటున్నాను… ఇప్పుడు చెప్పండి';
    } catch (e) { /* already started */ }
}

/* ============================================================
   POOJA TRACK : calendar + pradakshina/japa counters + mokkulu
   All data stored locally on the device (localStorage).
============================================================ */
const TRACK_KEY = 'poojaTrack_v1';
let track = loadTrack();
function loadTrack() {
    try { return JSON.parse(localStorage.getItem(TRACK_KEY)) || { days: {}, mokkulu: [] }; }
    catch (e) { return { days: {}, mokkulu: [] }; }
}
function saveTrack() {
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (e) {}
}

const teMonths = ['జనవరి','ఫిబ్రవరి','మార్చి','ఏప్రిల్','మే','జూన్','జూలై','ఆగస్టు','సెప్టెంబర్','అక్టోబర్','నవంబర్','డిసెంబర్'];
const teWeekdays = ['ఆది','సోమ','మంగళ','బుధ','గురు','శుక్ర','శని'];
function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function todayStr() { return ymd(new Date()); }

let trackMonths = [];   // oldest -> newest (current month last)
let monthIdx = 0;       // currently viewed month index

function openTrack() {
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.remove('active');
    document.getElementById('trackPage').classList.add('active');
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('headerActions').style.display = 'none';
    gaEvent('screen_view', { screen_name: 'Track' });
    buildMonths();
    renderMonths();
    renderMokkulu();
    showDueReminders();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildMonths() {
    trackMonths = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {               // this month + previous 6
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        trackMonths.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    monthIdx = trackMonths.length - 1;           // default = current month
}

function dayHasData(dateStr) {
    const d = track.days[dateStr];
    if (!d) return false;
    if (d.pradakshina > 0) return true;
    return Array.isArray(d.japa) && d.japa.some(j => j.count > 0);
}

function renderMonths() {
    const strip = document.getElementById('monthStrip');
    const today = todayStr();
    strip.innerHTML = trackMonths.map(({y, m}) => {
        const first = new Date(y, m, 1).getDay();          // 0=Sun
        const daysIn = new Date(y, m + 1, 0).getDate();
        let cells = teWeekdays.map(w => `<div class="cal-weekday">${w}</div>`).join('');
        for (let i = 0; i < first; i++) cells += '<div class="cal-day empty"></div>';
        for (let day = 1; day <= daysIn; day++) {
            const ds = y + '-' + String(m+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
            const isFuture = ds > today;
            const cls = ['cal-day'];
            if (isFuture) cls.push('future');
            if (ds === today) cls.push('today');
            if (dayHasData(ds)) cls.push('has-data');
            const dot = dayHasData(ds) ? '<span class="dot"></span>' : '';
            const onclick = isFuture ? '' : ` onclick="openDay('${ds}')"`;
            cells += `<div class="${cls.join(' ')}"${onclick}>${day}${dot}</div>`;
        }
        return `<div class="month-card"><div class="cal-grid">${cells}</div></div>`;
    }).join('');
    updateMonthView();
    // jump strip to current month without animation
    requestAnimationFrame(() => {
        strip.scrollLeft = monthIdx * strip.clientWidth;
    });
    // keep label/arrows in sync when user swipes
    strip.onscroll = () => {
        const idx = Math.round(strip.scrollLeft / strip.clientWidth);
        if (idx !== monthIdx) { monthIdx = idx; updateMonthView(); }
    };
}
function updateMonthView() {
    const { y, m } = trackMonths[monthIdx];
    document.getElementById('monthLabel').textContent = teMonths[m] + ' ' + y;
    document.getElementById('prevMonthBtn').disabled = (monthIdx === 0);
    document.getElementById('nextMonthBtn').disabled = (monthIdx === trackMonths.length - 1);
}
function shiftMonth(dir) {
    const next = monthIdx + dir;
    if (next < 0 || next >= trackMonths.length) return;
    monthIdx = next;
    const strip = document.getElementById('monthStrip');
    strip.scrollTo({ left: monthIdx * strip.clientWidth, behavior: 'smooth' });
    updateMonthView();
}

/* ---- Day detail sheet ---- */
let activeDay = null;
function openDay(dateStr) {
    activeDay = dateStr;
    if (!track.days[dateStr]) track.days[dateStr] = { pradakshina: 0, japa: [] };
    const [y, m, d] = dateStr.split('-');
    document.getElementById('sheetDate').textContent = parseInt(d) + ' ' + teMonths[parseInt(m)-1] + ' ' + y;
    renderDaySheet();
    document.getElementById('daySheetOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeDay() {
    document.getElementById('daySheetOverlay').classList.remove('active');
    document.body.style.overflow = '';
    activeDay = null;
    renderMonths();   // refresh dots on calendar
}
function renderDaySheet() {
    const d = track.days[activeDay];
    const japaHtml = (d.japa || []).map((j, i) => {
        const done = j.target > 0 && j.count >= j.target;
        const targetTxt = j.target > 0
            ? `<div class="count-target ${done ? 'done' : ''}" onclick="editTarget(${i})">${done ? '✅ ' : ''}లక్ష్యం: ${j.target} ${done ? '— పూర్తయింది' : '(మార్చు)'}</div>`
            : `<div class="count-target" onclick="editTarget(${i})">లక్ష్యం పెట్టండి</div>`;
        return `<div class="counter-card">
            <div class="counter-head">
                <span class="counter-name">📖 ${j.name}</span>
                <div class="counter-actions">
                    <button class="counter-reset" onclick="resetJapa(${i})" title="0కి తిరిగి సెట్ చేయండి / Reset to 0" aria-label="Reset">↻</button>
                    <span class="counter-del" onclick="removeJapa(${i})" title="తీసివేయి">🗑️</span>
                </div>
            </div>
            <div class="counter-row">
                <button class="count-btn" onclick="bumpJapa(${i},-1)">−</button>
                <div class="count-center"><div class="count-display">${j.count}</div>${targetTxt}</div>
                <button class="count-btn" onclick="bumpJapa(${i},1)">＋</button>
            </div>
        </div>`;
    }).join('');

    const chips = buildSearchIndex().slice(0, 6).map(s =>
        `<span class="add-chip" onclick="addJapa('${s.title.replace(/'/g, "\\'")}')">＋ ${s.title}</span>`
    ).join('');

    document.getElementById('sheetBody').innerHTML = `
        <div class="counter-card">
            <div class="counter-head">
                <span class="counter-name">🕉️ ప్రదక్షిణలు</span>
                <button class="counter-reset" onclick="resetDayPradakshina()" title="0కి తిరిగి సెట్ చేయండి / Reset to 0" aria-label="Reset">↻</button>
            </div>
            <div class="counter-row">
                <button class="count-btn" onclick="bumpPradakshina(-1)">−</button>
                <div class="count-center"><div class="count-display">${d.pradakshina}</div><div class="count-target">Pradakshina</div></div>
                <button class="count-btn" onclick="bumpPradakshina(1)">＋</button>
            </div>
        </div>
        <div class="track-card-title" style="margin-top:20px;">📿 పారాయణం / జపం</div>
        ${japaHtml || '<div class="track-empty">ఇంకా ఏ పారాయణం జోడించలేదు. క్రింద నుండి ఎంచుకోండి 👇</div>'}
        <div class="chip-row">${chips}<span class="add-chip" onclick="addJapaCustom()">＋ వేరే…</span></div>
    `;
}
function bumpPradakshina(delta) {
    const d = track.days[activeDay];
    d.pradakshina = Math.max(0, (d.pradakshina || 0) + delta);
    if (delta > 0) gaEvent('pradakshina_count');
    saveTrack(); renderDaySheet();
}
function addJapa(name) {
    const d = track.days[activeDay];
    if (!d.japa) d.japa = [];
    d.japa.push({ name, count: 0, target: 11 });   // 11 is a common parayana target
    saveTrack(); renderDaySheet();
}
function addJapaCustom() {
    const name = prompt('పారాయణం / జపం పేరు:');
    if (name && name.trim()) addJapa(name.trim());
}
function bumpJapa(i, delta) {
    const j = track.days[activeDay].japa[i];
    j.count = Math.max(0, (j.count || 0) + delta);
    saveTrack(); renderDaySheet();
}
function removeJapa(i) {
    track.days[activeDay].japa.splice(i, 1);
    saveTrack(); renderDaySheet();
}
function editTarget(i) {
    const j = track.days[activeDay].japa[i];
    const val = prompt('ఎన్ని సార్లు చేయాలి? (లక్ష్యం)', j.target || 11);
    if (val !== null) { j.target = Math.max(0, parseInt(val) || 0); saveTrack(); renderDaySheet(); }
}

/* ---- Mokkulu (vows) + reminders ---- */
function addMokku() {
    const textEl = document.getElementById('mokkuText');
    const dateEl = document.getElementById('mokkuDate');
    const text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }
    const reminderDate = dateEl.value || null;
    track.mokkulu.push({ id: Date.now() + '' + Math.floor(performance.now()), text, reminderDate, done: false });
    if (reminderDate) requestNotifyPermission();
    gaEvent('add_mokku', { has_reminder: !!reminderDate });
    saveTrack();
    textEl.value = ''; dateEl.value = '';
    renderMokkulu();
}
function renderMokkulu() {
    const list = document.getElementById('mokkuList');
    if (!track.mokkulu.length) {
        list.innerHTML = '<div class="track-empty">ఇంకా మొక్కులు లేవు. పైన జోడించండి 🙏</div>';
        return;
    }
    const today = todayStr();
    // pending first, then done; pending sorted by reminder date
    const sorted = track.mokkulu.slice().sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.reminderDate || '9999').localeCompare(b.reminderDate || '9999');
    });
    list.innerHTML = sorted.map(mk => {
        let badge = '';
        if (mk.reminderDate) {
            const [yy, mm, dd] = mk.reminderDate.split('-');
            const nice = parseInt(dd) + ' ' + teMonths[parseInt(mm)-1];
            const due = !mk.done && mk.reminderDate <= today;
            badge = `<span class="mokku-badge ${due ? 'due' : ''}">🔔 ${nice}${due ? ' • ఈరోజు!' : ''}</span>`;
        }
        return `<div class="mokku-item ${mk.done ? 'done' : ''}">
            <div class="mokku-check" onclick="toggleMokku('${mk.id}')">${mk.done ? '✔' : ''}</div>
            <div class="mokku-body">
                <div class="mokku-text">${escapeHtml(mk.text)}</div>
                <div class="mokku-meta">${badge}</div>
            </div>
            <span class="mokku-del" onclick="deleteMokku('${mk.id}')" title="తొలగించు">🗑️</span>
        </div>`;
    }).join('');
}
function toggleMokku(id) {
    const mk = track.mokkulu.find(m => m.id === id);
    if (mk) { mk.done = !mk.done; saveTrack(); renderMokkulu(); }
}
function deleteMokku(id) {
    track.mokkulu = track.mokkulu.filter(m => m.id !== id);
    saveTrack(); renderMokkulu();
}
function escapeHtml(s) {
    return s.replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
function requestNotifyPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
function showDueReminders() {
    const today = todayStr();
    const due = track.mokkulu.filter(m => !m.done && m.reminderDate && m.reminderDate <= today);
    const banner = document.getElementById('reminderBanner');
    if (!due.length) { banner.classList.remove('show'); return; }
    banner.innerHTML = `<span>🔔</span><span>ఈరోజు జ్ఞాపిక: <b>${escapeHtml(due[0].text)}</b>${due.length > 1 ? ' (+' + (due.length-1) + ' మరిన్ని)' : ''}</span><span class="rb-close" onclick="this.parentElement.classList.remove('show')">✕</span>`;
    banner.classList.add('show');
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('🙏 పూజా జ్ఞాపిక', { body: due[0].text }); } catch (e) {}
    }
}

// close search with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearch(); closeDay(); closeFeedback(); }
});

/* ============================================================
   BACKUP / RESTORE  (Option A — a file on the user's own device)
   Export writes a .json the browser downloads; restore reads it
   back. Nothing is uploaded anywhere.
============================================================ */
function exportBackup() {
    try {
        const data = JSON.stringify(track, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pooja-backup-' + todayStr() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        gaEvent('backup_export');
    } catch (e) {
        alert('❌ బ్యాకప్ తీసుకోవడంలో సమస్య వచ్చింది.');
    }
}
function triggerRestore() {
    document.getElementById('restoreFile').click();
}
function handleRestoreFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object' || (!('days' in data) && !('mokkulu' in data))) throw new Error('bad');
            if (!confirm('ప్రస్తుత సమాచారం స్థానంలో బ్యాకప్ సమాచారం పెట్టాలా?')) { input.value = ''; return; }
            track = { days: data.days || {}, mokkulu: Array.isArray(data.mokkulu) ? data.mokkulu : [] };
            saveTrack();
            buildMonths(); renderMonths(); renderMokkulu(); showDueReminders();
            alert('✅ బ్యాకప్ విజయవంతంగా పునరుద్ధరించబడింది.');
        } catch (err) {
            alert('❌ ఇది సరైన బ్యాకప్ ఫైల్ కాదు.');
        }
        input.value = '';
    };
    reader.readAsText(file);
}

/* ============================================================
   FEEDBACK  (Name + Number + Message — all mandatory, voice-fill)
   Submissions go to a Google Sheet via an Apps Script web app.
   Paste your deployed /exec URL into FEEDBACK_SHEET_URL below.
   (This URL lives in the browser, so it is public — the hidden
    honeypot field + server-side checks keep out spam.)
   It is ALWAYS also saved on the device as a safety copy.
============================================================ */
const FEEDBACK_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwVTEplYkeudD9J1ilIX7W5hgHoyaIeRyCAUvCu1r7CDFp3d_6u-bSoZekw4hmbLFRy/exec';   // Google Apps Script web app → Sheet
const FEEDBACK_EMAIL = '';       // optional fallback if no sheet URL is set

function openFeedback() {
    resetFeedbackBox();
    document.getElementById('feedbackOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeFeedback() {
    document.getElementById('feedbackOverlay').classList.remove('active');
    document.body.style.overflow = '';
}
function resetFeedbackBox() {
    document.getElementById('fbForm').style.display = 'block';
    document.getElementById('fbThanks').style.display = 'none';
    document.getElementById('fbError').textContent = '';
    ['fbName', 'fbNumber', 'fbMessage'].forEach(id => {
        const el = document.getElementById(id);
        el.value = ''; el.classList.remove('invalid');
    });
}

// Generic voice-to-field helper (used by each 🎤 button)
function listenInto(inputId, btn, append) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('ఈ బ్రౌజర్‌లో వాయిస్ సదుపాయం లేదు. దయచేసి టైప్ చేయండి.'); return; }
    const rec = new SR();
    rec.lang = 'te-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
        let t = e.results[0][0].transcript;
        const el = document.getElementById(inputId);
        if (inputId === 'fbNumber') t = t.replace(/[^\d+]/g, '');   // keep digits for phone
        el.value = (append && el.value) ? (el.value + ' ' + t) : t;
        el.classList.remove('invalid');
    };
    rec.onend = () => btn && btn.classList.remove('listening');
    rec.onerror = () => btn && btn.classList.remove('listening');
    try { rec.start(); btn && btn.classList.add('listening'); } catch (e) {}
}

function submitFeedback() {
    const nameEl = document.getElementById('fbName');
    const numEl = document.getElementById('fbNumber');
    const msgEl = document.getElementById('fbMessage');
    const errEl = document.getElementById('fbError');
    [nameEl, numEl, msgEl].forEach(el => el.classList.remove('invalid'));

    const name = nameEl.value.trim();
    const number = numEl.value.trim();
    const message = msgEl.value.trim();
    const missing = [];

    if (!name) { nameEl.classList.add('invalid'); missing.push('పేరు'); }
    const digits = (number.match(/\d/g) || []).length;
    if (!number || digits < 7) { numEl.classList.add('invalid'); missing.push('సరైన ఫోన్ నంబర్'); }
    if (!message) { msgEl.classList.add('invalid'); missing.push('అభిప్రాయం'); }

    if (missing.length) {
        errEl.textContent = '⚠️ దయచేసి నింపండి: ' + missing.join(', ');
        return;
    }
    errEl.textContent = '';

    const payload = {
        name, number, message,
        website: document.getElementById('fbWebsite').value,   // honeypot (must stay empty)
        at: new Date().toISOString()
    };

    // always keep a copy on the device (safety net)
    let all = [];
    try { all = JSON.parse(localStorage.getItem('feedbackEntries_v1')) || []; } catch (e) {}
    all.push(payload);
    try { localStorage.setItem('feedbackEntries_v1', JSON.stringify(all)); } catch (e) {}

    // send to Google Sheet (Apps Script). Sent as a "simple" request with
    // no-cors so the browser does not block it; we don't read the response.
    if (FEEDBACK_SHEET_URL) {
        try {
            fetch(FEEDBACK_SHEET_URL, {
                method: 'POST', mode: 'no-cors',
                body: JSON.stringify(payload)
            }).catch(() => {});
        } catch (e) {}
    } else if (FEEDBACK_EMAIL) {
        const subject = encodeURIComponent('స్తోత్రములు App — అభిప్రాయం (' + name + ')');
        const body = encodeURIComponent('పేరు: ' + name + '\nఫోన్: ' + number + '\n\nఅభిప్రాయం:\n' + message);
        window.location.href = 'mailto:' + FEEDBACK_EMAIL + '?subject=' + subject + '&body=' + body;
    }

    // thank-you
    document.getElementById('fbForm').style.display = 'none';
    document.getElementById('fbThanks').style.display = 'block';
    gaEvent('feedback_submit');
    setTimeout(closeFeedback, 2200);
}

/* ============================================================
   ANALYTICS (GA4) — anonymous usage. Single-page app, so we
   fire a screen_view as the user moves between views, plus a
   few key action events. Named gaEvent to avoid clashing with
   the `track` pooja-data variable.
============================================================ */
function gaEvent(name, params) {
    try { if (window.gtag) gtag('event', name, params || {}); } catch (e) {}
}

/* ============================================================
   HOME + STOTRAM COUNTERS (pradakshina + per-stotram parayana)
   Both reuse the same track.days[date] storage as the Track page.
   Per-stotram parayana counts live in track.days[date].parayana[type].
============================================================ */
let homeSelectedDate = todayStr();
let stotramSelectedDate = todayStr();

function ensureDay(dateStr) {
    if (!track.days[dateStr]) track.days[dateStr] = { pradakshina: 0, japa: [], parayana: {} };
    if (!track.days[dateStr].parayana) track.days[dateStr].parayana = {};
    return track.days[dateStr];
}

function initHomePradakshina() {
    const picker = document.getElementById('homeDatePicker');
    if (picker && !picker.value) picker.value = homeSelectedDate;
    renderHomePradakshina();
}
function renderHomePradakshina() {
    const d = track.days[homeSelectedDate];
    const count = (d && d.pradakshina) || 0;
    const el = document.getElementById('homePradakshinaCount');
    if (el) el.textContent = count;
}
function onHomeDateChange(val) {
    if (!val) return;
    homeSelectedDate = val;
    renderHomePradakshina();
}
function bumpHomePradakshina(delta) {
    const d = ensureDay(homeSelectedDate);
    d.pradakshina = Math.max(0, (d.pradakshina || 0) + delta);
    if (delta > 0) gaEvent('pradakshina_count', { source: 'home', date: homeSelectedDate });
    saveTrack();
    renderHomePradakshina();
}

function initStotramCounter(type, title) {
    stotramSelectedDate = todayStr();
    const picker = document.getElementById('stotramDatePicker');
    if (picker) picker.value = stotramSelectedDate;
    const label = document.getElementById('stotramCounterLabel');
    if (label) label.textContent = title ? title + ' — పారాయణం' : 'పారాయణం';
    renderStotramCounter();
}
function renderStotramCounter() {
    if (!currentType) return;
    const d = track.days[stotramSelectedDate];
    const count = (d && d.parayana && d.parayana[currentType]) || 0;
    const el = document.getElementById('stotramParayanaCount');
    if (el) el.textContent = count;
}
function onStotramDateChange(val) {
    if (!val) return;
    stotramSelectedDate = val;
    renderStotramCounter();
}
function bumpStotramParayana(delta) {
    if (!currentType) return;
    const d = ensureDay(stotramSelectedDate);
    d.parayana[currentType] = Math.max(0, (d.parayana[currentType] || 0) + delta);
    if (delta > 0) gaEvent('parayana_count', { stotram: currentType, date: stotramSelectedDate });
    saveTrack();
    renderStotramCounter();
}

function resetHomePradakshina() {
    const d = track.days[homeSelectedDate];
    if (!d || !d.pradakshina) return;
    if (!confirm('ప్రదక్షిణ count 0కి తిరిగి సెట్ చేయాలా? / Reset pradakshina to 0?')) return;
    d.pradakshina = 0;
    gaEvent('pradakshina_reset', { source: 'home', date: homeSelectedDate });
    saveTrack();
    renderHomePradakshina();
}
function resetStotramParayana() {
    if (!currentType) return;
    const d = track.days[stotramSelectedDate];
    if (!d || !d.parayana || !d.parayana[currentType]) return;
    if (!confirm('పారాయణ count 0కి తిరిగి సెట్ చేయాలా? / Reset parayana to 0?')) return;
    d.parayana[currentType] = 0;
    gaEvent('parayana_reset', { stotram: currentType, date: stotramSelectedDate });
    saveTrack();
    renderStotramCounter();
}
function resetDayPradakshina() {
    const d = track.days[activeDay];
    if (!d || !d.pradakshina) return;
    if (!confirm('ప్రదక్షిణ count 0కి తిరిగి సెట్ చేయాలా? / Reset pradakshina to 0?')) return;
    d.pradakshina = 0;
    gaEvent('pradakshina_reset', { source: 'day-sheet', date: activeDay });
    saveTrack();
    renderDaySheet();
}
function resetJapa(i) {
    const j = track.days[activeDay].japa[i];
    if (!j || !j.count) return;
    if (!confirm(j.name + ' count 0కి తిరిగి సెట్ చేయాలా? / Reset to 0?')) return;
    j.count = 0;
    gaEvent('japa_reset', { name: j.name, date: activeDay });
    saveTrack();
    renderDaySheet();
}

createParticles();
initMeaningsToggle();
initVoice();
showDueReminders();
initHomePradakshina();