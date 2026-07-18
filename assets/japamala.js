/* ============================================================
   JAPAMALA — opens the standalone 3D mala (built React/Three.js app
   living in /mala/) inside an iframe. The iframe src is set lazily on
   first open so the heavy 3D bundle is NOT loaded on the home page.

   To update the 3D mala: edit the mala3d project, `npm run build`, then
   copy its dist/ into this site's /mala/ folder.
   Depends on globals from app.js: gaEvent.
============================================================ */
const MALA_SRC = 'mala/index.html';
let malaLoaded = false;

function openJapamala() {
    // close overlays + release any scroll lock (mirror openTrack/goHome)
    document.getElementById('searchOverlay').classList.remove('active');
    document.getElementById('daySheetOverlay').classList.remove('active');
    document.body.style.overflow = '';

    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.remove('active');
    document.getElementById('trackPage').classList.remove('active');
    document.getElementById('japamalaPage').classList.add('active');
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('headerActions').style.display = 'none';
    gaEvent('screen_view', { screen_name: 'Japamala' });

    // lazy-load the 3D mala only the first time
    const frame = document.getElementById('malaFrame');
    if (frame && !malaLoaded) {
        frame.src = MALA_SRC;
        malaLoaded = true;
    }
    sizeMalaFrame();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Fill the iframe to the viewport height below the sticky header.
function sizeMalaFrame() {
    const frame = document.getElementById('malaFrame');
    const header = document.querySelector('.header');
    if (!frame) return;
    const h = window.innerHeight - (header ? header.offsetHeight : 0);
    frame.style.height = Math.max(360, h) + 'px';
}
window.addEventListener('resize', sizeMalaFrame);
