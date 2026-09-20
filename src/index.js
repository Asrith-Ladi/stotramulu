/*
 * Worker entry point for the stotramulu site (Cloudflare "Workers + static
 * assets" model).
 *
 *   • POST /api/ocr  → reads a scripture image with Gemini and returns the
 *                      Telugu verse text (admin only).
 *   • everything else → served from ./public by the ASSETS binding.
 *
 * The site and this API share one domain, so there is no CORS to configure.
 *
 * SETUP (once): add the Gemini key as a SECRET, not a plaintext variable:
 *   dashboard → this Worker → Settings → Variables and Secrets → Add → Secret
 *     name: GEMINI_API_KEY
 *     value: your key from https://aistudio.google.com/apikey  (free, no card)
 *   or from a terminal:  npx wrangler secret put GEMINI_API_KEY
 *
 * Keep the key OUT of wrangler.jsonc — anything in that file is committed to
 * the repo. Secrets survive `wrangler deploy`; plaintext vars do not.
 */

const ADMIN_UID = "0d3PPSYaFncy1tY2oUGtBMGMFwu2";
// Public Firebase web API key (already public in the site's own config) — used
// only to ask Google to validate the caller's login token. NOT the Gemini key.
const FIREBASE_API_KEY = "AIzaSyCDwmjKvg-4XFra1NevTX4wW8BGsUzzQtU";

// Model is overridable without a code change: add a plaintext variable named
// GEMINI_MODEL in the dashboard (Settings → Runtime variables) to try another
// one, e.g. a "pro" tier if Telugu accuracy needs improving.
// Google retires models periodically — if you see "model is no longer
// available", put the name from that error message into GEMINI_MODEL.
const DEFAULT_MODEL = "gemini-3.6-flash";

// Transcription prompt. Deliberately strict: with well-known stotras the model
// will otherwise recite a MEMORISED version instead of reading the page, which
// is where "similar but reworded" output comes from. It is also told to mark
// illegible letters rather than guess a plausible word.
const PROMPT = [
  "Transcribe the Hindu devotional stotram printed in the image(s). The script is Telugu",
  "(the language may be Sanskrit written in Telugu letters).",
  "",
  "ABSOLUTE RULES — this is scripture, so fidelity matters more than fluency:",
  "1. Transcribe ONLY what is actually printed in the image, character by character.",
  "2. Do NOT use any memorised or well-known version of this text. If you recognise the",
  "   stotram, ignore what you remember and read the page as it is.",
  "3. Do NOT correct, modernise, standardise or improve anything — keep the exact spelling,",
  "   sandhi, vowel marks, punctuation and dandas (| and ||) as printed, even if they look",
  "   unusual or wrong to you.",
  "4. Do NOT replace an uncommon word with a more common one. Never paraphrase.",
  "5. Do NOT add, omit, merge, split or reorder any verse.",
  "6. If a letter or word is genuinely illegible, write ⟨?⟩ at that spot instead of guessing.",
  "",
  "FORMAT:",
  "- Keep the line breaks as printed: one newline per printed line.",
  "- Separate each verse / slokam with exactly ONE blank line.",
  "- Output only the verse text — no numbers you added yourself, no titles, no translation,",
  "  no transliteration, no notes, no explanation.",
].join("\n");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ocr") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405);
      return handleOcr(request, env);
    }

    // Not an API route → serve the static site. (With assets configured,
    // Cloudflare usually serves files before the Worker runs; this fallback
    // makes the behaviour correct either way.)
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

async function handleOcr(request, env) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY secret is not set on this Worker" }, 500);
  }

  // 1) only the admin may use this — verify the Firebase login token with Google
  //    BEFORE spending any Gemini quota.
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "No auth token" }, 401);
  let uid;
  try { uid = await verifyToken(token); }
  catch (e) { return json({ error: "Auth failed: " + e.message }, 401); }
  if (uid !== ADMIN_UID) return json({ error: "Not authorized" }, 403);

  // 2) read the uploaded image(s)
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const images = Array.isArray(payload.images) ? payload.images : [];
  if (!images.length) return json({ error: "No images" }, 400);

  // 3) OCR with Gemini
  const parts = [{ text: PROMPT }];
  for (const im of images) {
    parts.push({ inline_data: { mime_type: im.mime || "image/jpeg", data: im.data } });
  }
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  // Read the page TWICE and compare. Two independent readings of the same image
  // agree on what is clearly printed and disagree exactly where the model was
  // unsure — which tells you the handful of lines to check, instead of having to
  // re-read everything. Skipped when the client asks for a single pass.
  const wantCheck = payload.doubleCheck !== false;

  let first;
  try { first = await askGemini(endpoint, parts); }
  catch (e) { return json({ error: e.message }, 502); }

  if (!wantCheck) return json({ text: first, model });

  let second = null;
  try { second = await askGemini(endpoint, parts); }
  catch (e) { /* second pass is a bonus — never fail the request for it */ }

  const diff = second === null ? null : diffLines(first, second);
  return json({
    text: first,
    model,
    checked: second !== null,
    // lines where the two readings differ → verify these first
    uncertain: diff,
  });
}

async function askGemini(endpoint, parts) {
  let res, body;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        // temperature 0 = read, don't compose
        generationConfig: { temperature: 0, topP: 1, topK: 1 },
      }),
    });
    body = await res.json();
  } catch (e) {
    throw new Error("Gemini call failed: " + e.message);
  }
  if (!res.ok) throw new Error("Gemini: " + (body?.error?.message || res.status));
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text.trim()) throw new Error("Empty result — try a clearer photo");
  return text.trim();
}

// Compare two readings line by line and return the lines that disagree.
function diffLines(a, b) {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const la = a.split("\n");
  const lb = b.split("\n");
  const out = [];
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    const x = norm(la[i] || "");
    const y = norm(lb[i] || "");
    if (x !== y) out.push({ line: i + 1, a: la[i] || "", b: lb[i] || "" });
    if (out.length >= 25) break;      // don't flood the UI
  }
  return out;
}

// Validate a Firebase ID token via Google Identity Toolkit → returns the uid.
async function verifyToken(idToken) {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  const b = await r.json();
  if (!r.ok || !b.users || !b.users.length) throw new Error("invalid token");
  return b.users[0].localId;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
