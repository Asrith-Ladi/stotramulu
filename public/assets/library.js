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
    url.hash = '';
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
    button.textContent = saved ? '★ ఇష్టమైన స్తోత్రం' : '☆ ఇష్టమైనవాటిలో చేర్చు';
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
function renderFavorites() {
    let section = document.getElementById('favoritesSection');
    if (!section) {
        section = document.createElement('section');
        section.id = 'favoritesSection';
        section.className = 'favorites-section';
        section.setAttribute('aria-labelledby', 'favoritesTitle');
        const home = document.getElementById('homePage');
        const today = document.getElementById('todaySection');
        if (today) today.after(section);
        else home.insertBefore(section, home.querySelector('.cards-section'));
    }
    section.replaceChildren();
    const heading = document.createElement('h2');
    heading.id = 'favoritesTitle';
    heading.textContent = 'మీకు ఇష్టమైన స్తోత్రాలు';
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'today-strip';
    for (const key of favoriteKeys) {
        const cfg = stotramConfig[key];
        if (!isVisibleStotram(key)) continue;
        const link = document.createElement('a');
        link.className = 'today-tile';
        link.href = readerUrl(key).href;
        link.textContent = cfg.title;
        link.onclick = event => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            openReader(key);
        };
        list.appendChild(link);
    }
    if (!list.children.length) {
        const hint = document.createElement('p');
        hint.textContent = 'స్తోత్రం తెరిచి ☆ నొక్కండి. ఇక్కడ నుంచి సులభంగా మళ్ళీ చదవవచ్చు.';
        section.appendChild(hint);
    } else section.appendChild(list);
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
