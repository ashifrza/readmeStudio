import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  LIMITS, MODEL, README_SECTIONS, DEFAULT_PROVIDER,
  LOCAL_MODEL, LOCAL_BASE_URL, LOCAL_LIMITS,
} from './config.js';

/** Choose a provider explicitly; a stored Anthropic key never enables paid calls. */
export function getLlmSettings() {
  const provider = (process.env.LLM_PROVIDER?.trim() || DEFAULT_PROVIDER).toLowerCase();
  if (provider === 'anthropic') return { provider, model: MODEL, limits: LIMITS, label: 'Anthropic' };
  if (provider !== 'ollama') throw new Error('LLM_PROVIDER must be ollama or anthropic.');
  const model = process.env.OLLAMA_MODEL?.trim() || LOCAL_MODEL;
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?$/i.test(model) || /cloud/i.test(model)) {
    throw new Error(`Choose a downloaded local OLLAMA_MODEL, such as ${LOCAL_MODEL}.`);
  }
  return { provider, model, limits: LOCAL_LIMITS, label: 'Ollama on this computer' };
}

/** Redact keys and control characters before limiting a provider's error detail. */
function safeErrorDetail(detail, apiKey) {
  if (typeof detail !== 'string') return '';
  const redacted = apiKey ? detail.replaceAll(apiKey, '[REDACTED]') : detail;
  return redacted
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .slice(0, 500);
}

/** Translate SDK errors without logging request bodies or credentials. */
function apiErrorMessage(error, apiKey) {
  if (error.status === 401) return 'Authentication failed. Check ANTHROPIC_API_KEY in your .env file.';
  if (error.status === 403) return 'API access denied. Check your Anthropic account and model permissions.';
  if (error.status === 404) return `Model unavailable. Check the MODEL constant in src/config.js (${MODEL}).`;
  if (error.status === 429) return 'Rate limit reached after automatic retries. Wait, then try again.';
  if (error.status === 400 || error.status === 422) {
    const detail = safeErrorDetail(error.error?.error?.message ?? error.error?.message, apiKey);
    const guidance = detail || 'Check your model, input limits, and account billing.';
    return `Anthropic rejected the request (HTTP ${error.status}). ${guidance}`;
  }
  if (error.status >= 500) return 'Anthropic is temporarily unavailable after automatic retries. Try again later.';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'API request timed out after automatic retries. Try again.';
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic after automatic retries. Check your connection.';
  return 'Anthropic API request failed. Check your connection and API configuration.';
}

/** Repair a local response that begins with Description but omitted its H1 title. */
function addMissingTitle(markdown, projectName) {
  if (!/^## Description[ \t]*\r?\n/.test(markdown) || typeof projectName !== 'string') return markdown;
  const title = projectName.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/^#+\s*/, '').trim();
  return title ? `# ${title}\n\n${markdown}` : markdown;
}

/** Normalize Markdown and reject missing sections before either provider can write. */
function validateReadme(text, projectName) {
  if (typeof text !== 'string') throw new Error('The model returned no README text. Try again.');
  const normalized = text.trim().replace(/^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i, '$1').trim();
  const markdown = addMissingTitle(normalized, projectName);
  if (!/^# [^\r\n]+/.test(markdown)) throw new Error('The model returned no valid README title. Try again.');
  const missing = README_SECTIONS.filter((section) => !new RegExp(`^## ${section}[ \\t]*\\r?$`, 'm').test(markdown));
  if (missing.length) throw new Error(`Generated README is missing sections: ${missing.join(', ')}. Try again.`);
  return markdown;
}

/**
 * Send a prompt to the optional paid provider; transient failures retry twice.
 * @param {{system: string, user: string}} prompt Trusted instructions and source data.
 * @returns {Promise<string>} A complete README in Markdown.
 */
async function generateAnthropicReadme({ system, user }) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new Error('Missing ANTHROPIC_API_KEY. Add it to .env in the folder where you run this command.');
  }
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: LIMITS.requestTimeoutMs });
  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: LIMITS.maxOutputTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (error) {
    throw new Error(apiErrorMessage(error, apiKey));
  }
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`Generation did not finish normally (${message.stop_reason}). No README was written.`);
  }
  const text = message.content.filter((block) => block.type === 'text')
    .map((block) => block.text).join('\n');
  return validateReadme(text);
}

/** Accept only a local server address and never follow HTTP redirects. */
function localEndpoint() {
  let base;
  try {
    base = new URL(process.env.OLLAMA_BASE_URL?.trim() || LOCAL_BASE_URL);
  } catch {
    throw new Error(`OLLAMA_BASE_URL must be a local HTTP address, such as ${LOCAL_BASE_URL}.`);
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (base.protocol !== 'http:' || !localHosts.has(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error(`OLLAMA_BASE_URL must be a local HTTP address, such as ${LOCAL_BASE_URL}.`);
  }
  return new URL('/api/chat', base).href;
}

/** Make one local request using Node's built-in fetch; no API key is sent. */
async function requestOllama(endpoint, payload, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal, redirect: 'error',
    });
    const data = await response.json();
    return { response, data };
  } catch (error) {
    if (signal.aborted) throw new Error('Local generation timed out. Close unused apps and try again.');
    if (error instanceof SyntaxError) throw new Error('Ollama returned invalid JSON. Check that Ollama is running.');
    throw new Error('Could not reach Ollama. Install and open Ollama, then try again.');
  }
}

/** Explain missing models and local runtime failures without using a paid fallback. */
function checkOllamaResponse(response, data, model) {
  if (response.status === 404) throw new Error(`Local model not found. Run: ollama pull ${model}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Ollama returned an unexpected response. Check the Ollama app.');
  }
  if (!response.ok || data.error) {
    const detail = safeErrorDetail(data.error, process.env.ANTHROPIC_API_KEY?.trim());
    throw new Error(`Ollama rejected the request (HTTP ${response.status}). ${detail || 'Check the Ollama app.'}`);
  }
  if (data.done !== true || data.done_reason !== 'stop') {
    throw new Error(`Local generation did not finish normally (${data.done_reason ?? 'unknown'}). No README was written.`);
  }
}

/** Generate locally with a bounded context and unload the model after the request. */
async function generateLocalReadme({ system, user, projectName }, { model, limits }) {
  const { response, data } = await requestOllama(localEndpoint(), {
    model, stream: false, think: false, keep_alive: 0,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    options: { num_ctx: limits.contextTokens, num_predict: limits.maxOutputTokens, temperature: 0.2 },
  }, limits.requestTimeoutMs);
  checkOllamaResponse(response, data, model);
  return validateReadme(data.message?.content, projectName);
}

/**
 * Generate a README with the selected provider; free local generation is default.
 * @param {{system: string, user: string, projectName?: string}} prompt Instructions and project excerpts.
 * @returns {Promise<string>} Complete Markdown ready for the writer.
 */
export async function generateReadme(prompt) {
  const settings = getLlmSettings();
  if (settings.provider === 'anthropic') return generateAnthropicReadme(prompt);
  return generateLocalReadme(prompt, settings);
}
