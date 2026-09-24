/* Reader rendering, progress marks, display preferences, and in-reader search. */
function stotramCategory(type) {
    const cfg = stotramConfig[type] || {};
    if (cfg.__cat) return cfg.__cat;
    const card = Array.from(document.querySelectorAll('.card[onclick]')).find(el => el.getAttribute('onclick').includes("openReader('" + type + "')"));
    const sec = card && card.closest('.cards-section[data-cat]');
    if (sec && sec.dataset.cat) return sec.dataset.cat;
    return /108$/.test(type) ? 'ashtottara' : 'stotras';       // last resort
}


// Lines of actual text in a block.
function countTextLines(text) {
    return String(text || '').split(/\r?\n/).filter((l) => l.trim()).length;
}
// Lines that are a నామం — "ఓం … నమః". A ధ్యానం verse or a closing సమర్పణం
// has none, so this is what separates the 108 names from everything else.
function countNameLines(text) {
    return String(text || '').split(/\r?\n/).filter((l) => l.indexOf('నమః') !== -1).length;
}
// How far a label reaches: "7" → 7, "31-40" → 40, "81-183 & సమర్పణం" → 183.
// The label must START with a digit, otherwise it is a heading and counts for
// nothing — "ధ్యానం - 2" is the second meditation verse, not slokam 2.
function labelHighestNumber(label) {
    const s = String(label == null ? '' : label);
    if (!/^\s*\d/.test(s)) return 0;
    const nums = s.match(/\d+/g);
    return nums ? Math.max.apply(null, nums.map(Number)) : 0;
}


function numberedReaderRows(data, type) {
    const isNames = stotramCategory(type) === 'ashtottara';
    const hasNamah = data.some(item => countNameLines(item.text) > 0);
    let nameNumber = 0;
    return data.map(item => {
        const label = String(item.number);
        if (isNames && labelHighestNumber(label)) {
            return String(item.text).split(/\r?\n/).filter(line => line.trim()).map(text => ({
                text,
                number: (!hasNamah || countNameLines(text) > 0) ? String(++nameNumber) : ''
            }));
        }
        // Split grouped verses only when their paragraph count matches the range.
        const range = label.match(/^(\d+)\s*[-\u2013]\s*(\d+)$/);
        const paragraphs = String(item.text).split(/\r?\n\s*\r?\n/);
        if (!isNames && range && paragraphs.length === Number(range[2]) - Number(range[1]) + 1) {
            return paragraphs.map((text, i) => ({text, number: String(Number(range[1]) + i)}));
        }
        return [{text: item.text, number: /^\d/.test(label) ? label : ''}];
    });
}

function readerRowsHtml(rows) {
    return rows.map(row => `<div class="reader-verse-row"><div class="slokam-text" style="font-size:${currentFontSize}px">${row.text}</div>${row.number ? `<span class="reader-verse-number">${row.number}</span>` : ''}</div>`).join('');
}


function renderSlokams(data, type) {
    const c = document.getElementById('slokamContainer');
    c.innerHTML = '';
    if (!Array.isArray(data) || data.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'reader-empty-state';
        empty.setAttribute('role', 'status');
        empty.textContent = 'ఈ పాఠం ప్రస్తుతం అందుబాటులో లేదు. దయచేసి హోమ్‌కు వెళ్లి మరొక పాఠాన్ని ఎంచుకోండి.';
        c.appendChild(empty);
        return false;
    }
    const meaningSet = (type && meanings[type]) || {};
    const read = readSet(type);
    const rows = numberedReaderRows(data, type);
    data.forEach((item, idx) => {
        const meaning = meaningSet[idx];
        const meaningHtml = meaning
            ? `<div class="slokam-meaning"><span class="meaning-label">అర్థం</span><br>${meaning}</div>`
            : '';
        const b = document.createElement('div');
        b.className = 'slokam-block' + (read.has(idx) ? ' read' : '');
        b.dataset.idx = idx;
        b.id = 'verse-' + idx;
        b.tabIndex = -1;
        const heading = /^\d/.test(String(item.number)) ? '' : `<span class="slokam-number">${item.number}</span>`;
        b.innerHTML = `${heading}${readerRowsHtml(rows[idx])}${meaningHtml}`;
        const mark = document.createElement('button');
        mark.className = 'verse-read-button';
        mark.textContent = read.has(idx) ? 'చదివాను ✓' : 'చదివినట్లు గుర్తించు';
        mark.setAttribute('aria-pressed', String(read.has(idx)));
        mark.onclick = () => toggleSlokamRead(idx, b);
        b.appendChild(mark);
        c.appendChild(b);
    });
    return true;
}


/* ============================================================
   READ MARKS — tap a slokam to highlight it as already read, so an
   interruption never loses your place. Stored per stotram inside the
   shared `track` object, so it survives a reload and rides the cloud
   backup to other devices.
============================================================ */
function readingKey(type) {
    const version = stotramConfig[type] && stotramConfig[type].readingVersion;
    return version ? type + ':' + version : type;
}
function readSet(type) {
    const list = (track.reading && track.reading[readingKey(type)]) || [];
    return new Set(list);
}
function toggleSlokamRead(idx, el) {
    if (!currentType) return;
    if (!track.reading) track.reading = {};
    const list = track.reading[readingKey(currentType)] || [];
    const at = list.indexOf(idx);
    if (at >= 0) list.splice(at, 1); else list.push(idx);
    track.reading[readingKey(currentType)] = list;
    saveTrack();
    if (el) {
        el.classList.toggle('read', at < 0);
        const button = el.querySelector('.verse-read-button');
        if (button) {
            button.setAttribute('aria-pressed', String(at < 0));
            button.textContent = at < 0 ? 'చదివాను ✓' : 'చదివినట్లు గుర్తించు';
        }
    }
    gaEvent('slokam_mark_read', { stotram: currentType, on: at < 0 });
}
async function resetReading() {
    if (!currentType) return;
    const list = (track.reading && track.reading[readingKey(currentType)]) || [];
    if (!list.length) return;
    if (!await siteConfirm('ఈ స్తోత్రంలో చదివిన గుర్తులు అన్నీ తీసేయాలా?\n\nClear all read marks here?',
        { okLabel: 'తీసేయి / Clear', danger: true })) return;
    track.reading[readingKey(currentType)] = [];
    saveTrack();
    renderSlokams(stotramConfig[currentType].data, currentType);
    setupReaderNavigation(currentType);
    clearReaderSearch();
}


function changeFontSize(d) {
    currentFontSize = Math.max(18, Math.min(48, currentFontSize + d));
    document.getElementById('fontSizeDisplay').textContent = currentFontSize;
    document.querySelectorAll('.slokam-text, .slokam-meaning').forEach(e => e.style.fontSize = currentFontSize + 'px');
    document.documentElement.style.setProperty('--reader-font-size', currentFontSize + 'px');
    try { localStorage.setItem('readerFontSize', String(currentFontSize)); } catch (e) {}
    document.querySelectorAll('[onclick="changeFontSize(-2)"]').forEach(b => b.disabled = currentFontSize <= 18);
    document.querySelectorAll('[onclick="changeFontSize(2)"]').forEach(b => b.disabled = currentFontSize >= 48);
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
   గ్రంథ రూపం — palm-leaf (తాళపత్రం) reading mode. Each slokam becomes
   a dried-leaf panel strung on a binding cord, the way a stotram was
   read before print. Off by default: the leaf has lower contrast than
   the dark theme, so it stays the reader's choice.
============================================================ */
function toggleGrandham() {
    const on = !document.body.classList.contains('grandham');
    document.body.classList.toggle('grandham', on);
    document.getElementById('grandhamToggle').classList.toggle('on', on);
    try { localStorage.setItem('grandham', on ? '1' : '0'); } catch (e) {}
    gaEvent('grandham_toggle', { on: on });
}
function initGrandham() {
    let enabled = true;
    try { enabled = localStorage.getItem('grandham') !== '0'; } catch (e) {}
    document.body.classList.toggle('grandham', enabled);
    const t = document.getElementById('grandhamToggle');
    if (t) t.classList.toggle('on', enabled);
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
    document.querySelectorAll('.reader-search .rs-nav').forEach(b => { b.disabled = !has; b.hidden = !has; });
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
        siteAlert('ఈ బ్రౌజర్‌లో వాయిస్ సదుపాయం లేదు. దయచేసి టైప్ చేయండి.');
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
            siteAlert('🎤 మైక్ అనుమతి ఇవ్వండి, లేదా టైప్ చేయండి.');
    };
    try { rec.start(); btn && btn.classList.add('listening'); } catch (e) { /* already running */ }
}
