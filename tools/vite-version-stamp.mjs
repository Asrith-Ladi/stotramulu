// Version stamps for the built pages (Phase 29). Runs on the client build only
// (vite.config.js); the dev server is left alone.
//
// 1. Every <script src="/..."> in index.html and admin.html that points at a
//    file in public/ gets ?v=<the first 10 hex digits of that file's SHA-256>.
//    A phone or a proxy that kept an old copy of one file then asks for the
//    new one, and a file that did not change keeps its address. Cloudflare
//    ignores the ?v= part and serves the file as usual.
// 2. The build gets an id made from the stamped pages and every public file,
//    so two builds of the same files get the same id. The id replaces "dev" in
//    <meta name="stotram-build" content="dev"> (with the build time in
//    data-built) and is written to /version.json. build-check.js compares the
//    two to notice that a page left open on a phone is older than the live site.
//
// A script tag naming a file that is in neither public/ nor this build stops
// the build: on the live site that file would be missing.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_SRC = /(<script\b[^>]*?\ssrc=")(\/(?!\/)[^"?#]+)(")/g;
const BUILD_META = '<meta name="stotram-build" content="dev">';
const STAMP_LEN = 10;
const ID_LEN = 12;

function sha(data) {
  return createHash('sha256').update(data).digest('hex');
}

// Every file under dir as a sorted list of '/'-separated relative paths.
function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel + '/'));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

export default function versionStamp(options = {}) {
  let publicDir = '';
  const now = options.now || (() => new Date());
  return {
    name: 'stotram-version-stamp',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'client',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle: {
      // After vite:build-html has put the finished pages into the bundle.
      order: 'post',
      handler(_output, bundle) {
        const pages = Object.values(bundle)
          .filter((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
          .sort((a, b) => (a.fileName < b.fileName ? -1 : 1));
        if (!pages.length) return;

        const files = publicDir && fs.existsSync(publicDir) ? listFiles(publicDir) : [];
        const fileHash = new Map(files.map((rel) => [rel, sha(fs.readFileSync(path.join(publicDir, rel)))]));

        const parts = files.map((rel) => rel + ' ' + fileHash.get(rel));
        for (const page of pages) {
          const html = String(page.source);
          const stamped = html.replace(SCRIPT_SRC, (whole, open, src, close) => {
            const rel = src.slice(1);
            if (fileHash.has(rel)) return open + src + '?v=' + fileHash.get(rel).slice(0, STAMP_LEN) + close;
            if (bundle[rel]) return whole;          // built by Vite, already named by its contents
            this.error(page.fileName + ' loads ' + src + ', which is in neither public/ nor this build');
          });
          page.source = stamped;
          parts.push(page.fileName + '\n' + stamped);
        }

        const build = sha(parts.join('\n')).slice(0, ID_LEN);
        const built = now().toISOString();
        for (const page of pages) {
          page.source = String(page.source).replace(BUILD_META,
            '<meta name="stotram-build" content="' + build + '" data-built="' + built + '">');
        }
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ build, built }) + '\n',
        });
      },
    },
  };
}
