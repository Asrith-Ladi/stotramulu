/*
 * Pages Function: POST /api/ocr — image → Telugu verse text via Gemini.
 *
 * This runs on Cloudflare Pages (same project as the site), so there is no
 * separate Worker to create and no CORS to configure — the admin panel calls
 * it on its own domain at /api/ocr.
 *
 * Files in this `functions/` folder are compiled into the Pages Function; they
 * are NOT served as static files, so this source is never publicly readable.
 *
 * SETUP (once):
 *   Cloudflare dashboard → your Pages project → Settings → Variables and Secrets
 *   → Add → type "Secret" → name: GEMINI_API_KEY
 *   → value: your key from https://aistudio.google.com/apikey  (free, no card)
 *   → Save, then redeploy the project so the secret takes effect.
 *
 * Security: only the admin may use this. Every request must carry the caller's
 * Firebase ID token, which we verify with Google before spending any quota.
 */

const ADMIN_UID = "0d3PPSYaFncy1tY2oUGtBMGMFwu2";
// Public Firebase web API key (already public in the site's config) — used only
// to ask Google to validate the caller's login token. NOT the Gemini key.
const FIREBASE_API_KEY = "AIzaSyCDwmjKvg-4XFra1NevTX4wW8BGsUzzQtU";
const MODEL = "gemini-2.0-flash";

const PROMPT =
  "You are given image(s) of a Hindu devotional stotram printed in Telugu script " +
  "(the text may be Sanskrit written in Telugu letters). Transcribe the verse text " +
  "EXACTLY as printed, preserving the original spelling and the line breaks within each " +
  "verse (a newline per printed line). Separate each distinct verse / slokam with ONE " +
  "blank line. Do NOT add verse numbers, titles, translations, transliteration, or any " +
  "commentary — output ONLY the verse text as it appears.";

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY secret is not set on this Pages project" }, 500);
  }

  // 1) only the admin may use this
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  let res, body;
  try {
    res = await fetch(url, {
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
