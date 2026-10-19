/** Folder names skipped before traversal; matching is case-insensitive. */
export const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.cache', '.idea', '.vscode', 'vendor', '__pycache__', '.venv', 'venv',
  '.aws', '.ssh', '.secrets',
]);

/** Generated files, dependency locks, and common credential files. */
export const IGNORE_FILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lock', 'bun.lockb', 'composer.lock', 'cargo.lock', 'poetry.lock',
  'pipfile.lock', 'gemfile.lock', 'uv.lock', '.ds_store', 'thumbs.db',
  '.npmrc', '.pypirc', 'credentials', 'credentials.json', 'secrets.json',
]);

/** A text allowlist excludes images, archives, executables, and other binaries. */
export const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt',
  '.yaml', '.yml', '.toml', '.html', '.css', '.scss', '.sh', '.py', '.go',
  '.rs', '.java', '.rb', '.php', '.c', '.h', '.cpp', '.sql', '.vue', '.svelte',
]);

/** Useful text files that do not have a conventional text extension. */
export const TEXT_FILE_NAMES = new Set([
  'dockerfile', 'makefile', 'license', 'licence', 'copying', 'procfile',
  '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc', '.eslintrc',
  '.babelrc', '.env.example',
]);

/** Central limits bound disk reads, source excerpts, and the complete prompt. */
export const LIMITS = Object.freeze({
  maxFileLines: 200,
  maxFileBytes: 12_000,
  maxTotalContentBytes: 40_000,
  maxPromptBytes: 48_000,
  maxFiles: 40,
  maxOutputTokens: 4_096,
  requestTimeoutMs: 60_000,
});

/** Anthropic is optional and must be explicitly selected before using credits. */
export const MODEL = 'claude-sonnet-5-5';

/** Free local generation is the default, even when an Anthropic key exists. */
export const DEFAULT_PROVIDER = 'ollama';
export const LOCAL_MODEL = 'qwen3:1.7b';
export const LOCAL_BASE_URL = 'http://127.0.0.1:11434';

/** Smaller excerpts reduce memory use and leave room for a local model's answer. */
export const LOCAL_LIMITS = Object.freeze({
  ...LIMITS,
  maxFileBytes: 3_000,
  maxTotalContentBytes: 5_000,
  maxPromptBytes: 8_000,
  maxOutputTokens: 2_048,
  requestTimeoutMs: 600_000,
  contextTokens: 12_288,
});

/** The title is an H1; the remaining required sections are H2 headings. */
export const README_SECTIONS = Object.freeze([
  'Description', 'Features', 'Tech Stack', 'Installation', 'Usage',
  'Project Structure', 'Contributing', 'License',
]);
