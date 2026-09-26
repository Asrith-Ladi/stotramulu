/* Independent, bookmarkable views. Category filtering stays inside Library. */
document.addEventListener('DOMContentLoaded', () => {
    const home = document.getElementById('homePage');
    const routes = {homePage:'home', library:'library', favoritesSection:'saved', practice:'practice'};
    const links = [...document.querySelectorAll('[data-home-target]')];
    function currentView() {
        const hash = location.hash.slice(1);
        return Object.values(routes).includes(hash) ? hash : 'home';
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
        const view = currentView();
        home.dataset.view = view;
        links.forEach(link => {
            if (routes[link.dataset.homeTarget] === view) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
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
    links.forEach(link => {
        link.href = '#' + routes[link.dataset.homeTarget];
        link.addEventListener('click', event => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate(routes[link.dataset.homeTarget]);
        });
    });
    document.querySelector('.primary-link').addEventListener('click', event => {
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
    render();
    document.querySelector('.skip-link').addEventListener('click', event => {
        event.preventDefault();
        const visible = ['readerPage','trackPage','japamalaPage'].map(id => document.getElementById(id)).find(el => el?.classList.contains('active')) || home;
        visible.tabIndex = -1; visible.focus();
    });
});
