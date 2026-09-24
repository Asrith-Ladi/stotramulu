# Content audit — 21 September 2026

This review covers all 20 bundled stotram files (18 visible and two hidden Manidweepa drafts). It is not a blanket certification of authenticity. Confirmed omissions were corrected; uncertain editions, spelling, attribution and meanings are explicitly flagged. The live Firestore content was not inspected or changed: an admin override can still replace a bundled text. The reader now distinguishes overridden content from this audit.

## Findings and changes

| Text | Result | Action / limitation |
| --- | --- | --- |
| Lalitha Sahasranamam | Serious omissions inside ranges labelled 41–80 and 81–183; the labels overstated completeness. | Restored the main text as 183 individually numbered entries and four dhyana verses. Number 183 includes the final half-verse and concluding line. Source: [Sanskrit Documents](https://sanskritdocuments.org/doc_devii/lalita.html), Sanskrit rendered into Telugu script. [Vaidika Vignanam](https://vignanam.org/telugu/sree-lalita-sahasra-nama-stotram.html) used for additional reference checks. Purvapeethika, nyasa and phalashruti remain outside this edition and are now explicitly identified as excluded. |
| Venkateswara Suprabhatam | Only 19 numbered entries; the end jumped to verses corresponding to 28–29. An earlier verse was also corrupted. | Replaced with all 29 Sanskrit verses in Telugu script from [Stotra Nidhi](https://stotranidhi.com/venkateshwara-suprabhatam-in-telugu/). No modern commentary copied. The separate Stotram, Prapatti and Mangalasasanam are not included. [TTD publication](https://ebooks.tirumala.org/downloads/sri_venkatewara_suprabatham_new.pdf) is a recommended institutional review source, not a completed PDF collation. |
| Vishnu Sahasranamam | All 107 main-text verses were collated line by line against the selected Mahabharata edition. Verse 66 was missing the initial **అ** in **అవిధేయాత్మా**. | Corrected verse 66 and versioned the reading state. Thirteen remaining normalized differences are documented sandhi, script, or edition variants; the [temple comparison](https://www.ohtccwa.org/pooja_library/vishnu_sahasranamam_te) supports the retained local readings where the selected [Sanskrit Documents edition](https://sanskritdocuments.org/doc_vishhnu/vsahasranew.html) differs. Introductory material and phalashruti remain abbreviated, so the edition is marked partially verified. See vishnu-collation.json. |
| Lingashtakam | Eight verses and phalashruti present; known wording differences occur between editions. | Retained. For example, verse 7 has vinashita versus vinashana; [Sanskrit Documents](https://sanskritdocuments.org/doc_shiva/lingashh.html) explicitly records a variant. Also checked [Vaidika Vignanam](https://vignanam.org/mobile/telugu/lingashtakam.html). |
| Bilvashtakam | Eight verses, but substantial selection/order differences from the comparison edition. | Flagged; do not assume a different recension is automatically wrong. Needs identification of the actual source edition. [Reference](https://sanskritdocuments.org/doc_shiva/bilvaashhtaka.html). |
| Hanuman Chalisa | All 40 chaupais present with opening/closing dohas. Telugu spellings often Sanskritize Awadhi pronunciation. | Retained and flagged for pronunciation review against [reference](https://sanskritdocuments.org/doc_hanumaana/hanuman40.html). Automatic string differences here are especially unreliable as omission evidence. |
| Govinda Namalu | Nine blocks labelled 1–108, with opening material repeated before the numbered sequence. | Repetition can be intentional in singing. No single 108-name canon established in this review; flag the edition/order. [Comparison](https://stotrams.com/stotra/govinda-namaavali/telugu). No complete line-by-line collation completed. |
| Sai Harati | Contains the Marathi “Aarti Saibaba” song rendered in Telugu with refrain repetitions. | Flagged: do not represent this single hymn as the complete Dhoop Aarti service. [Shirdi Sansthan](https://sai.org.in/en) is the institutional source to consult; the attempted lyric endpoint was unavailable. Full lyric validation remains pending. |
| Manidweepa (traditional draft) | Hidden draft presents a Telugu paraphrase as a scriptural text. No matching source found. | Kept hidden; removed unsupported “traditional/scriptural” title and origin claims. Marked unverified. |
| Manidweepa (sung draft) | Hidden draft does not match the familiar 32-verse Telugu composition. | Kept hidden and marked unverified. Compare [Vaidika Vignanam](https://vignanam.org/mobile/telugu/manidweepa-varnanam-telugu.html) and [Stotra Nidhi](https://stotranidhi.com/manidweepa-varnana-in-telugu/). Do not substitute a modern song without determining attribution/reuse rights. |

## All ten 108-name lists

Each local list contains 108 name invocations when dhyana and closing prayers are excluded. That is a structural check, not proof of correctness. Detailed differences, reference URLs and duplicate candidates are in `namavali-comparison.json` and `other-comparison.json`.

The comparison removes spacing, punctuation and numerals, folds Telugu nasal-conjunct spelling and compares name membership. It does **not** verify sequence, grammar, all accepted variants, or semantic equivalence. “Not matched” therefore means review required, not necessarily incorrect. Repeated names can be traditional; do not automatically deduplicate.

| List | Finding / disposition |
| --- | --- |
| Ganesha | Many unmatched names; repeated Avyaya, Dvijapriya and Shanta. Reference itself explicitly marks 108 (109), so its count also requires editorial interpretation. Flagged. |
| Shiva | Close agreement; Trilokesha/Trilokisha is explicitly a reference variant, Ahirbudhnya has a reference alternative, and Pashavimochaka versus Pashavimochana needs review. Retained. |
| Vishnu | Large divergence despite matching opening names. Flagged for edition identification before replacement. |
| Lalitha | Large divergence from the Rajatachala opening edition. Flagged. The reference uses “namo namah” rather than repeating “om”; parser accounts for this. |
| Venkateswara | Many differences from the Telugu comparison; matching the deity name alone is insufficient to establish the same edition. Flagged. |
| Hanuman | Many differences; repeated Sarva-duhkha-hara, Sarvaloka-charin and Hanumat. Flagged. |
| Ayyappa | Many differences; repeated Shrimat and Rama. Comparison source abbreviates “om/namah” between names; parser accounts for that and an omitted separator. Flagged. |
| Lakshmi | Broad overlap; remaining spelling/name differences and repeated Devyai require review. Retained with flag. |
| Durga | Large divergence; Nirguna repeats in the reference too, so repetition alone is not an error. Other differences need review. |
| Shirdi Sai | 108 entries but substantial wording differences. The comparison webpage contains apparent typos itself; it is not a safe replacement source. Flagged for a printed/temple edition. |

## Source considerations

1. Match the composition, opening words and recension before comparing counts. Sahasranama stotram and namavali are different formats; similarly named texts can be entirely different compositions.
2. Prefer an identified temple/institutional or scholarly printed edition for editorial sign-off. Sanskrit Documents provides useful proofread texts and variant notes, but is not infallible. Stotra Nidhi and Vaidika Vignanam are useful Telugu cross-checks.
3. Do not silently merge recensions. Preserve a selected edition, record differences and link the source. Search snippets and OCR are not sufficient for replacement text.
4. Traditional Sanskrit text is distinct from modern translations, recordings, typography and editorial commentary. Reference website notices still matter: Sanskrit Documents requests permission for promotional/commercial reposting. The local reference cache is excluded from Git and from the public site; no downloaded HTML or modern commentary is shipped. Confirm intended reuse terms before public release of a source-derived edition.
5. Meanings remain a separate editorial task, as requested. Only five existing Lalitha meanings with a clear positional mapping remain attached; old range summaries were removed. Suprabhatam meanings were detached rather than attached to newly numbered verses. The UI states that meaning review is incomplete.
6. Weekday associations vary by family and tradition. The UI now calls them suggestions, retains admin configurability, and says any stotram may be read on any day. It uses the device's local date, not a festival/tithi calendar. Sunday/Saturday captions now describe the deities actually listed.

## Technical checks

Run node tools/verify.cjs, node tools/audit-vishnu.cjs, and node tools/audit-sahasranamas.cjs. They check all 26 datasets, continuous 183/29/107 verse sequences, missing/duplicate verse entries, 108-name counts, meaning indexes, frontend and inline script syntax, local asset paths, font persistence/bounds, unavailable storage and reading-edition isolation. These checks passed.

Fixed invalid quote/newline syntax that prevented `app.js` from loading. New reading editions use separate keys so existing marks cannot identify the wrong verses; old stored marks are preserved. Backup restore now preserves the reading data too. Cloud text overrides get a content-specific reading key and lose the bundled verification claim.

The interactive browser runtime remained unavailable because Windows sandbox setup failed. Phase 5 was rendered at 390 px in the installed headless browser and the review screenshots are stored in docs/ui-reviews; this is visual evidence for those views, not Android/iOS device certification. No claim of WCAG conformance or expert Sanskrit/Telugu proofreading is made. Before release, test 320/360/390 px widths, 200% text, 400% desktop zoom, Telugu font loading, keyboard navigation, Android/iOS scrolling, and cloud-overridden editions.


## Phase 4 additions — 2026-09-23

| Key | Published scope | Source and edition consideration |
|---|---|---|
| `ganeshasahasram` | 216 numbered verses: Sahasranama 1–170; phalashruti/closing 171–216 | Ganesha Purana, Upasana Khanda, chapter 46 edition. Verses 210–212 contain a supplemental 21-name offering within the closing section. |
| `shivasahasram` | 182 numbered verses: introduction 1–30; Sahasranama 31–153; phalashruti/transmission 154–182 | Mahabharata Anushasana Parva edition from Sanskrit Documents. Other Shiva Sahasranama traditions exist, so the edition is named in the UI. |
| `saraswati108` | 108 names | Sanskrit Documents `sarasvatii108-5` edition; count and order checked. |
| `surya108` | 108 names | Sanskrit Documents `suurya108` edition; the bija mantra and dhyana are excluded from the name count. |
| `jagadeeshaharati` | Refrain, eight verses, closing refrain | Sanskrit Documents reviewed Sanskrit Arati edition, displayed in Telugu script. |
| `ganapatiharati` | 18 verses | Sanskrit Documents Ganapati Mangala Malika edition, displayed in Telugu script. |

The Telugu script is generated from the cited Sanskrit text. No translations or modern explanatory prose were copied. Source links remain visible beside each text so readers can compare the selected edition.
## Phase 6 addition — 2026-09-23

Vishnu Sahasranamam main verses 1–107 now have a reproducible line-by-line audit. The reader source panel also exposes edition status directly: verified, main text verified, variant review required, pending, or locally overridden.


## Phase 7 addition — 2026-09-23

The selected Shiva 1–182 and Ganesha 1–216 editions were regenerated independently from their cached source texts and compared with every published Telugu verse; both match with zero unexpected differences. Reader descriptions now distinguish the Sahasranama verses from introductions, phalashruti, transmission, and closing material instead of calling every numbered verse the main name sequence. The reproducible result is stored in `docs/sahasranama-collation.json`.

## Phase 11 addition — 23 September 2026

The Lalitha main text now has a reproducible source collation in tools/audit-lalitha.cjs. The selected source explicitly numbers verses 1–182, followed by an unnumbered concluding verse (శ్రీశివా ... లలితాంబికా). The reader labels that conclusion as 183 for continuous navigation. The audit confirms that source verses 1–182 and the conclusion are all present, in order, with zero unexpected differences after script conversion. This result is recorded in docs/lalitha-collation.json.

The source panel now shows the last review date and edition-scope note when available. Verification also requires every bundled text to have a valid review date and at least one HTTPS source link.

The older Namavali comparison was rerun. Every bundled Ashtottaram contains exactly 108 నమః invocations. The detailed comparison remains in docs/namavali-comparison.json: close spelling agreement is not treated as proof of a common edition, and traditional repeated names are not removed automatically. Rama, Subrahmanya, Saraswati, and Surya are source-order conversions with 108 names; the earlier lists that diverge from their comparison edition remain visibly marked for review.

## Phase 14 additions — 24 September 2026

| Key | Published scope | Source and edition consideration |
|---|---|---|
| adilakshmi108 | 108 names | Section 1, Adi Lakshmi, from the cited Ashtalakshmi collection. Count and source order were checked before Telugu-script conversion. |
| vijayalakshmi108 | 108 names | Section 6, Vijaya Lakshmi, from the same collection. Count and source order were checked before Telugu-script conversion. |

The collection page also contains other Lakshmi sections with apparent 102–113 నమః entries, depending on the section, so those were not silently trimmed or padded to 108. An Ardhanarishvara candidate was excluded because its 108 numbered pairs contain separate Shiva and Shakti invocations and do not map cleanly to this reader's one-name-per-number format. Both exclusions preserve the source instead of forcing it into the UI's count rule.
