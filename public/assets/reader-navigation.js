/* Accessible reader controls; no network dependency. */
function jumpToVerse(value) {
    const block = document.getElementById('verse-' + Number(value));
    if (!block) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    block.scrollIntoView({behavior: reduce ? 'instant' : 'smooth', block: 'start'});
    block.focus({preventScroll: true});
}
function resumeReading() {
    const read = readSet(currentType);
    const next = stotramConfig[currentType].data.findIndex((_, i) => !read.has(i));
    jumpToVerse(next < 0 ? 0 : next);
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
    const search = document.createElement('button');
    search.textContent = 'స్తోత్రం వెతకండి / Search';
    search.onclick = () => openSearch();
    nav.appendChild(search);
    home.querySelectorAll('.cards-section').forEach((section, i) => {
        section.id ||= 'library-section-' + i;
        const heading = section.querySelector('.section-title');
        if (!heading) return;
        const link = document.createElement('a');
        link.href = '#' + section.id;
        link.textContent = heading.textContent;
        nav.appendChild(link);
    });
    home.querySelector('.welcome-section').after(nav);
    // Preserve existing card styling while enabling keyboard activation.
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
