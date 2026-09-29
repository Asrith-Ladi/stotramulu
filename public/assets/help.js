/* ============================================================
   ⓘ HELP — short, plain-Telugu explanations for every feature.

   Any element with data-info="KEY" opens the info sheet (#infoOverlay)
   with HELP[KEY]. One capture-phase click listener serves every ⓘ on
   the page, including the ones other scripts build later, and stops
   the click there. That is also what keeps the Japamala page's own
   onclick from counting a bead when its ⓘ is tapped.

   The keys must match every data-info in index.html and in the
   JS-built markup exactly (docs/redesign-research/contract.md §6).
   window.HELP_KEYS is exported so the checks can compare them.

   Exports: window.showInfo(key, trigger?), window.closeInfo(),
            window.HELP_KEYS
============================================================ */
(function () {
  'use strict';

  /* Each entry: title, body (1–3 short sentences; an array is one <p>
     per item), gloss (one short English line). Written for older
     readers: plain words, the same names the buttons show. */
  const HELP = {
    'welcome': {
      title: 'ఈ సైట్ ఎలా వాడాలి?',
      body: [
        'స్క్రీన్ కింద ఉన్న నాలుగు బటన్లతో (కంప్యూటర్‌లో పైన) కావలసిన చోటుకి వెళ్ళండి: ముఖపుట, స్తోత్రాలు, ఇష్టమైనవి, నా సాధన.',
        'ఏ స్తోత్రమైనా వెంటనే కావాలంటే, పైన ఉన్న భూతద్దం గుర్తు (వెతకండి) నొక్కి పేరు టైప్ చేయండి, లేదా మైక్ నొక్కి చెప్పండి.',
        'ఏది అర్థం కాకపోయినా, దాని పక్కన ఉన్న ⓘ గుర్తు నొక్కండి — సులభమైన వివరణ వస్తుంది.'
      ],
      gloss: 'Four menu buttons (bottom of the screen; top on a computer), search at the top, and ⓘ beside anything for help.'
    },
    'today': {
      title: 'ఈ రోజు స్తోత్రాలు',
      body: [
        'వారంలో ఈ రోజు సంప్రదాయంగా పూజించే దేవుని స్తోత్రాలు ఇక్కడ కనిపిస్తాయి.',
        'ఇవి సూచనలు మాత్రమే — ఏ స్తోత్రమైనా ఏ రోజైనా చదవవచ్చు.'
      ],
      gloss: 'Stotras traditionally recited on this weekday. They are suggestions only.'
    },
    'recent': {
      title: 'ఇటీవల చదివినవి',
      body: [
        'మీరు చివరిగా చదివిన స్తోత్రాలు (మూడు వరకు) ఇక్కడ కనిపిస్తాయి.',
        'ఒకటి నొక్కితే, మీరు ఆపిన శ్లోకం నుంచే మళ్ళీ మొదలవుతుంది.'
      ],
      gloss: 'Up to three stotras you read last. Tap one to continue where you stopped.'
    },
    'categories': {
      title: 'స్తోత్రాల విభాగాలు',
      body: [
        'ఈ బటన్లతో సహస్రనామాలు, అష్టోత్తరాలు, స్తోత్రాలు, హారతులు విడివిడిగా చూడవచ్చు.',
        '"అన్నీ" నొక్కితే అన్నీ కలిపి కనిపిస్తాయి. మీరు చివరిగా ఎంచుకున్న విభాగం గుర్తుంటుంది.'
      ],
      gloss: 'Show one category at a time; “All” shows everything. Your choice is remembered.'
    },
    'favorites': {
      title: 'ఇష్టమైనవి',
      body: [
        'ఏ స్తోత్రం తెరిచినా, "పఠన ఎంపికలు" లో "ఇష్టమైనవాటిలో చేర్చు" నొక్కితే అది ఇక్కడ చేరుతుంది.',
        'ఇష్టమైనవి ఈ ఫోన్‌లో మాత్రమే సేవ్ అవుతాయి.'
      ],
      gloss: 'Stotras you add to favourites appear here. They are saved on this phone only.'
    },
    'practice': {
      title: 'నా సాధన',
      body: [
        'జపమాల: ప్రతి నామం చెప్పినప్పుడు ఒకసారి నొక్కండి — 108 పూసల లెక్క అదే వేస్తుంది.',
        'పూజా ట్రాక్: రోజువారీ ప్రదక్షిణలు, జపాలు, మొక్కులు క్యాలెండర్‌లో నమోదు చేసుకోండి.',
        'కింద ఉన్న ప్రదక్షిణ లెక్కతో గుడిలో చేసిన ప్రదక్షిణలు కూడా లెక్కించవచ్చు.'
      ],
      gloss: 'Japamala counts your chants bead by bead; Pooja Track keeps a daily log of your practice and vows.'
    },
    'pradakshina': {
      title: 'ప్రదక్షిణ లెక్క',
      body: [
        'గుడిలో చేసిన ప్రతి ప్రదక్షిణకు ＋ బటన్ ఒకసారి నొక్కండి.',
        'తేదీ మార్చి పాత రోజుల లెక్క కూడా వేయవచ్చు. గుండ్రని బాణం బటన్ నొక్కితే ఆ రోజు లెక్క 0 అవుతుంది.'
      ],
      gloss: 'Tap + for each round. Change the date to log past days; the reset button sets that day back to 0.'
    },
    'reader-tools': {
      title: 'అక్షరాలు & వెతుకులాట',
      body: [
        '"అ−", "అ+" బటన్లతో అక్షరాల పరిమాణం మార్చండి — అది అన్ని స్తోత్రాలకూ గుర్తుంటుంది.',
        '"పాఠంలో వెతకండి" పెట్టెలో ఒక పదం టైప్ చేస్తే, అది ఉన్న చోట్లు గుర్తుగా కనిపిస్తాయి.',
        'పైకి, కిందకి బాణాలతో ఒక్కో చోటికి వెళ్ళండి.'
      ],
      gloss: 'A− / A+ change the text size (remembered for every stotram). Search this text and step through the matches with ↑ ↓.'
    },
    'meanings': {
      title: 'అర్థాలు',
      body: [
        'ఇది ఆన్ చేస్తే ప్రతి శ్లోకం కింద దాని అర్థం కనిపిస్తుంది.',
        'బ్రాకెట్‌లోని సంఖ్యలు ఎన్ని శ్లోకాలకు అర్థం ఉందో చెబుతాయి (ఉదా: 40/108).'
      ],
      gloss: 'Shows the meaning under each verse. The numbers show how many verses have a meaning.'
    },
    'jump': {
      title: 'శ్లోకానికి వెళ్ళడం',
      body: [
        'జాబితాలో శ్లోకం సంఖ్య ఎంచుకుంటే నేరుగా ఆ శ్లోకానికి వెళ్తుంది.',
        '"చదవడం కొనసాగించు" నొక్కితే మీరు చివరిగా ఆపిన చోటుకి తీసుకెళ్తుంది.',
        'పెద్ద స్తోత్రాల్లో ధ్యానం, నామావళి వంటి ముఖ్య భాగాలకు బటన్లు కూడా కనిపిస్తాయి.'
      ],
      gloss: 'Jump to any verse or section; “Continue reading” takes you back to where you stopped.'
    },
    'save-share': {
      title: 'సేవ్ & పంపండి',
      body: [
        '"ఇష్టమైనవాటిలో చేర్చు" నొక్కితే ఈ స్తోత్రం "ఇష్టమైనవి" లో చేరుతుంది.',
        '"లింక్ కాపీ చేయండి" నొక్కి, WhatsApp లో ఇతరులకు పంపవచ్చు.',
        '"చదివిన గుర్తులు తొలగించు" ఈ స్తోత్రంలో మీరు పెట్టిన గుర్తులన్నీ తీసేస్తుంది.'
      ],
      gloss: 'Add to favourites, copy a link to share, or clear your read marks for this stotram.'
    },
    'parayana': {
      title: 'పారాయణ లెక్క',
      body: [
        'ఈ స్తోత్రాన్ని పూర్తిగా ఒకసారి చదివిన ప్రతిసారీ ＋ బటన్ నొక్కండి.',
        'లెక్క తేదీ వారీగా సేవ్ అవుతుంది; తేదీ మార్చి పాత రోజులది కూడా వేయవచ్చు.'
      ],
      gloss: 'Tap + each time you finish a full recitation. Counts are saved per date.'
    },
    'source': {
      title: 'మూలాల స్థితి',
      body: [
        'ఈ పాఠాన్ని ప్రామాణిక గ్రంథాలతో పోల్చి సరిచూశామో లేదో ఈ గుర్తు చెబుతుంది.',
        '"పరిశీలించబడింది" అంటే సరిచూశాం; "సమీక్ష" లేదా "పెండింగ్" అంటే ఇంకా సరిచూస్తున్నాం.',
        'తప్పు కనిపిస్తే, శ్లోకాల కింద ఉన్న "ఈ స్తోత్రంలో తప్పు కనిపించిందా? తెలియజేయండి" బటన్ నొక్కండి.'
      ],
      gloss: 'Shows whether this text has been checked against standard sources.'
    },
    'signin': {
      title: 'Google తో సైన్ ఇన్',
      body: [
        'సైన్ ఇన్ చేస్తే మీ ప్రదక్షిణలు, జపమాల లెక్క, మొక్కులు, చదివిన గుర్తులు ఆన్‌లైన్‌లో భద్రంగా ఉంటాయి.',
        'కొత్త ఫోన్‌లో అదే Google ఖాతాతో సైన్ ఇన్ చేస్తే అవన్నీ తిరిగి వస్తాయి.',
        'సైన్ ఇన్ చేసి పంపిన సందేశాలకు మా జవాబులు "నా సందేశాలు" లో కనిపిస్తాయి.'
      ],
      gloss: 'Signing in keeps your counts, vows and read marks safe across phones, and shows our replies to you.'
    },
    'calendar': {
      title: 'పూజా క్యాలెండర్',
      body: [
        'ఏ రోజునైనా నొక్కి, ఆ రోజు చేసిన ప్రదక్షిణలు, జపాలు నమోదు చేయండి.',
        'చుక్క ఉన్న రోజుల్లో మీరు ఏదో నమోదు చేశారని అర్థం.',
        'పక్కకు జరిపి, లేదా బాణాలు నొక్కి, వేరే నెలలు చూడవచ్చు.'
      ],
      gloss: 'Tap a day to log it. A dot means something is logged. Swipe or use the arrows for other months.'
    },
    'mokku': {
      title: 'మొక్కులు',
      body: [
        'మొక్కు అంటే దేవునికి చేసుకున్న ప్రమాణం.',
        'ఇక్కడ రాసి తేదీ పెడితే, ఆ రోజు పూజా ట్రాక్‌లో గుర్తుచేస్తాం.',
        'తీర్చుకున్నాక, ఎడమ వైపు ఉన్న గుండ్రం నొక్కండి.'
      ],
      gloss: 'Write down a vow with an optional reminder date; tick the circle once it is fulfilled.'
    },
    'day-japa': {
      title: 'ఆ రోజు పారాయణం / జపం',
      body: [
        'కింద ఉన్న పేర్లలో ఒకటి నొక్కి, ఆ రోజు చేసిన పారాయణం లేదా జపం జోడించండి. జాబితాలో లేనిది "వేరే…" తో రాయండి.',
        '"లక్ష్యం" నొక్కి ఎన్నిసార్లు చేయాలో (ఉదా: 11) పెట్టుకోండి; ＋, − తో లెక్క మార్చండి.'
      ],
      gloss: 'Add a japa or recitation for this day, tap “target” to set how many, and count with + / −.'
    },
    'japamala': {
      title: 'జపమాల',
      body: [
        'ప్రతి నామం చెప్పిన తర్వాత స్క్రీన్ మీద ఎక్కడైనా నొక్కండి — ఒక పూస ముందుకు కదులుతుంది.',
        '108 పూర్తయితే గంట మోగుతుంది, పూర్తయిన మాలల సంఖ్య పెరుగుతుంది.',
        'పైన ఉన్న నాలుగు రూపాలు మాల కనిపించే విధానాలు మాత్రమే; ఏది ఎంచుకున్నా లెక్క ఒక్కటే.'
      ],
      gloss: 'Tap anywhere after each chant. A bell rings at 108. All four looks share one count.'
    }
  };

  const KEYS = Object.freeze(Object.keys(HELP));
  const has = (key) => Object.prototype.hasOwnProperty.call(HELP, key);

  let savedOverflow = '';
  let returnTo = null;

  const byId = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function overlay() { return byId('infoOverlay'); }
  function isOpen() { const o = overlay(); return !!(o && o.classList.contains('active')); }
  // siteConfirm / siteAlert sit above every sheet and handle their own keys.
  // One that is fading out carries data-closing and no longer counts (the same
  // test app.js's Escape handler uses, so the two never disagree).
  function dialogOnTop() { return !!document.querySelector('.sc-overlay:not([data-closing])'); }

  function focusQuietly(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  function isShown(el) {
    return !!(el && el !== document.body && document.contains(el) && el.getClientRects().length);
  }

  /* ---------- open / close ---------- */
  function showInfo(key, trigger) {
    const o = overlay();
    if (!has(key)) { console.warn('[help] no explanation for data-info="' + key + '"'); return false; }
    if (!o) return false;
    const entry = HELP[key];
    const title = byId('infoTitle');
    const body = byId('infoBody');
    const gloss = byId('infoGloss');
    const paras = Array.isArray(entry.body) ? entry.body : [entry.body];

    if (title) title.textContent = entry.title;
    if (body) body.innerHTML = paras.map((p) => '<p>' + esc(p) + '</p>').join('');
    if (gloss) { gloss.textContent = entry.gloss || ''; gloss.hidden = !entry.gloss; }
    o.setAttribute('aria-describedby', 'infoBody');

    if (!o.classList.contains('active')) {
      // Another sheet may already hold the scroll lock (account, day sheet);
      // keep its value so closing this one hands it back unchanged.
      savedOverflow = document.body.style.overflow;
      returnTo = trigger || document.activeElement;
      o.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    const sheet = o.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;   // a long entry read earlier must not open half-way down
    focusQuietly(title);
    if (typeof gaEvent === 'function') { try { gaEvent('help_open', { key: key }); } catch (e) {} }
    return true;
  }

  function closeInfo() {
    const o = overlay();
    if (!o || !o.classList.contains('active')) return;
    o.classList.remove('active');
    document.body.style.overflow = savedOverflow;
    savedOverflow = '';
    const back = returnTo;
    returnTo = null;
    if (isShown(back)) focusQuietly(back);
  }

  /* Keep Tab inside the sheet while it is open (aria-modal). */
  function trapTab(e, root) {
    const list = Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      (el) => el.getClientRects().length > 0
    );
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) { e.preventDefault(); focusQuietly(e.shiftKey ? last : first); return; }
    const idx = list.indexOf(active);
    if (e.shiftKey && idx <= 0) { e.preventDefault(); focusQuietly(last); }
    else if (!e.shiftKey && idx === list.length - 1) { e.preventDefault(); focusQuietly(first); }
  }

  window.showInfo = showInfo;
  window.closeInfo = closeInfo;
  window.HELP_KEYS = KEYS;

  if (typeof document === 'undefined' || !document.addEventListener) return;

  /* One listener for every ⓘ, present or future. Capture phase, so it runs
     before the target's own onclick and before #japamalaPage's bead count. */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const el = t && t.closest ? t.closest('[data-info]') : null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    showInfo(el.getAttribute('data-info'), el);
  }, true);

  document.addEventListener('keydown', (e) => {
    const open = isOpen();
    const key = e.key;

    // Escape closes only the top sheet: this one, unless a confirm dialog is up.
    if (open && (key === 'Escape' || key === 'Esc')) {
      if (dialogOnTop()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeInfo();
      return;
    }

    // japamala.js turns Space into a bead count on the Japamala page. Keep it
    // away from the ⓘ button (so Space opens the sheet) and from the open sheet.
    // stopPropagation leaves the default action (button press) untouched.
    if (key === ' ' || key === 'Spacebar' || e.code === 'Space') {
      const onInfoBtn = e.target && e.target.closest && e.target.closest('[data-info]');
      if (open || onInfoBtn) e.stopPropagation();
      return;
    }

    if (open && key === 'Tab' && !dialogOnTop()) trapTab(e, overlay());
  }, true);
})();
