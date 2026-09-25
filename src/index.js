import {handleOcr} from "./ocr.js";
import {json} from "./http.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ocr") {
      if (request.method !== "POST") return json({error: "POST only"}, 405);
      return handleOcr(request, env);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", {status: 404});
  },
};
