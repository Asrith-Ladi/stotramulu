/* Independent, bookmarkable views. Category filtering stays inside Library.

   Also keeps two pieces of state in step with whatever page is showing:
   - html[data-screen] = home | reader | track | japamala (layout.css reads it
     for the back button and the tab bar), and
   - aria-current="page" on the four menu links: Home's panels by their view,
     the reader under "Library", Track and Japamala under "My practice".
   Exports: window.navigateView(view), view ∈ home | library | saved | practice. */
document.addEventListener('DOMContentLoaded', () => {
    const home = document.getElementById('homePage');
    const routes = {homePage:'home', library:'library', favoritesSection:'saved', practice:'practice'};
    const views = Object.values(routes);
    const links = [...document.querySelectorAll('[data-home-target]')];
    const pages = {reader:'readerPage', track:'trackPage', japamala:'japamalaPage'};
    function currentView() {
        const hash = location.hash.slice(1);
        return views.includes(hash) ? hash : 'home';
    }
    function currentScreen() {
        for (const [screen, id] of Object.entries(pages)) {
            if (document.getElementById(id)?.classList.contains('active')) return screen;
        }
        return 'home';
    }
    // After a page change, focus goes to the new page's heading, so a screen
    // reader announces it and Tab starts at the top of that page. Home only
    // takes focus when the old focus vanished along with the page it sat on.
    const headings = {reader:'readerTitle', track:'trackTitle', japamala:'jmTitle'};
    function focusScreen(screen) {
        // A sheet or dialog on top keeps focus; the page changed underneath it.
        if (document.querySelector('.search-overlay.active, .sheet-overlay.active, .feedback-overlay.active, .day-sheet-overlay.active, .sc-overlay:not([data-closing])')) return;
        const active = document.activeElement;
        const lost = !active || active === document.body || !active.getClientRects().length;
        let target = home;
        if (screen !== 'home') {
            target = document.getElementById(headings[screen]);
            const page = document.getElementById(pages[screen]);
            if (!target || (page && page.contains(active))) return;
            target.tabIndex = -1;
        } else if (!lost) return;
        try { target.focus({preventScroll:true}); } catch (e) { /* focus is best-effort */ }
    }
    // The page on screen decides which menu link is current.
    let lastScreen = null;
    function syncScreen() {
        const screen = currentScreen();
        const root = document.documentElement;
        if (root.dataset.screen !== screen) root.dataset.screen = screen;
        if (lastScreen !== null && lastScreen !== screen) focusScreen(screen);
        lastScreen = screen;
        const view = screen === 'reader' ? 'library'
            : (screen === 'track' || screen === 'japamala') ? 'practice' : currentView();
        links.forEach(link => {
            if (routes[link.dataset.homeTarget] === view) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
    }
    function organize() {
        [...home.children].forEach(section => {
            section.dataset.panel = section.matches('.cards-section, .library-navigation') ? 'library'
                : section.matches('.favorites-section') ? 'saved'
                : section.matches('.home-primary-actions, .practice-details') ? 'practice' : 'home';
        });
    }
    function render() {
        organize();
        home.dataset.view = currentView();
        syncScreen();
    }
    function navigate(view) {
        const url = new URL(location.href);
        url.searchParams.delete('stotram');
        url.hash = view;
        // Avoid a second history entry when closing the reader or a practice tool.
        const wasApplying = applyingReaderRoute;
        applyingReaderRoute = true;
        try { goHome(); } finally { applyingReaderRoute = wasApplying; }
        if (url.href !== location.href) history.pushState(null, '', url);
        render();
        window.scrollTo({top:0, behavior:'instant'});
        home.focus({preventScroll:true});
    }
    // For links and buttons built by other scripts (e.g. the empty Saved list).
    window.navigateView = view => navigate(views.includes(view) ? view : 'home');
    links.forEach(link => {
        link.href = '#' + routes[link.dataset.homeTarget];
        link.addEventListener('click', event => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate(routes[link.dataset.homeTarget]);
        });
    });
    document.querySelector('.primary-link')?.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); navigate('library');
    });
    window.addEventListener('popstate', render);
    window.addEventListener('hashchange', () => {
        if (!new URL(location.href).searchParams.has('stotram')) {
            const wasApplying = applyingReaderRoute;
            applyingReaderRoute = true;
            try { goHome(); } finally { applyingReaderRoute = wasApplying; }
        }
        render();
    });
    new MutationObserver(organize).observe(home, {childList:true});
    // openReader / openTrack / openJapamala / goHome only toggle .active on the
    // pages and write #homePage's inline display; follow those writes.
    const screenWatch = new MutationObserver(syncScreen);
    Object.values(pages).forEach(id => {
        const page = document.getElementById(id);
        if (page) screenWatch.observe(page, {attributes:true, attributeFilter:['class']});
    });
    screenWatch.observe(home, {attributes:true, attributeFilter:['style']});
    render();
    document.querySelector('.skip-link')?.addEventListener('click', event => {
        event.preventDefault();
        const visible = Object.values(pages).map(id => document.getElementById(id)).find(el => el?.classList.contains('active')) || home;
        visible.tabIndex = -1; visible.focus();
    });
});
