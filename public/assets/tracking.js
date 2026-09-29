/* ============================================================
   POOJA TRACK: the calendar, the day sheet (pradakshina + japa
   counters), mokkulu (vows) with reminders, the home and reader
   counters, and the account sheet.

   Everything lives in one object, `track`, saved on the device under
   'poojaTrack_v1'. cloud.js mirrors it to Firestore for signed-in
   readers (via getTrack / setTrack / saveTrack's __cloudSync hook).

   Classic script: the top-level names below are shared globals that
   index.html handlers, app.js, cloud.js and japamala.js call. Helpers
   that are new in the redesign, and sitePrompt(), live in the IIFE at
   the end of this file and are reached through window.TrackView and
   window.sitePrompt.
============================================================ */
const TRACK_KEY = 'poojaTrack_v1';
let track = loadTrack();
function loadTrack() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(TRACK_KEY)); } catch (e) {}
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    if (!data.days || typeof data.days !== 'object') data.days = {};
    if (!Array.isArray(data.mokkulu)) data.mokkulu = [];
    return data;
}
function saveTrack() {
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (e) {}
    // if signed in, cloud.js registers this hook to also back up to Firestore (debounced)
    if (window.__cloudSync) window.__cloudSync();
}
// accessors used by assets/cloud.js (optional cloud backup)
function getTrack() { return track; }
function setTrack(next) {
    track = (next && typeof next === 'object' && !Array.isArray(next)) ? next : {};
    if (!track.days || typeof track.days !== 'object') track.days = {};
    if (!Array.isArray(track.mokkulu)) track.mokkulu = [];
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (e) {}
    // refresh whatever view is open so restored data shows immediately
    try {
        if (typeof renderMonths === 'function' && document.getElementById('trackPage').classList.contains('active')) {
            buildMonths(); renderMonths(); renderMokkulu(); showDueReminders();
        }
        if (activeDay && document.getElementById('daySheetOverlay').classList.contains('active')) renderDaySheet();
        if (typeof renderHomePradakshina === 'function') renderHomePradakshina();
        if (typeof renderCount === 'function') renderCount();
    } catch (e) {}
}


const teMonths = ['జనవరి','ఫిబ్రవరి','మార్చి','ఏప్రిల్','మే','జూన్','జూలై','ఆగస్టు','సెప్టెంబర్','అక్టోబర్','నవంబర్','డిసెంబర్'];
const teWeekdays = ['ఆది','సోమ','మంగళ','బుధ','గురు','శుక్ర','శని'];
// One-letter forms for phones under 360px, where "మంగళ" is wider than a day cell.
const teWeekdaysShort = ['ఆ','సో','మం','బు','గు','శు','శ'];
function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function todayStr() { return ymd(new Date()); }


let trackMonths = [];   // oldest -> newest (current month last)
let monthIdx = 0;       // currently viewed month index


function openTrack() {
    if (typeof closeAllSheets === 'function') closeAllSheets();   // app.js: a page change closes open sheets
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
    // a script-requested smooth scroll ignores the CSS reduced-motion switch, so check it here
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
}


/* ---- Account sheet (#accountOverlay). Saves and restores the page's scroll
   lock, moves focus into the sheet and hands it back to the trigger. app.js
   calls closeAccountOverlay() on every Escape, so closing is a no-op unless open. ---- */
function openAccount() {
    const overlay = document.getElementById('accountOverlay');
    if (!overlay) return;
    if (!overlay.classList.contains('active')) {
        window.TrackView.holdSheet('account');
        overlay.classList.add('active');
    }
    window.TrackView.refocus(overlay.querySelector('.sheet-close'));
    gaEvent('screen_view', { screen_name: 'Account' });
}
function closeAccountOverlay() {
    const overlay = document.getElementById('accountOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    overlay.classList.remove('active');
    window.TrackView.refocus(window.TrackView.releaseSheet('account'));
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
    if (!d || typeof d !== 'object') return false;
    if (d.pradakshina > 0) return true;
    return Array.isArray(d.japa) && d.japa.some(j => j && j.count > 0);
}


/* ---- Calendar (contract §4.12). The strip holds seven .month-card pages side
   by side; which month is showing = scrollLeft / clientWidth (behavior.css). ---- */
function renderMonths() {
    const V = window.TrackView;
    const strip = document.getElementById('monthStrip');
    const today = todayStr();
    strip.innerHTML = trackMonths.map(({y, m}) => {
        const first = new Date(y, m, 1).getDay();          // 0=Sun
        const daysIn = new Date(y, m + 1, 0).getDate();
        // The weekday row is hidden from screen readers: every day button says its own weekday.
        let cells = teWeekdays.map((w, i) => `<span class="cal-weekday" aria-hidden="true"><span class="wk-long">${w}</span><span class="wk-short">${teWeekdaysShort[i]}</span></span>`).join('');
        for (let i = 0; i < first; i++) cells += '<span class="cal-day empty" aria-hidden="true"></span>';
        for (let day = 1; day <= daysIn; day++) {
            const ds = y + '-' + String(m+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
            const isFuture = ds > today;
            const isToday = ds === today;
            const has = dayHasData(ds);
            const cls = ['cal-day'];
            if (isFuture) cls.push('future');
            if (isToday) cls.push('today');
            if (has) cls.push('has-data');
            const label = escapeHtml(V.calendarLabel(ds, { today: isToday, has, future: isFuture }));
            const inner = `<span class="cal-num">${day}</span>${has ? '<span class="dot" aria-hidden="true"></span>' : ''}`;
            cells += isFuture
                ? `<button type="button" class="${cls.join(' ')}" disabled aria-label="${label}">${inner}</button>`
                : `<button type="button" class="${cls.join(' ')}" data-date="${ds}" onclick="openDay('${ds}')" aria-label="${label}"${isToday ? ' aria-current="date"' : ''}>${inner}</button>`;
        }
        return `<div class="month-card" role="group" aria-label="${teMonths[m]} ${y}"><div class="cal-grid">${cells}</div></div>`;
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
    // Only the month on screen is reachable with Tab or a screen reader; the other six
    // wait beside it in the swipe strip. `inert` changes no geometry.
    const cards = document.getElementById('monthStrip').children;
    for (let i = 0; i < cards.length; i++) cards[i].inert = (i !== monthIdx);
}
function shiftMonth(dir) {
    const next = monthIdx + dir;
    if (next < 0 || next >= trackMonths.length) return;
    monthIdx = next;
    const strip = document.getElementById('monthStrip');
    strip.scrollTo({ left: monthIdx * strip.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    updateMonthView();
}


/* ---- Day detail sheet (contract §4.9) ---- */
let activeDay = null;
function openDay(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return;
    const overlay = document.getElementById('daySheetOverlay');
    activeDay = dateStr;
    ensureDay(dateStr);
    document.getElementById('sheetDate').textContent = window.TrackView.longDate(dateStr);
    renderDaySheet(null);
    if (!overlay.classList.contains('active')) {
        window.TrackView.holdSheet('day');
        overlay.classList.add('active');
    }
    window.TrackView.refocus(overlay.querySelector('.sheet-close'));
}
function closeDay() {
    const overlay = document.getElementById('daySheetOverlay');
    if (!overlay.classList.contains('active')) return;
    const day = activeDay;
    overlay.classList.remove('active');
    const trigger = window.TrackView.releaseSheet('day');
    activeDay = null;
    renderMonths();   // refresh dots on calendar
    // The calendar was just rebuilt, so hand focus to the new button for that day.
    if (trigger && trigger !== document.body) {
        const again = day ? document.querySelector('#monthStrip [data-date="' + day + '"]') : null;
        window.TrackView.refocus(again || trigger);
    }
}
/* Rebuilds #sheetBody. Every button carries data-focus-key, so the button that
   had keyboard focus gets it back after the rebuild. focusKey (a key or a list of
   keys to try in order) overrides that; null means "don't move focus".
   The − / + labels end with the current count: after a press, focus lands on
   the rebuilt button, and a screen reader reads out the new number with it. */
function renderDaySheet(focusKey) {
    const body = document.getElementById('sheetBody');
    if (!body || !activeDay) return;
    const V = window.TrackView;
    const I = V.icon;
    const d = ensureDay(activeDay);
    const keep = focusKey !== undefined ? focusKey : V.focusKeyIn(body);

    const japaHtml = d.japa.map((j, i) => {
        if (!j) return '';
        const name = escapeHtml(j.name);
        const count = Math.max(0, Number(j.count) || 0);
        const target = Math.max(0, Number(j.target) || 0);
        const done = target > 0 && count >= target;
        const targetText = target > 0
            ? (done ? 'పూర్తయింది · లక్ష్యం ' + V.num(target) : 'లక్ష్యం: ' + V.num(target) + ' (మార్చు)')
            : 'లక్ష్యం పెట్టండి';
        const now = ' (ఇప్పటి లెక్క: ' + V.num(count) + ')';
        return `<div class="counter-card">
            <div class="counter-head">
                <span class="counter-name">${name}</span>
                <div class="counter-actions">
                    <button type="button" class="counter-reset" data-focus-key="j${i}-reset" onclick="resetJapa(${i})" aria-label="${name}: లెక్క 0కి తిరిగి సెట్ చేయండి">${I('reset')}</button>
                    <button type="button" class="counter-del" data-focus-key="j${i}-del" onclick="removeJapa(${i})" aria-label="${name}: ఈ రోజు జాబితా నుండి తీసివేయండి">${I('delete')}</button>
                </div>
            </div>
            <div class="counter-row">
                <button type="button" class="count-btn" data-focus-key="j${i}-minus" onclick="bumpDayJapa(${i},-1)" aria-label="${name}: ఒకటి తగ్గించండి${now}">${I('minus')}</button>
                <div class="count-center"><div class="count-display">${V.num(count)}</div><button type="button" class="count-target${done ? ' done' : ''}" data-focus-key="j${i}-target" onclick="editTarget(${i})" aria-label="${targetText} — ${name}">${targetText}</button></div>
                <button type="button" class="count-btn count-btn-plus" data-focus-key="j${i}-plus" onclick="bumpDayJapa(${i},1)" aria-label="${name}: ఒకటి పెంచండి${now}">${I('add')}</button>
            </div>
        </div>`;
    }).join('');

    // Suggested stotras. The title travels in a data attribute (read back by the
    // delegated listener in the IIFE below), so quotes or "&" in a title can't
    // break an inline handler.
    const index = typeof buildSearchIndex === 'function' ? buildSearchIndex() : [];
    const chips = index.slice(0, 6).map((s, n) => {
        const title = escapeHtml(s.title);
        return `<button type="button" class="add-chip" data-japa-name="${title}" data-focus-key="chip-${n}" aria-label="${title}: జపం జోడించండి">${I('add')}${title}</button>`;
    }).join('');

    const pradakshina = Math.max(0, Number(d.pradakshina) || 0);
    const pNow = ' (ఇప్పటి లెక్క: ' + V.num(pradakshina) + ')';
    body.innerHTML = `
        <div class="counter-card">
            <div class="counter-head"><span class="counter-name">ప్రదక్షిణలు</span><div class="counter-actions"><button type="button" class="counter-reset" data-focus-key="p-reset" onclick="resetDayPradakshina()" aria-label="ప్రదక్షిణల లెక్క 0కి తిరిగి సెట్ చేయండి">${I('reset')}</button></div></div>
            <div class="counter-row"><button type="button" class="count-btn" data-focus-key="p-minus" onclick="bumpPradakshina(-1)" aria-label="ఒక ప్రదక్షిణ తగ్గించండి${pNow}">${I('minus')}</button><div class="count-center"><div class="count-display">${V.num(pradakshina)}</div><div class="count-target">ప్రదక్షిణలు</div></div><button type="button" class="count-btn count-btn-plus" data-focus-key="p-plus" onclick="bumpPradakshina(1)" aria-label="ఒక ప్రదక్షిణ పెంచండి${pNow}">${I('add')}</button></div>
        </div>
        <h3 class="day-section-title">పారాయణం / జపం <button type="button" class="info-btn" data-info="day-japa" data-focus-key="info" aria-label="వివరణ: పారాయణం / జపం">${I('info')}</button></h3>
        ${japaHtml || '<p class="track-empty">ఈ రోజుకు ఇంకా ఏ పారాయణం / జపం జోడించలేదు. క్రింద ఒకటి ఎంచుకోండి.</p>'}
        <div class="chip-row">${chips}<button type="button" class="add-chip" data-focus-key="chip-custom" onclick="addJapaCustom()" aria-label="వేరే పేరుతో జపం జోడించండి">${I('add')}వేరే…</button></div>
    `;
    if (keep) V.focusByKey(body, keep);
}
function bumpPradakshina(delta) {
    if (!activeDay) return;
    const d = ensureDay(activeDay);
    d.pradakshina = Math.max(0, (Number(d.pradakshina) || 0) + delta);
    if (delta > 0) gaEvent('pradakshina_count');
    saveTrack(); renderDaySheet();
}
function addJapa(name) {
    if (!activeDay) return;
    const clean = String(name == null ? '' : name).trim().slice(0, 80);
    if (!clean) return;
    const d = ensureDay(activeDay);
    d.japa.push({ name: clean, count: 0, target: 11 });   // 11 is a common parayana target
    saveTrack(); renderDaySheet();
}
async function addJapaCustom() {
    if (!activeDay) return;
    const name = await sitePrompt('పారాయణం / జపం పేరు రాయండి', {
        okLabel: 'జోడించండి', placeholder: 'ఉదా: హనుమాన్ చాలీసా', maxLength: 80
    });
    if (name && name.trim()) addJapa(name);
}
// Day-sheet japa rows only. (Named bumpDayJapa because japamala.js owns the
// global bumpJapa(), the Japamala bead counter, and loads after this file.)
function bumpDayJapa(i, delta) {
    if (!activeDay) return;
    const j = ensureDay(activeDay).japa[i];
    if (!j) return;
    j.count = Math.max(0, (Number(j.count) || 0) + delta);
    saveTrack(); renderDaySheet();
}
async function removeJapa(i) {
    if (!activeDay) return;
    const day = activeDay;
    const j = ensureDay(day).japa[i];
    if (!j) return;
    const back = document.activeElement;
    const count = Math.max(0, Number(j.count) || 0);
    if (count > 0 && !await siteConfirm(j.name + '\n\nఈ రోజు జాబితా నుండి తీసివేయాలా? ఈ లెక్క (' + window.TrackView.num(count) + ') కూడా పోతుంది.\n\nRemove it from this day?',
        { okLabel: 'తీసివేయి / Remove', danger: true })) { window.TrackView.refocus(back); return; }
    const list = ensureDay(day).japa;
    const at = list.indexOf(j);
    if (at < 0) return;
    list.splice(at, 1);
    saveTrack();
    if (activeDay === day) renderDaySheet(['j' + at + '-del', 'j' + (at - 1) + '-del', 'chip-custom']);
}
async function editTarget(i) {
    if (!activeDay) return;
    const day = activeDay;
    const j = ensureDay(day).japa[i];
    if (!j) return;
    const val = await sitePrompt(j.name + '\n\nఎన్ని సార్లు చేయాలి? (లక్ష్యం)\n0 అంటే లక్ష్యం లేదు.', {
        value: String(Number(j.target) > 0 ? Number(j.target) : 11), okLabel: 'సరే / OK', inputmode: 'numeric', maxLength: 11
    });
    if (val === null) return;
    const target = window.TrackView.parseCount(val);
    if (target === null) {
        if (typeof siteAlert === 'function') siteAlert('దయచేసి అంకెలు మాత్రమే రాయండి. ఉదా: 108');
        return;
    }
    const current = ensureDay(day).japa[i];
    if (!current) return;
    current.target = target;
    saveTrack();
    if (activeDay === day) renderDaySheet();
}
async function resetDayPradakshina() {
    if (!activeDay) return;
    const day = activeDay;
    const d = track.days[day];
    if (!d || !d.pradakshina) return;
    const back = document.activeElement;
    if (!await siteConfirm('ప్రదక్షిణల లెక్కను 0కి తిరిగి సెట్ చేయాలా?\n\nReset pradakshina to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true })) { window.TrackView.refocus(back); return; }
    d.pradakshina = 0;
    gaEvent('pradakshina_reset', { source: 'day-sheet', date: day });
    saveTrack();
    if (activeDay === day) renderDaySheet('p-reset');
}
async function resetJapa(i) {
    if (!activeDay) return;
    const day = activeDay;
    const j = ensureDay(day).japa[i];
    if (!j || !j.count) return;
    const back = document.activeElement;
    if (!await siteConfirm(j.name + '\n\nఈ లెక్కను 0కి తిరిగి సెట్ చేయాలా?\n\nReset this count to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true })) { window.TrackView.refocus(back); return; }
    j.count = 0;
    gaEvent('japa_reset', { name: j.name, date: day });
    saveTrack();
    if (activeDay === day) renderDaySheet('j' + i + '-reset');
}


/* ---- Mokkulu (vows) + reminders (contract §4.13) ---- */
function addMokku() {
    const textEl = document.getElementById('mokkuText');
    const dateEl = document.getElementById('mokkuDate');
    const text = textEl.value.trim().slice(0, 300);
    if (!text) { textEl.focus(); return; }
    const reminderDate = /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value) ? dateEl.value : null;
    if (!Array.isArray(track.mokkulu)) track.mokkulu = [];
    track.mokkulu.push({ id: Date.now() + '' + Math.floor(performance.now()), text, reminderDate, done: false });
    if (reminderDate) requestNotifyPermission();
    gaEvent('add_mokku', { has_reminder: !!reminderDate });
    saveTrack();
    textEl.value = ''; dateEl.value = '';
    renderMokkulu();
}
function renderMokkulu() {
    const list = document.getElementById('mokkuList');
    if (!list) return;
    if (!Array.isArray(track.mokkulu)) track.mokkulu = [];
    if (!track.mokkulu.length) {
        list.innerHTML = '<p class="track-empty">ఇంకా మొక్కులు లేవు. పైన రాసి "జోడించండి" నొక్కండి.</p>';
        return;
    }
    const V = window.TrackView;
    const I = V.icon;
    const today = todayStr();
    // pending first, then done; pending sorted by reminder date
    const sorted = track.mokkulu.filter(Boolean).sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        return String(a.reminderDate || '9999').localeCompare(String(b.reminderDate || '9999'));
    });
    list.innerHTML = sorted.map((mk, n) => {
        const idArg = escapeHtml(V.jsString(mk.id));
        const textId = 'mokku-item-text-' + n;
        let meta = '';
        if (mk.reminderDate && /^\d{4}-\d{2}-\d{2}$/.test(mk.reminderDate)) {
            const due = !mk.done && mk.reminderDate <= today;
            const when = mk.reminderDate === today ? ' • ఈరోజు!' : ' • తేదీ దాటింది';
            meta = `<div class="mokku-meta"><span class="mokku-badge${due ? ' due' : ''}">${I('bell')}<span class="visually-hidden">జ్ఞాపిక తేదీ: </span>${V.shortDate(mk.reminderDate)}${due ? when : ''}</span></div>`;
        }
        return `<div class="mokku-item${mk.done ? ' done' : ''}" data-mid="${escapeHtml(mk.id)}">
            <button type="button" class="mokku-check" aria-pressed="${mk.done ? 'true' : 'false'}" aria-label="తీర్చుకున్నాను" aria-describedby="${textId}" onclick="toggleMokku(${idArg})">${I('check')}</button>
            <div class="mokku-body">
                <div class="mokku-text" id="${textId}">${escapeHtml(mk.text)}</div>
                ${meta}
            </div>
            <button type="button" class="mokku-del" aria-label="మొక్కు తొలగించు" aria-describedby="${textId}" onclick="deleteMokku(${idArg})">${I('delete')}</button>
        </div>`;
    }).join('');
}
function toggleMokku(id) {
    const mk = (track.mokkulu || []).find(m => m && String(m.id) === String(id));
    if (!mk) return;
    const list = document.getElementById('mokkuList');
    const hadFocus = !!(list && list.contains(document.activeElement));
    mk.done = !mk.done;
    saveTrack(); renderMokkulu();
    // the list re-sorts (done vows go last), so focus follows the vow to its new place
    if (hadFocus) {
        const item = window.TrackView.mokkuItem(list, id);
        window.TrackView.refocus(item && item.querySelector('.mokku-check'));
    }
}
async function deleteMokku(id) {
    const mk = (track.mokkulu || []).find(m => m && String(m.id) === String(id));
    if (!mk) return;
    const list = document.getElementById('mokkuList');
    const back = document.activeElement;
    const hadFocus = !!(list && list.contains(back));
    const items = list ? Array.prototype.slice.call(list.querySelectorAll('.mokku-item')) : [];
    const pos = items.indexOf(window.TrackView.mokkuItem(list, id));
    if (!await siteConfirm('ఈ మొక్కును తొలగించాలా?\n\n' + mk.text + '\n\nDelete this vow?',
        { okLabel: 'తొలగించు / Delete', danger: true })) { window.TrackView.refocus(back); return; }
    track.mokkulu = (track.mokkulu || []).filter(m => m && String(m.id) !== String(id));
    saveTrack(); renderMokkulu();
    if (hadFocus && list) {
        const left = list.querySelectorAll('.mokku-del');
        window.TrackView.refocus(left[Math.min(pos, left.length - 1)] || document.getElementById('mokkuText'));
    }
}
// Shared by every script that writes innerHTML (app.js, cloud.js, admin.js, weekday.js…).
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}


/* ---- Home pradakshina counter and the reader's parayana counter.
   (siteConfirm / siteAlert, the in-app dialogs used below, live in app.js.) ---- */
let homeSelectedDate = todayStr();
let stotramSelectedDate = todayStr();


function ensureDay(dateStr) {
    if (!track.days[dateStr] || typeof track.days[dateStr] !== 'object') track.days[dateStr] = { pradakshina: 0, japa: [], parayana: {} };
    const d = track.days[dateStr];
    if (!Array.isArray(d.japa)) d.japa = [];
    if (!d.parayana) d.parayana = {};
    return d;
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
    const back = document.activeElement;
    const ok = await siteConfirm('ప్రదక్షిణల లెక్కను 0కి తిరిగి సెట్ చేయాలా?\n\nReset pradakshina to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true });
    window.TrackView.refocus(back);
    if (!ok) return;
    d.pradakshina = 0;
    gaEvent('pradakshina_reset', { source: 'home', date: homeSelectedDate });
    saveTrack();
    renderHomePradakshina();
}
async function resetStotramParayana() {
    if (!currentType) return;
    const d = track.days[stotramSelectedDate];
    if (!d || !d.parayana || !d.parayana[currentType]) return;
    const back = document.activeElement;
    const ok = await siteConfirm('పారాయణ లెక్కను 0కి తిరిగి సెట్ చేయాలా?\n\nReset parayana to 0?',
        { okLabel: 'రీసెట్ / Reset', danger: true });
    window.TrackView.refocus(back);
    if (!ok) return;
    d.parayana[currentType] = 0;
    gaEvent('parayana_reset', { stotram: currentType, date: stotramSelectedDate });
    saveTrack();
    renderStotramCounter();
}


/* ============================================================
   View helpers, sitePrompt() and the delegated listeners, new in the
   redesign. Kept in one IIFE so nothing here adds a top-level name;
   exported as window.TrackView and window.sitePrompt.
============================================================ */
(function () {
    'use strict';

    const WEEKDAYS_FULL = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];

    // ICON(x) from the contract: an icon from the /icons.svg sprite
    function icon(name) {
        return '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-' + name + '"/></svg>';
    }
    // Indian digit grouping (1,00,000) so large japa counts are easy to read
    function num(n) {
        const v = Math.max(0, Number(n) || 0);
        try { return v.toLocaleString('en-IN'); } catch (e) { return String(v); }
    }
    // A single-quoted JavaScript string literal, for an inline handler argument.
    // Pass the result through escapeHtml() before it goes into the attribute.
    function jsString(v) {
        return "'" + String(v == null ? '' : v)
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
            .replace(/\r/g, '\\r').replace(/\n/g, '\\n')
            .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
            .replace(/</g, '\\x3c') + "'";
    }

    /* ---------- Dates ('YYYY-MM-DD' strings, local time) ---------- */
    function parts(ds) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds || ''));
        if (!m) return null;
        const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
        return { y, mo, d, weekday: WEEKDAYS_FULL[new Date(y, mo - 1, d).getDay()] };
    }
    // "28 సెప్టెంబర్ 2026 · సోమవారం" (day-sheet heading)
    function longDate(ds) {
        const p = parts(ds);
        return p ? p.d + ' ' + teMonths[p.mo - 1] + ' ' + p.y + ' · ' + p.weekday : String(ds || '');
    }
    // "28 సెప్టెంబర్", with the year only when it isn't this year (vow reminder badge)
    function shortDate(ds) {
        const p = parts(ds);
        if (!p) return '';
        return p.d + ' ' + teMonths[p.mo - 1] + (p.y !== new Date().getFullYear() ? ' ' + p.y : '');
    }
    // Spoken name of a calendar cell: date, weekday, today, and whether anything is recorded
    function calendarLabel(ds, s) {
        const p = parts(ds);
        if (!p) return String(ds || '');
        const out = [p.d + ' ' + teMonths[p.mo - 1] + ' ' + p.y, p.weekday];
        if (s && s.today) out.push('ఈ రోజు');
        out.push(s && s.has ? 'నమోదు ఉంది' : 'నమోదు లేదు');
        if (s && s.future) out.push('ఇంకా రాని రోజు');
        return out.join(', ');
    }
    // A typed japa target: accepts Telugu digits and 1,00,000-style commas.
    // '' means "no target" (0); anything that isn't a number returns null.
    function parseCount(value) {
        const t = String(value == null ? '' : value)
            .replace(/[\u0C66-\u0C6F]/g, c => String(c.charCodeAt(0) - 0x0C66))
            .replace(/[\s,]/g, '');
        if (t === '') return 0;
        if (!/^\d+$/.test(t)) return null;
        return Math.min(parseInt(t, 10), 10000000);   // one crore, the largest traditional vow
    }

    /* ---------- Focus and scroll lock ---------- */
    function refocus(el, allowScroll) {
        if (!el || el === document.body || !el.isConnected || typeof el.focus !== 'function') return false;
        try { el.focus(allowScroll ? undefined : { preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
        return document.activeElement === el;
    }
    function focusKeyIn(root) {
        const a = document.activeElement;
        return (a && a !== document.body && root.contains(a)) ? a.getAttribute('data-focus-key') : null;
    }
    function focusByKey(root, keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (let i = 0; i < list.length; i++) {
            if (!list[i]) continue;
            const el = root.querySelector('[data-focus-key="' + list[i] + '"]');
            if (el && refocus(el)) return true;
        }
        return false;
    }
    function mokkuItem(list, id) {
        if (!list) return null;
        const items = list.querySelectorAll('.mokku-item');
        for (let i = 0; i < items.length; i++) if (items[i].getAttribute('data-mid') === String(id)) return items[i];
        return null;
    }
    // A sheet remembers the scroll lock it found and the element that opened it.
    const held = {};
    function holdSheet(name) {
        held[name] = { overflow: document.body.style.overflow, trigger: document.activeElement };
        document.body.style.overflow = 'hidden';
    }
    function releaseSheet(name) {
        const s = held[name];
        delete held[name];
        document.body.style.overflow = s ? s.overflow : '';
        return s ? s.trigger : null;
    }

    /* ---------- sitePrompt(message, {value, okLabel, inputmode}) → Promise<string|null>
       The in-app replacement for prompt(), built from the same .sc-* dialog as
       siteConfirm (app.js) plus a text field. Resolves with the typed text, or
       null when cancelled (Cancel, Escape, or a tap outside the box while the
       field still holds what it started with).
       Optional extras: cancelLabel, placeholder, maxLength. ---------- */
    let promptSeq = 0;
    function sitePrompt(message, opts) {
        opts = opts || {};
        const okLabel = opts.okLabel || 'సరే / OK';
        const cancelLabel = opts.cancelLabel || 'రద్దు / Cancel';
        return new Promise((resolve) => {
            const id = 'scPrompt' + (++promptSeq);
            const returnTo = document.activeElement;
            const ov = document.createElement('div');
            ov.className = 'sc-overlay sc-prompt';
            ov.innerHTML =
                '<div class="sc-box" role="dialog" aria-modal="true" aria-labelledby="' + id + '-msg">' +
                '<div class="sc-msg" id="' + id + '-msg">' + escapeHtml(message) + '</div>' +
                '<input type="text" class="field-input sc-input" id="' + id + '-input" aria-labelledby="' + id + '-msg" autocomplete="off" spellcheck="false" enterkeyhint="done">' +
                '<div class="sc-actions">' +
                '<button type="button" class="sc-btn btn btn-quiet" data-no>' + escapeHtml(cancelLabel) + '</button>' +
                '<button type="button" class="sc-btn primary btn btn-primary" data-yes>' + escapeHtml(okLabel) + '</button>' +
                '</div></div>';
            const input = ov.querySelector('input');
            const noBtn = ov.querySelector('[data-no]');
            const yesBtn = ov.querySelector('[data-yes]');
            input.value = opts.value == null ? '' : String(opts.value);
            if (opts.inputmode) input.setAttribute('inputmode', String(opts.inputmode));
            if (opts.placeholder) input.placeholder = String(opts.placeholder);
            if (opts.maxLength > 0) input.maxLength = opts.maxLength;
            const initial = input.value;

            let done = false;
            function finish(value) {
                if (done) return;
                done = true;
                window.removeEventListener('keydown', onKey, true);
                ov.dataset.closing = 'true';          // fading out: no longer "on top" (app.js Escape handler)
                ov.classList.remove('show');
                setTimeout(() => ov.remove(), 180);   // the .sc-overlay fade is 150ms
                refocus(returnTo);
                resolve(value);
            }
            // Window, capture phase: this dialog is on top of everything, so it sees
            // keys first and stops them, e.g. Escape must not also close the day sheet.
            function onKey(e) {
                const key = e.key;
                if (key === 'Escape' || key === 'Esc') {
                    e.preventDefault(); e.stopImmediatePropagation();
                    finish(null);
                } else if (key === 'Enter' && e.target === input) {
                    if (e.isComposing || e.keyCode === 229) return;   // a Telugu keyboard is still composing a word
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (!e.repeat) finish(input.value);               // a held-down Enter never answers
                } else if (key === 'Tab') {
                    // keep Tab inside the dialog: field → Cancel → OK → field
                    const order = [input, noBtn, yesBtn];
                    const at = order.indexOf(document.activeElement);
                    const next = at === -1 ? input : order[(at + (e.shiftKey ? order.length - 1 : 1)) % order.length];
                    e.preventDefault(); e.stopImmediatePropagation();
                    refocus(next);
                }
            }
            noBtn.addEventListener('click', () => finish(null));
            yesBtn.addEventListener('click', () => finish(input.value));
            // A tap on the dim backdrop cancels, but never throws away typed text:
            // on a phone, tapping outside is also how people put the keyboard away.
            ov.addEventListener('click', (e) => { if (e.target === ov && input.value === initial) finish(null); });
            window.addEventListener('keydown', onKey, true);

            document.body.appendChild(ov);
            requestAnimationFrame(() => ov.classList.add('show'));
            // focus now, inside the tap that opened the dialog, so phones raise the keyboard
            refocus(input);
            if (input.value) { try { input.select(); } catch (e) {} }
        });
    }

    window.TrackView = {
        icon, num, jsString, longDate, shortDate, calendarLabel, parseCount,
        refocus, focusKeyIn, focusByKey, mokkuItem, holdSheet, releaseSheet
    };
    window.sitePrompt = sitePrompt;

    if (typeof document === 'undefined' || !document.addEventListener) return;

    // Day-sheet suggestion chips: <button class="add-chip" data-japa-name="…">
    document.addEventListener('click', (e) => {
        const t = e.target;
        const chip = t && t.closest ? t.closest('#sheetBody [data-japa-name]') : null;
        if (chip) addJapa(chip.getAttribute('data-japa-name'));
    });

    // Enter in the vow field adds the vow, like the "జోడించండి" button
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        if (!e.target || e.target.id !== 'mokkuText') return;
        e.preventDefault();
        addMokku();
    });

    // Tab stays inside the top-most open layer: day sheet, feedback, search or the
    // account sheet (checked in stacking order). Dialogs, the info sheet and the
    // updates / messages sheets keep their own focus rules.
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    function activeLayer(id) {
        const el = document.getElementById(id);
        return el && el.classList.contains('active') ? el : null;
    }
    function trapRoot() {
        if (document.querySelector('.sc-overlay:not([data-closing])') || activeLayer('infoOverlay') ||
            activeLayer('updatesOverlay') || activeLayer('messagesOverlay')) return null;
        const day = activeLayer('daySheetOverlay');
        if (day) return day.querySelector('.day-sheet');
        const feedback = activeLayer('feedbackOverlay');
        if (feedback) return feedback.querySelector('.feedback-box') || feedback;
        const search = activeLayer('searchOverlay');
        if (search) return search.querySelector('.search-box') || search;
        const account = activeLayer('accountOverlay');
        if (account) return account.querySelector('.sheet') || account;
        return null;
    }
    // Skip hidden helpers (the honeypot field, the visually-hidden type select).
    function tabbable(el) {
        return el.getClientRects().length > 0 && el.tabIndex >= 0 && !el.closest('[aria-hidden="true"]');
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || e.defaultPrevented) return;
        const root = trapRoot();
        if (!root) return;
        const list = Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), tabbable);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        // A focused title or thank-you note (tabindex -1) is not in the list:
        // Shift+Tab from it wraps to the last control instead of leaving the box.
        const idx = list.indexOf(active);
        if (!root.contains(active)) { e.preventDefault(); refocus(e.shiftKey ? last : first, true); }
        else if (e.shiftKey && idx <= 0) { e.preventDefault(); refocus(last, true); }
        else if (!e.shiftKey && idx === list.length - 1) { e.preventDefault(); refocus(first, true); }
    });
})();
