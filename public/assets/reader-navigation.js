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
    const text = document.getElementById('readerProgressText');
    const bar = document.getElementById('readerProgressBar');
    const select = document.getElementById('verseJump');
    if (text) text.textContent = `శ్లోకం ${nextIndex + 1} / ${total}`;
    if (bar) {
        bar.max = total;
        bar.value = nextIndex + 1;
        bar.setAttribute('aria-valuetext', `${nextIndex + 1} of ${total}`);
    }
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
    if (categoryNav) categoryNav.after(section);
    else home.querySelector('.home-primary-actions').after(section);
}
function setupReaderNavigation(type) {
    const cfg = stotramConfig[type];
    document.getElementById('readerProgressTitle').textContent = cfg.title;
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
    const meaningsNote = document.createElement('p');
    meaningsNote.textContent = 'అర్థాలు అందుబాటులో ఉన్న చోట మాత్రమే కనిపిస్తాయి; వాటి సమీక్ష ఇంకా పూర్తికాలేదు.';
    content.appendChild(meaningsNote);
    document.getElementById('sourceDetails').open = !!(audit && audit.needsReview);
}
document.addEventListener('DOMContentLoaded', () => {
    const home = document.getElementById('homePage');
    const actions = home.querySelector('.home-primary-actions');
    actions.id = 'homePrimaryActions';

    const actionsToggle = document.createElement('button');
    actionsToggle.type = 'button';
    actionsToggle.className = 'home-actions-toggle';
    actionsToggle.setAttribute('aria-controls', actions.id);
    const actionsLabel = document.createElement('span');
    actionsLabel.textContent = '☰ ముఖ్య ఎంపికలు';
    const actionsHint = document.createElement('small');
    actionsHint.textContent = 'వెతకండి · జపమాల · ట్రాక్ · మరిన్ని';
    actionsToggle.append(actionsLabel, actionsHint);
    const setActionsOpen = open => {
        actions.hidden = !open;
        actionsToggle.classList.toggle('is-open', open);
        actionsToggle.setAttribute('aria-expanded', String(open));
    };
    actionsToggle.addEventListener('click', () => setActionsOpen(actions.hidden));
    actions.before(actionsToggle);
    setActionsOpen(false);

    const nav = document.createElement('nav');
    nav.className = 'library-navigation library-selector';
    nav.setAttribute('aria-label', 'స్తోత్రాల విభాగాలు');
    const categoryLabel = document.createElement('label');
    categoryLabel.htmlFor = 'libraryCategorySelect';
    categoryLabel.textContent = 'విభాగం ఎంచుకోండి';
    const categorySelect = document.createElement('select');
    categorySelect.id = 'libraryCategorySelect';

    home.querySelectorAll('.cards-section').forEach((section, i) => {
        section.id ||= 'library-section-' + i;
        const heading = section.querySelector('.section-title');
        if (!heading) return;
        const title = heading.textContent.trim();
        const count = section.querySelectorAll('.card').length;
        const countBadge = document.createElement('span');
        countBadge.className = 'section-count';
        countBadge.textContent = String(count);
        countBadge.setAttribute('aria-label', count + ' స్తోత్రాలు');
        heading.appendChild(countBadge);
        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = title + ' — ' + count;
        categorySelect.appendChild(option);
    });
    nav.append(categoryLabel, categorySelect);
    actions.after(nav);

    const preferredCategory = loadLibraryCategory();
    home.querySelectorAll('.cards-section').forEach((section, index) => {
        const grid = section.querySelector('.cards-grid');
        const divider = section.querySelector('.section-divider');
        if (!grid || !divider) return;
        grid.id ||= section.id + '-cards';
        divider.classList.add('collapsible-section-heading');
        divider.tabIndex = 0;
        divider.setAttribute('role', 'button');
        divider.setAttribute('aria-controls', grid.id);
        const setOpen = (open, remember = true) => {
            if (open) {
                home.querySelectorAll('.cards-section').forEach(other => {
                    if (other !== section && other._setOpen) other._setOpen(false, false);
                });
                categorySelect.value = section.id;
                if (remember) rememberLibraryCategory(section.id);
            }
            grid.hidden = !open;
            divider.classList.toggle('is-open', open);
            divider.setAttribute('aria-expanded', String(open));
        };
        section._setOpen = setOpen;
        const toggle = () => setOpen(grid.hidden);
        divider.addEventListener('click', toggle);
        divider.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
        });
        setOpen(section.id === preferredCategory || (!preferredCategory && index === 0), false);
    });
    if (!home.querySelector('.collapsible-section-heading.is-open')) {
        home.querySelector('.cards-section')?._setOpen?.(true, false);
    }
    categorySelect.addEventListener('change', () => {
        const section = document.getElementById(categorySelect.value);
        if (!section) return;
        section._setOpen?.(true);
        section.scrollIntoView({behavior:'smooth', block:'start'});
    });
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
