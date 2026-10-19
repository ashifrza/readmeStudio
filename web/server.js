import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDescriptionPrompt } from '../src/descriptionPrompt.js';
import { generateReadme, getLlmSettings } from '../src/llmClient.js';

const MAX_BODY_BYTES = 16_000;
const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

/** Attach an HTTP status to validation failures without exposing stack traces. */
class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Send JSON responses, including a length so clients can finish reading promptly. */
function sendJson(response, status, data) {
  if (response.destroyed) return;
  const body = JSON.stringify(data);
  response.writeHead(status, {
    ...RESPONSE_HEADERS, 'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

/** Accept only this local website, including when a browser supplies an Origin. */
function checkLocalRequest(request, port) {
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  let hostOrigin;
  try { hostOrigin = new URL(`http://${request.headers.host}`).origin; } catch { /* Rejected below. */ }
  if (!origins.has(hostOrigin) || request.headers['sec-fetch-site'] === 'cross-site'
    || (request.headers.origin && request.headers.origin !== hostOrigin)) {
    throw new RequestError(403, 'Open this website using its local browser address.');
  }
}

/** Read a small JSON body; excess bytes are discarded rather than retained. */
function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume();
    throw new RequestError(415, 'Send the project details as application/json.');
  }
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        reject(new RequestError(413, 'The submission is too large. Shorten your project details.'));
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > MAX_BODY_BYTES) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new RequestError(400, 'The submission contains invalid JSON.')); }
    });
    request.on('error', () => reject(new RequestError(400, 'The submission could not be read.')));
    request.on('aborted', () => reject(new RequestError(400, 'The submission was interrupted.')));
  });
}

/** Serve only explicitly listed public files, never arbitrary filesystem paths. */
async function serveAsset(request, response, pathname) {
  const asset = ASSETS.get(pathname);
  if (!asset) throw new RequestError(404, 'Page not found.');
  const [filename, contentType] = asset;
  const content = await readFile(new URL(`./public/${filename}`, import.meta.url));
  response.writeHead(200, {
    ...RESPONSE_HEADERS, 'Content-Type': contentType, 'Content-Length': content.length,
  });
  response.end(request.method === 'HEAD' ? undefined : content);
}

/**
 * Create the local website server. Tests can inject a model without using AI.
 * @param {{generate?: (prompt: object) => Promise<string>}} [options] Generation dependency.
 * @returns {import('node:http').Server} A server that the caller can start or stop.
 */
export function createWebServer({ generate = (prompt) => generateReadme(prompt, { provider: 'ollama', structured: true }) } = {}) {
  let generating = false;
  const server = createServer(async (request, response) => {
    try {
      checkLocalRequest(request, server.address().port);
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' || request.method === 'HEAD') {
        await serveAsset(request, response, pathname);
        return;
      }
      if (pathname !== '/api/generate') throw new RequestError(404, 'Page not found.');
      if (request.method !== 'POST') throw new RequestError(405, 'Use POST to generate a README.');
      if (generating) {
        request.resume();
        response.setHeader('Retry-After', '10');
        throw new RequestError(429, 'A README is already being generated. Wait for it to finish, then try again.');
      }
      const input = await readJson(request);
      let prompt;
      try { prompt = buildDescriptionPrompt(input); }
      catch (error) { throw new RequestError(400, error.message); }
      // Recheck after reading the body: another visitor may have started a request.
      if (generating) throw new RequestError(429, 'A README is already being generated. Try again shortly.');
      generating = true;
      try {
        const markdown = await generate(prompt);
        sendJson(response, 200, { markdown });
      } catch (error) {
        sendJson(response, 502, { error: error.message || 'Local generation failed. Check that Ollama is running.' });
      } finally { generating = false; }
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.status ? error.message : 'The website could not complete this request.',
      });
    }
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

/** Start the website on this computer; the original CLI remains a separate command. */
function startWebsite() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a number between 1 and 65535.');
  }
  const { model } = getLlmSettings('ollama');
  const server = createWebServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is busy. Stop the other server or choose a different PORT.`
      : `Could not start the website: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`README Studio: http://localhost:${port}`);
    console.log(`Free local AI: ${model}. Keep Ollama running.`);
    console.log('Press Ctrl+C in this terminal to stop the website.');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { startWebsite(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
