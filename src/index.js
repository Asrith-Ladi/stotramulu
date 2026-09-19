
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
const MODEL = "gemini-2.0-flash";

const PROMPT =
  "You are given image(s) of a Hindu devotional stotram printed in Telugu script " +
  "(the text may be Sanskrit written in Telugu letters). Transcribe the verse text " +
  "EXACTLY as printed, preserving the original spelling and the line breaks within each " +
  "verse (a newline per printed line). Separate each distinct verse / slokam with ONE " +
  "blank line. Do NOT add verse numbers, titles, translations, transliteration, or any " +
  "commentary — output ONLY the verse text as it appears.";

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
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  let res, body;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0 } }),
    });
    body = await res.json();
  } catch (e) {
    return json({ error: "Gemini call failed: " + e.message }, 502);
  }
  if (!res.ok) return json({ error: "Gemini: " + (body?.error?.message || res.status) }, 502);

  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return json({ text: text.trim() });
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

