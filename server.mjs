import {createReplaySource,serveReplay} from './lib/replay-stream.mjs';
import { createMatchAgent } from './match-agent.mjs';
import { localModels, askLocal } from './local-agent.mjs';
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
class NarrationError extends Error { constructor(code,message,status=400){super(message);this.code=code;this.status=status;} }

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

export function readConfig(env = process.env) {
  const result = {
    configured: false, enabled: env.ENABLE_LIVE_AI === 'true',
    maxCalls: Number(env.MAX_LIVE_CALLS ?? 2), maxCompletionTokens: Number(env.MAX_COMPLETION_TOKENS ?? 1000),
    timeoutMs: 20000, apiKey: env.AZURE_OPENAI_API_KEY?.trim() || '',
    accessToken: env.AZURE_OPENAI_ACCESS_TOKEN?.trim() || '', authMode: 'unconfigured',
    deployment: env.AZURE_OPENAI_DEPLOYMENT?.trim() || '', url: null,
  };
  if (!Number.isInteger(result.maxCalls) || result.maxCalls < 0 || result.maxCalls > 10000 ||
      !Number.isInteger(result.maxCompletionTokens) || result.maxCompletionTokens < 128 || result.maxCompletionTokens > 4096) {
    result.configurationIssue = 'Invalid server call or token limits.'; return result;
  }
  result.authMode = result.accessToken ? 'entra-token' : result.apiKey ? 'api-key' : 'unconfigured';
  if ((!result.apiKey && !result.accessToken) || !result.deployment || !env.AZURE_OPENAI_ENDPOINT) {
    result.configurationIssue = 'Azure endpoint, deployment and a server-side API key or Entra access token are required.'; return result;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(result.deployment)) {
    result.configurationIssue = 'The Azure deployment name contains unsupported characters.'; return result;
  }
  try {
    const endpoint = new URL(env.AZURE_OPENAI_ENDPOINT);
    const hostOK = /\.(openai\.azure\.com|services\.ai\.azure\.com)$/.test(endpoint.hostname);
    const pathname = endpoint.pathname.replace(/\/+$/, '');
    if (endpoint.protocol !== 'https:' || !hostOK || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        !['', '/openai/v1'].includes(pathname)) throw new Error('unsupported endpoint');
    result.url = `${endpoint.origin}/openai/v1/chat/completions`;
    result.configured = true;
  } catch {
    result.configurationIssue = 'Use the Azure resource inference endpoint, optionally ending in /openai/v1/, not a project URL.';
  }
  return result;
}

function sendJSON(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

async function readJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw new NarrationError('CONTENT_TYPE', 'Use application/json.', 415);
  }
  if (Number(req.headers['content-length'] || 0) > 8192) {
    req.resume(); throw new NarrationError('BODY_TOO_LARGE', 'Request body exceeds 8 KB.', 413);
  }
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 8192) throw new NarrationError('BODY_TOO_LARGE', 'Request body exceeds 8 KB.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new NarrationError('INVALID_JSON', 'Request body must be valid JSON.', 400); }
}

function checkOrigin(req) {
  if (!req.headers.origin) return;
  try {
    const origin = new URL(req.headers.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) throw new Error('origin mismatch');
  } catch { throw new NarrationError('ORIGIN_FORBIDDEN', 'Cross-origin model requests are not allowed.', 403); }
}

export function createApp({ env = process.env, fetchImpl = globalThis.fetch, provider = 'azure-foundry', engine, matchEngine, webRoot = path.join(ROOT, 'web'), now = () => Date.now() } = {}) {
  const config = readConfig(env);
  config.provider = provider;
  const matchAgent = createMatchAgent({env, azureConfig:config, fetchImpl});
  async function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) throw new NarrationError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw new NarrationError('INVALID_PATH', 'Invalid path.', 400); }
    if (decoded.split('/').some(segment => segment.startsWith('.')) || decoded.includes('\\') || decoded.includes('\0')) {
      throw new NarrationError('NOT_FOUND', 'Not found.', 404);
    }
    const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const rootPath = await realpath(webRoot);
    let filename;
    try { filename = await realpath(path.resolve(rootPath, relativePath)); }
    catch { throw new NarrationError('NOT_FOUND', 'Not found.', 404); }
    const relative = path.relative(rootPath, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !MIME[path.extname(filename)]) throw new NarrationError('NOT_FOUND', 'Not found.', 404);
    const info = await stat(filename);
    if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new NarrationError('NOT_FOUND', 'Not found.', 404);
    const content = await readFile(filename);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filename)], 'Content-Length': content.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(req.method === 'HEAD' ? undefined : content);
  }

  const replaySource=createReplaySource(path.join(webRoot,'data/synthetic'));
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/api/replay/meta' && req.method === 'GET') {const {eventCount,eventTypes,chunks,...meta}=await replaySource.meta();return sendJSON(res,200,meta);}
      if (pathname === '/api/replay/stream' && req.method === 'GET') {try{return await serveReplay(replaySource,new URL(req.url,'http://localhost'),res);}catch(error){if(res.headersSent){res.destroy();return;}return sendJSON(res,400,{error:{message:error.message}});}}
      if (pathname === '/api/match-agent/status' && req.method === 'GET') return sendJSON(res, 200, await matchAgent.status());
      if (pathname === '/api/match-agent/ask' && req.method === 'POST') {
        checkOrigin(req); const input = await readJSON(req);
        try { return sendJSON(res, 200, await matchAgent.ask(input)); }
        catch(error) { return sendJSON(res, 503, {error:{code:'MATCH_AGENT_FAILED',message:error.message}}); }
      }
      if (pathname === '/api/local-agent/status' && req.method === 'GET') return sendJSON(res, 200, await localModels(fetchImpl));
      if (pathname === '/api/local-agent/ask' && req.method === 'POST') {
        checkOrigin(req);
        const input = await readJSON(req);
        try { return sendJSON(res, 200, await askLocal(input, fetchImpl)); }
        catch (error) { return sendJSON(res, 503, { error: { code: 'LOCAL_MODEL_UNAVAILABLE', message: error.name === 'TimeoutError' ? 'Local model response exceeded 60s; Use a smaller model or evidence rules. ' : error.message } }); }
      }
      if (pathname === '/api/health' && req.method === 'GET') return sendJSON(res, 200, { ok: true, source: 'seeded-synthetic', azureConfigured: config.configured, azureVerified: false });
      if (pathname.startsWith('/api/')) throw new NarrationError('NOT_FOUND', 'API route not found.', 404);
      await serveStatic(req, res, pathname);
    } catch (error) {
      if (res.writableEnded) return;
      const known = error instanceof NarrationError;
      sendJSON(res, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'The request could not be completed.' } });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

export async function start(options = {}) {
  const env = options.env ?? process.env;
  const server = createApp(options);
  const { port, host } = listenConfig(env, options.args ?? []);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

export function listenConfig(env = process.env, args = []) {
  let port = Number(env.PORT ?? 3000);
  let host = env.HOST || '127.0.0.1';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[++i]);
    else if (args[i].startsWith('--port=')) port = Number(args[i].slice(7));
    else if (args[i] === '--host') host = args[++i];
    else if (args[i].startsWith('--host=')) host = args[i].slice(7);
    else if (args[i] !== '--strictPort') throw new Error(`Unsupported server option: ${args[i]}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  if (typeof host !== 'string' || !host.trim()) throw new Error('Host must be specified.');
  return { port, host };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = await start({ args: process.argv.slice(2) });
  const address = server.address();
  console.log(`Next Touch is available at http://${address.address === '::' ? 'localhost' : address.address}:${address.port}`);
  console.log(readConfig().configured ? 'Azure configuration detected; live mode follows ENABLE_LIVE_AI.' : 'Local demo mode. Azure credentials are not configured.');
}
