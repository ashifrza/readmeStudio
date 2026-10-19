import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/** Ask once, accepting only an explicit yes and always releasing the terminal. */
async function confirmOverwrite(outputPath) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(`Output already exists: ${outputPath}. Run in an interactive terminal to confirm replacement.`);
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(`Overwrite ${outputPath}? [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    terminal.close();
  }
}

/**
 * Check the destination and obtain overwrite permission before any API call.
 * @param {string} outputPath Absolute or relative Markdown destination.
 * @returns {Promise<{outputPath: string, original: object | null} | null>} Null means cancelled.
 */
export async function prepareOutput(outputPath) {
  const resolved = path.resolve(outputPath);
  let original;
  try {
    original = await lstat(resolved);
  } catch (error) {
    if (error.code === 'ENOENT') return { outputPath: resolved, original: null };
    throw new Error(`Cannot inspect output "${resolved}" (${error.code}).`);
  }
  if (!original.isFile()) throw new Error(`Output must be a regular file, not a folder or symbolic link: ${resolved}`);
  if (!(await confirmOverwrite(resolved))) return null;
  return { outputPath: resolved, original };
}

/** Refuse to replace a file that changed while the model was generating text. */
function verifyUnchanged(current, original) {
  if (!current.isFile() || current.dev !== original.dev || current.ino !== original.ino
    || current.size !== original.size || current.mtimeMs !== original.mtimeMs) {
    throw new Error('Output changed during generation. Run again to confirm the current file.');
  }
}

/**
 * Save a confirmed README, using exclusive creation for a new destination.
 * @param {{outputPath: string, original: object | null}} plan Result of prepareOutput.
 * @param {string} markdown Complete Markdown returned by the LLM client.
 * @returns {Promise<string>} Absolute path of the saved README.
 */
export async function writeReadme(plan, markdown) {
  if (!markdown.trim()) throw new Error('Cannot write an empty README.');
  const content = `${markdown.trim()}\n`;
  await mkdir(path.dirname(plan.outputPath), { recursive: true });
  let handle;
  try {
    if (plan.original) verifyUnchanged(await lstat(plan.outputPath), plan.original);
    handle = await open(plan.outputPath, plan.original ? 'r+' : 'wx');
    if (plan.original) verifyUnchanged(await handle.stat(), plan.original);
    await handle.writeFile(content, 'utf8');
    await handle.truncate(Buffer.byteLength(content, 'utf8'));
    return plan.outputPath;
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Output appeared during generation. Run again to confirm replacement.');
    if (error.code) throw new Error(`Cannot write README "${plan.outputPath}" (${error.code}).`);
    throw error;
  } finally {
    await handle?.close();
  }
}
