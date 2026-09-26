/* Local pooja tracking, calendar, counters, reminders, and backup. */
const TRACK_KEY = 'poojaTrack_v1';
let track = loadTrack();
function loadTrack() {
    try { return JSON.parse(localStorage.getItem(TRACK_KEY)) || { days: {}, mokkulu: [] }; }
    catch (e) { return { days: {}, mokkulu: [] }; }
}
function saveTrack() {
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (e) {}
    // if signed in, cloud.js registers this hook to also back up to Firestore (debounced)
    if (window.__cloudSync) window.__cloudSync();
}
// accessors used by assets/cloud.js (optional cloud backup)
function getTrack() { return track; }
function setTrack(next) {
    track = next || { days: {}, mokkulu: [] };
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (e) {}
    // refresh whatever view is open so restored data shows immediately
    try {
        if (typeof renderMonths === 'function' && document.getElementById('trackPage').classList.contains('active')) {
            buildMonths(); renderMonths(); renderMokkulu(); showDueReminders();
        }
        if (typeof renderHomePradakshina === 'function') renderHomePradakshina();
        if (typeof renderCount === 'function') renderCount();
    } catch (e) {}
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
    if (window.Japamala3D) window.Japamala3D.hide();
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.remove('active');
    document.getElementById('trackPage').classList.add('active');
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('japamalaPage').classList.remove('active');
    stopReaderPositionTracking();
    gaEvent('screen_view', { screen_name: 'Track' });
    buildMonths();
    renderMonths();
    renderMokkulu();
    showDueReminders();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


function openAccount() {
    openTrack();
    requestAnimationFrame(() => {
        const account = document.getElementById('cloudAuthBox');
        if (account) account.closest('.track-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
    strip.scrollTo({ left: monthIdx * strip.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
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
    if (!document.getElementById('daySheetOverlay').classList.contains('active')) return;
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


/* ============================================================
   siteConfirm — an in-app confirmation dialog, styled like the rest
   of the site, instead of the browser's plain "localhost says…" box.
   Returns a Promise that resolves true (confirmed) or false (cancelled).
   Big buttons + clear wording for our 40+ audience.
       if (await siteConfirm('తొలగించాలా?', { danger: true })) { … }
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


async function resetHomePradakshina() {
    const d = track.days[homeSelectedDate];
    if (!d || !d.pradakshina) return;
    if (!await siteConfirm('ప్రదక్షిణ count 0కి తిరిగి సెట్ చేయాలా?\n\nReset pradakshina to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true })) return;
    d.pradakshina = 0;
    gaEvent('pradakshina_reset', { source: 'home', date: homeSelectedDate });
    saveTrack();
    renderHomePradakshina();
}
async function resetStotramParayana() {
    if (!currentType) return;
    const d = track.days[stotramSelectedDate];
    if (!d || !d.parayana || !d.parayana[currentType]) return;
    if (!await siteConfirm('పారాయణ count 0కి తిరిగి సెట్ చేయాలా?\n\nReset parayana to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true })) return;
    d.parayana[currentType] = 0;
    gaEvent('parayana_reset', { stotram: currentType, date: stotramSelectedDate });
    saveTrack();
    renderStotramCounter();
}
async function resetDayPradakshina() {
    const d = track.days[activeDay];
    if (!d || !d.pradakshina) return;
    if (!await siteConfirm('ప్రదక్షిణ count 0కి తిరిగి సెట్ చేయాలా?\n\nReset pradakshina to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true })) return;
    d.pradakshina = 0;
    gaEvent('pradakshina_reset', { source: 'day-sheet', date: activeDay });
    saveTrack();
    renderDaySheet();
}
async function resetJapa(i) {
    const j = track.days[activeDay].japa[i];
    if (!j || !j.count) return;
    if (!await siteConfirm(j.name + '\n\ncount 0కి తిరిగి సెట్ చేయాలా? / Reset to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true })) return;
    j.count = 0;
    gaEvent('japa_reset', { name: j.name, date: activeDay });
    saveTrack();
    renderDaySheet();
}
