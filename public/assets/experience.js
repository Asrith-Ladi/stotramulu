/* Shared navigation: return from any reading/practice screen to a home destination. */
document.addEventListener('DOMContentLoaded', () => {
    const links = [...document.querySelectorAll('[data-home-target]')];
    links.forEach(link => link.addEventListener('click', event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const home = document.getElementById('homePage');
        if (home.style.display === 'none') goHome();
        const target = document.getElementById(link.dataset.homeTarget);
        if (!target) return;
        target.tabIndex = -1;
        target.focus({preventScroll: true});
        target.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
    }));
    // Reflect the section being viewed, including after returning from the reader.
    const update = () => {
        if (document.getElementById('homePage').style.display === 'none') {
            links.forEach(link => link.removeAttribute('aria-current'));
            return;
        }
        let active = 'homePage';
        const targets = links.map(link => document.getElementById(link.dataset.homeTarget)).filter(Boolean);
        targets.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        targets.forEach(target => { if (target.getBoundingClientRect().top <= 190) active = target.id; });
        links.forEach(link => {
            if (link.dataset.homeTarget === active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
    };
    let scheduled = false;
    window.addEventListener('scroll', () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { update(); scheduled = false; });
    }, {passive: true});
    new MutationObserver(update).observe(document.getElementById('homePage'), {attributes:true, attributeFilter:['style']});
    update();
    const skip = document.querySelector('.skip-link');
    skip.addEventListener('click', event => {
        event.preventDefault();
        const visible = ['readerPage', 'trackPage', 'japamalaPage'].map(id => document.getElementById(id)).find(el => el?.classList.contains('active')) || document.getElementById('homePage');
        visible.tabIndex = -1;
        visible.focus();
    });
});
