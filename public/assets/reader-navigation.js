/* Accessible reader controls; no network dependency. */
const READER_POSITION_KEY = 'stotramReaderPositions';
const LIBRARY_CATEGORY_KEY = 'stotramLibraryCategory';

function loadLibraryCategory() {
    try { return localStorage.getItem(LIBRARY_CATEGORY_KEY) || ''; }
    catch (_) { return ''; }
}
function rememberLibraryCategory(sectionId) {
    if (typeof sectionId !== 'string' || !sectionId) return;
    try { localStorage.setItem(LIBRARY_CATEGORY_KEY, sectionId); }
    catch (_) {}
}
let readerPositionObserver = null;
let visibleVerseIndexes = new Set();

function isReaderPositionKey(type) {
    return typeof type === 'string' && Object.hasOwn(stotramConfig, type) &&
        Array.isArray(stotramConfig[type].data) && stotramConfig[type].data.length > 0;
}
function loadReaderPositions() {
    try {
        const value = JSON.parse(localStorage.getItem(READER_POSITION_KEY) || '{}');
        const recent = value && value.recent && typeof value.recent === 'object' ? value.recent : null;
        const history = value && Array.isArray(value.history) ? value.history : (recent ? [recent] : []);
        return {
            positions: value && value.positions && typeof value.positions === 'object' ? value.positions : {},
            recent,
            history: history.filter(item => item && typeof item === 'object').slice(0, 3)
        };
    } catch (_) { return {positions: {}, recent: null, history: []}; }
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
    const first = stored.history[0];
    if (stored.positions[type] === nextIndex && first && first.type === type && Number(first.index) === nextIndex) return;
    const entry = {type, index: nextIndex, updatedAt: Date.now()};
    stored.positions[type] = nextIndex;
    stored.recent = entry;
    stored.history = [entry, ...stored.history.filter(item => item.type !== type)].slice(0, 3);
    try { localStorage.setItem(READER_POSITION_KEY, JSON.stringify(stored)); }
    catch (_) { return; }
    renderRecentReading();
}
function setCurrentVersePosition(index, save) {
    if (!currentType || !isReaderPositionKey(currentType)) return;
    const total = stotramConfig[currentType].data.length;
    const nextIndex = Math.max(0, Math.min(total - 1, Number(index) || 0));
    const select = document.getElementById('verseJump');
    if (select) select.value = String(nextIndex);
    if (save) rememberReaderPosition(currentType, nextIndex);
}
function readerSections(type) {
    const cfg = stotramConfig[type];
    if (!cfg || !Array.isArray(cfg.sections)) return [];
    return cfg.sections.filter(section => section && typeof section.label === 'string' &&
        Number.isInteger(Number(section.index)) && Number(section.index) >= 0 && Number(section.index) < cfg.data.length)
        .map(section => ({label: section.label, index: Number(section.index)}));
}
function jumpToSection(value) {
    jumpToVerse(value);
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
function recentReaderEntries() {
    const stored = loadReaderPositions();
    const candidates = stored.history.length ? stored.history : (stored.recent ? [stored.recent] : []);
    const seen = new Set();
    return candidates.filter(item => {
        if (!item || seen.has(item.type) || !isReaderPositionKey(item.type)) return false;
        const index = Number(item.index);
        if (!Number.isInteger(index) || index < 0 || index >= stotramConfig[item.type].data.length) return false;
        seen.add(item.type);
        return true;
    }).slice(0, 3).map(item => ({type: item.type, index: Number(item.index)}));
}
function openRecentReading(type, index) {
    let entry = {type, index: Number(index)};
    if (!type) entry = recentReaderEntries()[0];
    if (!entry || !isReaderPositionKey(entry.type)) return;
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= stotramConfig[entry.type].data.length) return;
    openReader(entry.type);
    requestAnimationFrame(() => jumpToVerse(entry.index));
}
function renderRecentReading() {
    const home = document.getElementById('homePage');
    if (!home) return;
    let section = document.getElementById('recentReadingSection');
    const entries = recentReaderEntries();
    if (!entries.length) {
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
    heading.textContent = 'ఇటీవల చదివినవి';
    const list = document.createElement('div');
    list.className = 'recent-reading-list';
    entries.forEach(entry => {
        const button = document.createElement('button');
        button.type = 'button';
        button.onclick = () => openRecentReading(entry.type, entry.index);
        const cfg = stotramConfig[entry.type];
        const title = document.createElement('span');
        title.textContent = cfg.title;
        const detail = document.createElement('small');
        detail.textContent = 'శ్లోకం ' + (entry.index + 1) + ' / ' + cfg.data.length + ' నుండి కొనసాగించండి';
        button.append(title, detail);
        list.appendChild(button);
    });
    section.append(heading, list);
    const categoryNav = home.querySelector('.library-navigation');
    if (categoryNav) home.querySelector('.welcome-section').after(section);
    else home.querySelector('.home-primary-actions').after(section);
}
function readerMeaningCoverage(type) {
    const cfg = stotramConfig[type] || {};
    const total = Array.isArray(cfg.data) ? cfg.data.length : 0;
    const available = Object.entries(cfg.meanings || {}).filter(([index, meaning]) =>
        Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < total && String(meaning || '').trim()
    ).length;
    return {available, total};
}
function setupMeaningAvailability(type) {
    const coverage = readerMeaningCoverage(type);
    const toggle = document.getElementById('meaningToggle');
    const row = document.getElementById('meaningToggleRow');
    const summary = document.getElementById('readerOptionsSummary');
    if (toggle) {
        toggle.hidden = coverage.available === 0;
        toggle.setAttribute('aria-hidden', String(coverage.available === 0));
        const label = toggle.querySelector('label');
        if (label) label.textContent = `అర్థం చూపించు (${coverage.available}/${coverage.total})`;
    }
    if (row) row.hidden = coverage.available === 0;
    if (summary) summary.textContent = coverage.available
        ? `అర్థం ${coverage.available}/${coverage.total}, శ్లోకం, సేవ్, లెక్క`
        : 'శ్లోకం, సేవ్, లెక్క';
    return coverage;
}
function appendMeaningReview(content, type, audit) {
    const coverage = readerMeaningCoverage(type);
    const meaningAudit = audit && audit.meaningAudit;
    const section = document.createElement('section');
    section.className = 'meaning-review-summary';
    const heading = document.createElement('h4');
    heading.textContent = 'అర్థాల స్థితి';
    const count = document.createElement('p');
    count.className = 'meaning-coverage';
    count.textContent = coverage.available
        ? `అర్థం ఉన్న భాగాలు: ${coverage.available} / ${coverage.total}`
        : `ఈ పాఠంలోని ${coverage.total} భాగాలకు అర్థాలు ఇంకా జోడించలేదు.`;
    section.append(heading, count);
    if (coverage.available) {
        const labels = {
            verified: '✓ అర్థాలు మూలంతో పరిశీలించబడ్డాయి',
            partial: '◐ కొన్ని అర్థాలు పరిశీలించబడ్డాయి',
            reference: '◇ అర్థ పోలిక మూలం జోడించబడింది; సమీక్ష పెండింగ్',
            pending: '△ అర్థాల సమీక్ష పెండింగ్'
        };
        const state = document.createElement('p');
        state.className = 'meaning-review-status ' + ((meaningAudit && meaningAudit.status) || 'pending');
        state.textContent = labels[(meaningAudit && meaningAudit.status) || 'pending'];
        section.appendChild(state);
        if (meaningAudit && meaningAudit.note) {
            const note = document.createElement('p');
            note.textContent = meaningAudit.note;
            section.appendChild(note);
        }
        if (meaningAudit && meaningAudit.checkedOn) {
            const checked = document.createElement('p');
            checked.className = 'source-review-meta';
            checked.textContent = 'అర్థ మూలాల పరిశీలన: ' + meaningAudit.checkedOn;
            section.appendChild(checked);
        }
        for (const source of (meaningAudit && meaningAudit.sources) || []) {
            const link = document.createElement('a');
            link.href = source.url;
            link.textContent = source.label;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            section.appendChild(link);
        }
    }
    content.appendChild(section);
}
function setupReaderNavigation(type) {
    const cfg = stotramConfig[type];
    setupMeaningAvailability(type);
    const select = document.getElementById('verseJump');
    select.replaceChildren();
    const sectionNav = document.getElementById('readerSectionNav');
    const sections = readerSections(type);
    sectionNav.replaceChildren();
    sectionNav.hidden = sections.length === 0;
    if (sections.length) {
        const label = document.createElement('span');
        label.className = 'reader-section-label';
        label.textContent = 'విభాగానికి వెళ్లండి';
        sectionNav.appendChild(label);
        sections.forEach(section => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = section.label;
            button.onclick = () => jumpToSection(section.index);
            sectionNav.appendChild(button);
        });
    }
    cfg.data.forEach((item, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = item.number;
        select.appendChild(option);
    });
    setCurrentVersePosition(0, false);
    startReaderPositionTracking();
    const audit = cfg.__edited ? {status:'override', needsReview:true, note:'ఈ పాఠం నిర్వాహకులు మార్చారు; స్థానిక మూల సమీక్ష ఈ సంచికకు వర్తించదు.', sources:[]} : (window.CONTENT_AUDIT || {})[type];
    const statusKey = audit ? (audit.status || (audit.needsReview ? 'review' : 'verified')) : 'pending';
    const statusLabels = {
        verified: '✓ మూలంతో పరిశీలించబడింది',
        partial: '◐ ప్రధాన పాఠం పరిశీలించబడింది',
        review: '△ పాఠభేదాల సమీక్ష అవసరం',
        pending: '△ మూల పరిశీలన పెండింగ్',
        override: '△ స్థానికంగా మార్చిన పాఠం'
    };
    const status = document.getElementById('sourceStatusBadge');
    status.className = 'source-status-badge ' + statusKey;
    status.textContent = statusLabels[statusKey] || statusLabels.pending;
    const content = document.getElementById('sourceContent');
    content.replaceChildren();
    const note = document.createElement('p');
    note.textContent = audit ? audit.note : 'ఈ పాఠం మూల ధృవీకరణ ఇంకా పూర్తికాలేదు. Source review pending.';
    content.appendChild(note);
    if (audit && (audit.reviewedOn || audit.scope)) {
        const meta = document.createElement('p');
        meta.className = 'source-review-meta';
        const reviewed = audit.reviewedOn ? 'చివరి పరిశీలన: ' + audit.reviewedOn : '';
        meta.textContent = [reviewed, audit.scope].filter(Boolean).join(' · ');
        content.appendChild(meta);
    }
    for (const source of (audit && audit.sources) || []) {
        const link = document.createElement('a');
        link.href = source.url;
        link.textContent = source.label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        content.appendChild(link);
    }
    appendMeaningReview(content, type, audit);
    document.getElementById('sourceDetails').open = !!(audit && audit.needsReview);
}
document.addEventListener('DOMContentLoaded', () => {
    const home = document.getElementById('homePage');
    const actions = home.querySelector('.home-primary-actions');
    const nav = document.createElement('nav');
    nav.id = 'library';
    nav.className = 'library-navigation';
    nav.setAttribute('aria-label', 'స్తోత్రాల విభాగాలు / Prayer categories');
    const intro = document.createElement('div');
    intro.className = 'library-intro';
    intro.innerHTML = '<div><span class="eyebrow">THE SACRED COLLECTION</span><h2>స్తోత్రాల గ్రంథాలయం</h2></div><p>మీ మనసుకు దగ్గరైన స్తోత్రాన్ని ఎంచుకోండి.</p>';
    const filters = document.createElement('div');
    filters.className = 'category-filters';
    let sections = [...home.querySelectorAll('.cards-section')];
    const choose = (id, remember = true) => {
        sections.forEach(section => { section.hidden = id !== 'all' && section.id !== id; });
        filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === id)));
        if (remember) rememberLibraryCategory(id);
    };
    const addFilter = (id, title, count) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.category = id;
        button.append(document.createTextNode(title + ' '));
        const badge = document.createElement('span');
        badge.textContent = count;
        badge.className = 'filter-count';
        button.append(badge);
        button.addEventListener('click', () => choose(id));
        filters.append(button);
    };
    const refreshFilters = () => {
        const preferred = filters.querySelector('[aria-pressed="true"]')?.dataset.category || loadLibraryCategory();
        sections = [...home.querySelectorAll('.cards-section')];
        filters.replaceChildren();
        addFilter('all', 'అన్నీ', home.querySelectorAll('.cards-section .card').length);
        sections.forEach((section, i) => {
            section.id ||= 'library-section-' + i;
            const heading = section.querySelector('.section-title');
            if (!heading) return;
            addFilter(section.id, heading.textContent.trim(), section.querySelectorAll('.card').length);
            section._setOpen = open => { if (open) choose(section.id); };
            // Cloud-created categories belong in the library, before saved/practice.
            const afterLibrary = document.getElementById('favoritesSection') || actions;
            home.insertBefore(section, afterLibrary);
        });
        choose(sections.some(section => section.id === preferred) ? preferred : 'all', false);
    };
    nav.append(intro, filters);
    sections[0]?.before(nav);
    // Practice tools follow the library; reading is the primary home-page task.
    home.append(actions, home.querySelector('.practice-details'));
    refreshFilters();
    document.addEventListener('stotras-updated', refreshFilters);
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
