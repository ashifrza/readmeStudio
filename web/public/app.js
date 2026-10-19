const form = document.querySelector('#project-form');
const description = document.querySelector('#description');
const count = document.querySelector('#description-count');
const generateButton = document.querySelector('#generate-button');
const generateLabel = document.querySelector('#generate-label');
const outputPanel = document.querySelector('#output-panel');
const emptyState = document.querySelector('#empty-state');
const loadingState = document.querySelector('#loading-state');
const output = document.querySelector('#readme-output');
const status = document.querySelector('#output-status');
const errorMessage = document.querySelector('#error-message');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
let markdown = '';
let isGenerating = false;

/** Show errors as plain text, never as HTML returned by a visitor or model. */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

/** Keep loading, empty, and completed states consistent across every request. */
function setGenerating(busy) {
  isGenerating = busy;
  generateButton.disabled = busy;
  generateLabel.textContent = busy ? 'Writing your README…' : 'Generate README';
  outputPanel.setAttribute('aria-busy', String(busy));
  loadingState.hidden = !busy;
  emptyState.hidden = busy || Boolean(markdown);
  output.hidden = busy || !markdown;
  copyButton.disabled = busy || !markdown;
  downloadButton.disabled = busy || !markdown;
  copyButton.textContent = 'Copy';
}

/** Submit a description to our Node server; the browser never calls an AI provider. */
async function submitProject(event) {
  event.preventDefault();
  if (isGenerating || !form.reportValidity()) return;
  errorMessage.hidden = true;
  const details = Object.fromEntries(new FormData(form));
  setGenerating(true);
  status.textContent = 'Generating with local Ollama. This may take a few minutes.';
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Generation failed. Try again.');
    if (typeof data.markdown !== 'string' || !data.markdown.trim()) {
      throw new Error('No README was returned. Try again.');
    }
    markdown = data.markdown;
    output.value = markdown;
    status.textContent = 'Your draft is ready. Review it before sharing.';
    if (window.matchMedia('(max-width: 760px)').matches) {
      outputPanel.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  } catch (error) {
    showError(error instanceof TypeError || error instanceof SyntaxError
      ? 'Could not connect to the website. Keep the npm run web terminal open and try again.'
      : error.message);
    status.textContent = markdown ? 'Your previous draft is still available.' : 'Generation failed. Check the message beside the form.';
  } finally {
    setGenerating(false);
  }
}

/** Copy the raw Markdown; selection remains available if clipboard access is denied. */
async function copyReadme() {
  if (!markdown || isGenerating) return;
  try {
    await navigator.clipboard.writeText(markdown);
    copyButton.textContent = 'Copied!';
    status.textContent = 'README Markdown copied to your clipboard.';
  } catch {
    output.focus();
    output.select();
    status.textContent = 'Text selected. Press Ctrl+C or Command+C to copy.';
  }
}

/** Download exactly the generated text as a UTF-8 Markdown file. */
function downloadReadme() {
  if (!markdown || isGenerating) return;
  const blob = new Blob([`${markdown.trim()}\n`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'README.md';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  status.textContent = 'README.md download requested. Check your browser downloads.';
}

description.addEventListener('input', () => {
  count.textContent = `${description.value.length} / 3000`;
});
form.addEventListener('submit', submitProject);
copyButton.addEventListener('click', copyReadme);
downloadButton.addEventListener('click', downloadReadme);
