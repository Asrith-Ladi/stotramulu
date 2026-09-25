import {verifyFirebaseToken} from "./auth.js";
import {json} from "./http.js";

const DEFAULT_ADMIN_UID = "0d3PPSYaFncy1tY2oUGtBMGMFwu2";
const DEFAULT_MODEL = "gemini-3.6-flash";
const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 10_000_000;
const MAX_TOTAL_CHARS = 24_000_000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const PROMPT = [
  "Transcribe the Hindu devotional stotram printed in the image(s). The script is Telugu",
  "(the language may be Sanskrit written in Telugu letters).",
  "",
  "ABSOLUTE RULES — this is scripture, so fidelity matters more than fluency:",
  "1. Transcribe ONLY what is actually printed in the image, character by character.",
  "2. Do NOT use any memorised or well-known version of this text.",
  "3. Do NOT correct, modernise, standardise or improve spelling, punctuation or sandhi.",
  "4. Do NOT replace uncommon words, paraphrase, add, omit, merge, split or reorder verses.",
  "5. If a letter or word is genuinely illegible, write ⟨?⟩ instead of guessing.",
  "",
  "FORMAT:",
  "- Keep the printed line breaks.",
  "- Separate each verse with exactly one blank line.",
  "- Output only the verse text, without added numbering, notes or explanation.",
].join("\n");

export async function handleOcr(request, env) {
  if (!env.GEMINI_API_KEY) return json({error: "GEMINI_API_KEY secret is not set"}, 500);

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({error: "No auth token"}, 401);

  let uid;
  try { uid = await verifyFirebaseToken(token, env); }
  catch (error) { return json({error: "Auth failed: " + error.message}, 401); }
  if (uid !== (env.ADMIN_UID || DEFAULT_ADMIN_UID)) return json({error: "Not authorized"}, 403);

  let payload;
  try { payload = await request.json(); }
  catch (_) { return json({error: "Bad JSON"}, 400); }

  const validation = validateImages(payload.images);
  if (validation.error) return json({error: validation.error}, 400);

  const parts = [{text: PROMPT}];
  validation.images.forEach(image => {
    parts.push({inline_data: {mime_type: image.mime, data: image.data}});
  });
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);

  let first;
  try { first = await askGemini(endpoint, parts); }
  catch (error) { return json({error: error.message}, 502); }

  if (payload.doubleCheck === false) return json({text: first, model});

  let second = null;
  try { second = await askGemini(endpoint, parts); }
  catch (_) {}

  return json({
    text: first,
    model,
    checked: second !== null,
    uncertain: second === null ? null : diffLines(first, second),
  });
}

export function validateImages(value) {
  if (!Array.isArray(value) || !value.length) return {error: "No images"};
  if (value.length > MAX_IMAGES) return {error: "Too many images; maximum is " + MAX_IMAGES};

  let total = 0;
  const images = [];
  for (const image of value) {
    if (!image || !ALLOWED_MIME_TYPES.has(image.mime)) return {error: "Unsupported image type"};
    if (typeof image.data !== "string" || !image.data.length || image.data.length > MAX_IMAGE_CHARS) {
      return {error: "Invalid or oversized image"};
    }
    if (image.data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return {error: "Invalid image encoding"};
    total += image.data.length;
    if (total > MAX_TOTAL_CHARS) return {error: "Combined images are too large"};
    images.push({mime: image.mime, data: image.data});
  }
  return {images};
}

async function askGemini(endpoint, parts) {
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{parts}],
        generationConfig: {temperature: 0, topP: 1, topK: 1},
      }),
    });
    body = await response.json();
  } catch (error) {
    throw new Error("Gemini call failed: " + error.message);
  }
  if (!response.ok) throw new Error("Gemini: " + (body?.error?.message || response.status));
  const text = body?.candidates?.[0]?.content?.parts?.map(part => part.text).join("") || "";
  if (!text.trim()) throw new Error("Empty result — try a clearer photo");
  return text.trim();
}

export function diffLines(a, b) {
  const normalize = value => value.replace(/\s+/g, " ").trim();
  const left = a.split("\n");
  const right = b.split("\n");
  const differences = [];
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index++) {
    if (normalize(left[index] || "") !== normalize(right[index] || "")) {
      differences.push({line: index + 1, a: left[index] || "", b: right[index] || ""});
    }
    if (differences.length >= 25) break;
  }
  return differences;
}
