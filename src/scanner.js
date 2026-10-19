import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  IGNORE_DIRS, IGNORE_FILES, TEXT_EXTENSIONS, TEXT_FILE_NAMES,
} from './config.js';

/** Match the case-insensitive path behavior of Windows when excluding outputs. */
function pathKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Decide whether a file is useful text without opening it. */
function isImportantFile(name) {
  const lower = name.toLowerCase();
  if (lower === '.env.example') return true;
  if (lower === '.env' || lower.startsWith('.env.')) return false;
  if (IGNORE_FILES.has(lower) || lower.endsWith('.lock')) return false;
  if (/(^|[._-])(secrets?|credentials?)([._-]|$)/i.test(lower)) return false;
  if (/\.(min\.(js|css)|map)$/.test(lower)) return false;
  return TEXT_FILE_NAMES.has(lower) || TEXT_EXTENSIONS.has(path.extname(lower));
}

/** Give manifests, entry points, and configuration files the first input slots. */
function priority(relativePath) {
  const name = path.basename(relativePath).toLowerCase();
  if (name === 'package.json') return 0;
  if (/^(index|app|main|server|cli)\.(js|mjs|cjs|ts|tsx|jsx)$/.test(name)) return 1;
  if (/(^|[.-])config([.-]|$)/.test(name)) return 2;
  if (TEXT_FILE_NAMES.has(name) || /\.(json|ya?ml|toml)$/.test(name)) return 2;
  return 3;
}

/** Recursively collect regular files; symbolic links are deliberately skipped. */
async function walk(directory, excluded, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read folder "${directory}" (${error.code}).`);
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (excluded.has(pathKey(fullPath))) continue;
    if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name.toLowerCase())) {
      await walk(fullPath, excluded, files);
    } else if (entry.isFile() && isImportantFile(entry.name)) {
      files.push(fullPath);
    }
  }
}

/** Fail early when the supplied project path is missing or is not a folder. */
async function validateDirectory(root) {
  let info;
  try {
    info = await stat(root);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Project folder not found: ${root}`);
    throw new Error(`Cannot access project folder "${root}" (${error.code}).`);
  }
  if (!info.isDirectory()) throw new Error(`Project path is not a folder: ${root}`);
}

/**
 * Scan a project and return absolute file paths in a stable priority order.
 * @param {string} projectPath Project folder to scan.
 * @param {{ excludePaths?: string[] }} [options] Output files to leave out.
 * @returns {Promise<string[]>} Candidate text files, most useful first.
 */
export async function scanProject(projectPath, { excludePaths = [] } = {}) {
  const root = path.resolve(projectPath);
  await validateDirectory(root);
  const excluded = new Set(excludePaths.map(pathKey));
  const files = [];
  await walk(root, excluded, files);
  if (!files.length) {
    throw new Error('No supported project files found. The folder is empty or contains only ignored files.');
  }
  return files.sort((a, b) => {
    const left = path.relative(root, a);
    const right = path.relative(root, b);
    return priority(left) - priority(right)
      || left.split(path.sep).length - right.split(path.sep).length
      || left.localeCompare(right);
  });
}
