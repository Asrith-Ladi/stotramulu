/* Accessible reader controls; no network dependency. */
const READER_POSITION_KEY = 'stotramReaderPositions';
let currentVersePosition = 0;
let readerPositionObserver = null;
let visibleVerseIndexes = new Set();

function isReaderPositionKey(type) {
    return typeof type === 'string' && Object.hasOwn(stotramConfig, type) &&
        Array.isArray(stotramConfig[type].data) && stotramConfig[type].data.length > 0;
}
function loadReaderPositions() {
    try {
        const value = JSON.parse(localStorage.getItem(READER_POSITION_KEY) || '{}');
        return {
            positions: value && value.positions && typeof value.positions === 'object' ? value.positions : {},
            recent: value && value.recent && typeof value.recent === 'object' ? value.recent : null
        };
    } catch (_) { return {positions: {}, recent: null}; }
}
function savedReaderPosition(type) {
    if (!isReaderPositionKey(type)) return null;
    const value = Number(loadReaderPositions().positions[type]);
    return Number.isInteger(value) && value >= 0 && value < stotramConfig[type].data.length ? value : null;
}
function rememberReaderPosition(type, index) {
    if (!isReaderPositionKey(type)) return;
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= stotramConfig[type].data.length) return;
    const stored = loadReaderPositions();
    if (stored.positions[type] === nextIndex && stored.recent && stored.recent.type === type && stored.recent.index === nextIndex) return;
    stored.positions[type] = nextIndex;
    stored.recent = {type, index: nextIndex, updatedAt: Date.now()};
    try { localStorage.setItem(READER_POSITION_KEY, JSON.stringify(stored)); }
    catch (_) { return; }
    renderRecentReading();
}
function setCurrentVersePosition(index, save) {
    if (!currentType || !isReaderPositionKey(currentType)) return;
    const total = stotramConfig[currentType].data.length;
    const nextIndex = Math.max(0, Math.min(total - 1, Number(index) || 0));
    currentVersePosition = nextIndex;
    const text = document.getElementById('readerProgressText');
    const bar = document.getElementById('readerProgressBar');
    const select = document.getElementById('verseJump');
    const previous = document.getElementById('previousVerseButton');
    const next = document.getElementById('nextVerseButton');
    if (text) text.textContent = `శ్లోకం ${nextIndex + 1} / ${total}`;
    if (bar) {
        bar.max = total;
        bar.value = nextIndex + 1;
        bar.setAttribute('aria-valuetext', `${nextIndex + 1} of ${total}`);
    }
    if (select) select.value = String(nextIndex);
    if (previous) previous.disabled = nextIndex === 0;
    if (next) next.disabled = nextIndex === total - 1;
    if (save) rememberReaderPosition(currentType, nextIndex);
}
function jumpToVerse(value) {
    const index = Number(value);
    const block = document.getElementById('verse-' + index);
    if (!block) return;
    setCurrentVersePosition(index, true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    block.scrollIntoView({behavior: reduce ? 'instant' : 'smooth', block: 'start'});
    block.focus({preventScroll: true});
}
function previousVerse() { jumpToVerse(currentVersePosition - 1); }
function nextVerse() { jumpToVerse(currentVersePosition + 1); }
function resumeReading() {
    const saved = savedReaderPosition(currentType);
    if (saved !== null) return jumpToVerse(saved);
    const read = readSet(currentType);
    const next = stotramConfig[currentType].data.findIndex((_, i) => !read.has(i));
    jumpToVerse(next < 0 ? 0 : next);
}
function stopReaderPositionTracking() {
    if (readerPositionObserver) readerPositionObserver.disconnect();
    readerPositionObserver = null;
    visibleVerseIndexes = new Set();
}
function startReaderPositionTracking() {
    stopReaderPositionTracking();
    if (!('IntersectionObserver' in window)) return;
    readerPositionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const index = Number(entry.target.dataset.idx);
            if (entry.isIntersecting) visibleVerseIndexes.add(index);
            else visibleVerseIndexes.delete(index);
        });
        if (!visibleVerseIndexes.size) return;
        const anchor = window.innerHeight * 0.25;
        const index = [...visibleVerseIndexes].sort((a, b) => {
            const aTop = document.getElementById('verse-' + a).getBoundingClientRect().top;
            const bTop = document.getElementById('verse-' + b).getBoundingClientRect().top;
            return Math.abs(aTop - anchor) - Math.abs(bTop - anchor);
        })[0];
        setCurrentVersePosition(index, true);
    }, {rootMargin: '-12% 0px -55% 0px', threshold: 0.01});
    document.querySelectorAll('.slokam-block').forEach(block => readerPositionObserver.observe(block));
}
function openRecentReading() {
    const recent = loadReaderPositions().recent;
    if (!recent || !isReaderPositionKey(recent.type)) return;
    const index = Number(recent.index);
    if (!Number.isInteger(index) || index < 0 || index >= stotramConfig[recent.type].data.length) return;
    openReader(recent.type);
    requestAnimationFrame(() => jumpToVerse(index));
}
function renderRecentReading() {
    const home = document.getElementById('homePage');
    if (!home) return;
    let section = document.getElementById('recentReadingSection');
    const recent = loadReaderPositions().recent;
    const valid = recent && isReaderPositionKey(recent.type) && Number.isInteger(Number(recent.index)) &&
        Number(recent.index) >= 0 && Number(recent.index) < stotramConfig[recent.type].data.length;
    if (!valid) {
        if (section) section.remove();
        return;
    }
    if (!section) {
        section = document.createElement('section');
        section.id = 'recentReadingSection';
        section.className = 'recent-reading-section';
        section.setAttribute('aria-labelledby', 'recentReadingTitle');
    }
    section.replaceChildren();
    const heading = document.createElement('h2');
    heading.id = 'recentReadingTitle';
    heading.textContent = 'చివరిగా చదివింది';
    const button = document.createElement('button');
    button.type = 'button';
    button.onclick = openRecentReading;
    const cfg = stotramConfig[recent.type];
    const title = document.createElement('span');
    title.textContent = cfg.title;
    const detail = document.createElement('small');
    detail.textContent = `శ్లోకం ${Number(recent.index) + 1} / ${cfg.data.length} నుండి కొనసాగించండి`;
    button.append(title, detail);
    section.append(heading, button);
    const categoryNav = home.querySelector('.library-navigation');
    if (categoryNav) categoryNav.after(section);
    else home.querySelector('.home-primary-actions').after(section);
}
function setupReaderNavigation(type) {
    const cfg = stotramConfig[type];
    const select = document.getElementById('verseJump');
    select.replaceChildren();
    cfg.data.forEach((item, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = item.number;
        select.appendChild(option);
    });
    setCurrentVersePosition(0, false);
    startReaderPositionTracking();
    const audit = cfg.__edited ? {needsReview:true, note:'ఈ పాఠం నిర్వాహకులు మార్చారు; స్థానిక మూల సమీక్ష ఈ సంచికకు వర్తించదు.', sources:[]} : (window.CONTENT_AUDIT || {})[type];
    const content = document.getElementById('sourceContent');
    content.replaceChildren();
    const note = document.createElement('p');
    note.textContent = audit ? audit.note : 'ఈ పాఠం మూల ధృవీకరణ ఇంకా పూర్తికాలేదు. Source review pending.';
    content.appendChild(note);
    for (const source of (audit && audit.sources) || []) {
        const link = document.createElement('a');
        link.href = source.url;
        link.textContent = source.label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        content.appendChild(link);
    }
    const meaningsNote = document.createElement('p');
    meaningsNote.textContent = 'అర్థాలు అందుబాటులో ఉన్న చోట మాత్రమే కనిపిస్తాయి; వాటి సమీక్ష ఇంకా పూర్తికాలేదు.';
    content.appendChild(meaningsNote);
    document.getElementById('sourceDetails').open = !!(audit && audit.needsReview);
}
document.addEventListener('DOMContentLoaded', () => {
    const home = document.getElementById('homePage');
    const nav = document.createElement('nav');
    nav.className = 'library-navigation';
    nav.setAttribute('aria-label', 'స్తోత్రాల విభాగాలు');
    home.querySelectorAll('.cards-section').forEach((section, i) => {
        section.id ||= 'library-section-' + i;
        const heading = section.querySelector('.section-title');
        if (!heading) return;
        const link = document.createElement('a');
        link.href = '#' + section.id;
        link.textContent = heading.textContent;
        nav.appendChild(link);
    });
    home.querySelector('.home-primary-actions').after(nav);
    renderRecentReading();
    document.querySelectorAll('.card[onclick], .meaning-toggle[onclick]').forEach(el => {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        if (el.classList.contains('meaning-toggle')) {
            el.setAttribute('aria-pressed', String(el.classList.contains('on')));
            new MutationObserver(() => el.setAttribute('aria-pressed', String(el.classList.contains('on'))))
                .observe(el, {attributes:true, attributeFilter:['class']});
        }
        el.addEventListener('keydown', event => {
            if (event.target === el && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                el.click();
            }
        });
    });
});
window.addEventListener('storage', event => {
    if (event.key === READER_POSITION_KEY || event.key === null) renderRecentReading();
});
document.addEventListener('stotras-updated', renderRecentReading);
