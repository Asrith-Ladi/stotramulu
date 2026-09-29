/* What's new: bundled entries, newest first. The admin dashboard can add more
   (Firestore "updates" collection); updates.js merges both and shows a dot on
   the bell until the reader has seen the newest one.
   Shape: { id, date: 'YYYY-MM-DD', tag: 'new' | 'improved' | 'fixed', title, body }
   Keep each body to one or two short, plain sentences. */
window.SITE_UPDATES = [
    {
        id: '2026-09-28-redesign',
        date: '2026-09-28',
        tag: 'new',
        title: 'సులభమైన కొత్త రూపం',
        body: 'నాలుగు పెద్ద బటన్ల మెను (ఫోన్‌లో స్క్రీన్ కింద), పెద్ద అక్షరాలు, ప్రశాంతమైన రంగులు. ఏ సదుపాయం పక్కనైనా ⓘ నొక్కితే తెలుగులో సులభమైన వివరణ వస్తుంది.'
    },
    {
        id: '2026-09-28-messages',
        date: '2026-09-28',
        tag: 'new',
        title: 'సమస్య తెలియజేయండి · నా సందేశాలు',
        body: 'స్తోత్రంలో తప్పు లేదా ఏదైనా సమస్య కనిపిస్తే, పైన ఉన్న వ్యక్తి గుర్తు (నా ఖాతా) నొక్కి మాకు తెలియజేయండి. Google తో సైన్ ఇన్ చేసి ఉంటే, మా జవాబు "నా సందేశాలు" లో కనిపిస్తుంది.'
    },
    {
        id: '2026-09-28-whatsnew',
        date: '2026-09-28',
        tag: 'new',
        title: 'కొత్తవి ఒకే చోట',
        body: 'కొత్త సదుపాయాలు, మార్పులు ఇక్కడే కనిపిస్తాయి. కొత్తది వచ్చినప్పుడు పైన గంట గుర్తు మీద చిన్న ఎర్ర చుక్క కనిపిస్తుంది.'
    },
    {
        id: '2026-09-28-reading',
        date: '2026-09-28',
        tag: 'improved',
        title: 'పఠనం మరింత సులభం',
        body: 'శ్లోకాలు కాగితం లాంటి కార్డులపై పెద్ద అక్షరాలతో కనిపిస్తాయి, చదివినవి స్పష్టంగా గుర్తుగా ఉంటాయి. అక్షరాల పరిమాణం, పాఠంలో వెతుకులాట ఎప్పుడూ పైనే అందుబాటులో ఉంటాయి.'
    },
    {
        id: '2026-09-28-dayjapa',
        date: '2026-09-28',
        tag: 'fixed',
        title: 'పూజా ట్రాక్‌లో జపం లెక్క',
        body: 'క్యాలెండర్‌లో ఏ రోజైనా తెరిచి జపం ＋ / − నొక్కితే, ఇప్పుడు ఆ రోజు లెక్కే సరిగ్గా మారుతుంది.'
    }
];
