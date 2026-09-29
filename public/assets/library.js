/* Phase 2: device-local favorites and bookmarkable reader URLs. */
const FAVORITES_KEY = 'stotramFavorites';
let favoriteKeys = loadFavorites();
let applyingReaderRoute = false;
function isVisibleStotram(key) {
    return Object.hasOwn(stotramConfig, key) && !stotramConfig[key].hidden && Array.isArray(stotramConfig[key].data);
}
function loadFavorites() {
    try {
        const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
        return new Set(Array.isArray(stored) ? stored.filter(k => typeof k === 'string') : []);
    } catch (_) { return new Set(); }
}
function readerUrl(type) {
    const url = new URL(window.location.href);
    if (type) url.searchParams.set('stotram', type);
    else url.searchParams.delete('stotram');
    // Keep the originating tab so Back returns to the same collection.
    return url;
}
function handlePrayerCardClick(event, type) {
    if (!isVisibleStotram(type)) return;
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openReader(type);
}
function enhancePrayerCards(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('a.card[data-stotram]').forEach(card => {
        const type = card.dataset.stotram;
        if (!isVisibleStotram(type)) return;
        card.href = readerUrl(type).href;
        if (card.dataset.readerLinkReady === 'true') return;
        card.dataset.readerLinkReady = 'true';
        card.addEventListener('click', event => handlePrayerCardClick(event, type));
    });
}

function syncReaderRoute(type) {
    updateFavoriteButton(type);
    if (applyingReaderRoute) return;
    const url = readerUrl(type);
    if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}
function updateFavoriteButton(type) {
    const button = document.getElementById('favoriteButton');
    if (!button) return;
    const saved = favoriteKeys.has(type);
    // CSS draws the outline/filled star from aria-pressed.
    button.textContent = saved ? 'ఇష్టమైనవాటిలో ఉంది' : 'ఇష్టమైనవాటిలో చేర్చు';
    button.setAttribute('aria-pressed', String(saved));
}
function toggleFavorite() {
    if (!currentType) return;
    if (favoriteKeys.has(currentType)) favoriteKeys.delete(currentType);
    else favoriteKeys.add(currentType);
    let message = favoriteKeys.has(currentType) ? 'ఇష్టమైనవాటిలో చేర్చబడింది.' : 'ఇష్టమైనవాటి నుండి తీసివేయబడింది.';
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteKeys])); }
    catch (_) { message += ' ఈ పరికరంలో సేవ్ కాలేదు; ఈసారి మాత్రమే కనిపిస్తుంది.'; }
    updateFavoriteButton(currentType);
    renderFavorites();
    document.getElementById('readerLinkStatus').textContent = message;
}
// Text for the favourite tile markup (titles and icons can come from the
// cloud, so they are always escaped).
function favoriteText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
}
function favoriteTileHtml(key) {
    const cfg = stotramConfig[key];
    const theme = String(cfg.theme || '').replace(/[^\w-]/g, '');
    const icon = typeof window.stotramIcon === 'function' ? window.stotramIcon(key) : (cfg.__icon || '🕉️');
    return '<span class="today-ico medallion' + (theme ? ' ' + theme : '') + '" aria-hidden="true">' + favoriteText(icon) + '</span>' +
        '<span class="today-title">' + favoriteText(cfg.title) + '</span>' +
        '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-chevron-right"/></svg>';
}
function renderFavorites() {
    let section = document.getElementById('favoritesSection');
    if (!section) {
        section = document.createElement('section');
        section.id = 'favoritesSection';
        section.className = 'favorites-section';
        section.setAttribute('aria-labelledby', 'favoritesTitle');
        const home = document.getElementById('homePage');
        if (home.querySelector('.home-primary-actions')) home.querySelector('.home-primary-actions').before(section);
        else home.insertBefore(section, home.querySelector('.cards-section'));
    }
    // Built with appendChild / innerHTML only: tools/verify-library.cjs runs this
    // against a minimal fake DOM (no append, classList or querySelector).
    section.replaceChildren();
    const head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = '<h2 id="favoritesTitle">మీకు ఇష్టమైన స్తోత్రాలు</h2>' +
        '<button type="button" class="info-btn" data-info="favorites" aria-label="వివరణ: ఇష్టమైన స్తోత్రాలు">' +
        '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-info"/></svg></button>';
    section.appendChild(head);
    const list = document.createElement('div');
    list.className = 'today-strip favorites-grid';
    let count = 0;
    for (const key of favoriteKeys) {
        if (!isVisibleStotram(key)) continue;
        const link = document.createElement('a');
        link.className = 'today-tile';
        link.href = readerUrl(key).href;
        // The plain title first (what a parser-less DOM such as the verify
        // sandbox keeps), then the full tile: medallion, title, chevron.
        link.textContent = stotramConfig[key].title;
        link.innerHTML = favoriteTileHtml(key);
        link.onclick = event => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            openReader(key);
        };
        list.appendChild(link);
        count++;
    }
    if (count) {
        section.appendChild(list);
        return;
    }
    const empty = document.createElement('div');
    empty.className = 'empty-state favorites-empty';
    empty.innerHTML =
        '<span class="empty-state-mark" aria-hidden="true"><svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-star"/></svg></span>' +
        '<h3>ఇంకా ఇష్టమైనవి లేవు</h3>' +
        '<p>ఏ స్తోత్రం తెరిచినా "ఇష్టమైనవాటిలో చేర్చు" నొక్కండి — అది ఇక్కడ కనిపిస్తుంది.</p>' +
        '<a class="btn btn-primary" href="#library" onclick="event.preventDefault(); navigateView(\'library\')">స్తోత్రాలు చూడండి</a>';
    section.appendChild(empty);
}
async function copyReaderLink() {
    if (!currentType) return;
    const url = readerUrl(currentType).href;
    const status = document.getElementById('readerLinkStatus');
    const fallback = document.getElementById('readerLinkFallback');
    try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        fallback.hidden = true;
        status.textContent = 'లింక్ కాపీ అయింది. ఇతరులకు పంపవచ్చు లేదా బుక్‌మార్క్ చేసుకోవచ్చు.';
    } catch (_) {
        fallback.hidden = false;
        fallback.value = url;
        fallback.focus();
        fallback.select();
        status.textContent = 'ఈ లింక్‌ను కాపీ చేసుకోండి.';
    }
}
function applyReaderRoute() {
    const type = new URL(window.location.href).searchParams.get('stotram');
    applyingReaderRoute = true;
    try {
        if (type && isVisibleStotram(type)) openReader(type);
        else {
            goHome();
            // Keep unknown keys available for the asynchronous cloud load.
        }
    } finally { applyingReaderRoute = false; }
}
window.addEventListener('popstate', applyReaderRoute);
window.addEventListener('storage', event => {
    if (event.key === FAVORITES_KEY || event.key === null) {
        favoriteKeys = loadFavorites();
        renderFavorites();
        updateFavoriteButton(currentType);
    }
});
document.addEventListener('DOMContentLoaded', () => {
    enhancePrayerCards();
    renderFavorites();
    if (new URL(window.location.href).searchParams.has('stotram')) applyReaderRoute();
});

document.addEventListener('stotras-updated', () => {
    enhancePrayerCards();
    renderFavorites();
    const type = new URL(window.location.href).searchParams.get('stotram');
    if (type && isVisibleStotram(type) && currentType !== type) applyReaderRoute();
});
