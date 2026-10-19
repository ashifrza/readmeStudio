import { open } from 'node:fs/promises';
import path from 'node:path';
import { LIMITS } from './config.js';

/** Read a bounded UTF-8 prefix and reject binary or invalid text. */
async function readExcerpt(filePath, byteLimit) {
  const handle = await open(filePath, 'r');
  try {
    if (!(await handle.stat()).isFile()) return null;
    const buffer = Buffer.alloc(byteLimit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const truncated = bytesRead > byteLimit;
    let text;
    try {
      // Streaming decode discards an incomplete UTF-8 character at a cut boundary.
      text = new TextDecoder('utf-8', { fatal: true }).decode(
        buffer.subarray(0, Math.min(bytesRead, byteLimit)), { stream: truncated },
      );
    } catch {
      return null;
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const content = lines.slice(0, LIMITS.maxFileLines).join('\n');
    if (!content.trim()) return null;
    return { content, truncated: truncated || lines.length > LIMITS.maxFileLines };
  } finally {
    await handle.close();
  }
}

/**
 * Read candidates in priority order until the file or content budget is used.
 * @param {string[]} filePaths Absolute paths returned by the scanner.
 * @param {string} projectPath Project root used for relative display paths.
 * @param {object} [limits] Reading limits for the selected provider.
 * @returns {Promise<{files: object[], totalBytes: number, skipped: number, warnings: string[]}>}
 */
export async function readProjectFiles(filePaths, projectPath, limits = LIMITS) {
  const root = path.resolve(projectPath);
  const files = [];
  const warnings = [];
  let totalBytes = 0;
  for (const filePath of filePaths) {
    if (files.length >= limits.maxFiles || totalBytes >= limits.maxTotalContentBytes) break;
    const relativePath = path.relative(root, filePath).split(path.sep).join('/');
    const budget = Math.min(limits.maxFileBytes, limits.maxTotalContentBytes - totalBytes);
    let excerpt;
    try {
      excerpt = await readExcerpt(filePath, budget);
    } catch (error) {
      warnings.push(`Skipped ${relativePath} (${error.code ?? 'read failed'}).`);
      continue;
    }
    if (!excerpt) continue;
    files.push({ path: relativePath, ...excerpt });
    totalBytes += Buffer.byteLength(excerpt.content, 'utf8');
  }
  if (!files.length) throw new Error('No readable text content found in the supported files.');
  return { files, totalBytes, skipped: filePaths.length - files.length, warnings };
}
