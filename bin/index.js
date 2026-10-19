#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { scanProject } from '../src/scanner.js';
import { readProjectFiles } from '../src/reader.js';
import { buildPrompt } from '../src/promptBuilder.js';
import { generateReadme, getLlmSettings } from '../src/llmClient.js';
import { prepareOutput, writeReadme } from '../src/writer.js';

/** Run the five-stage generation loop for one project folder. */
async function run(projectPath, options) {
  const root = path.resolve(projectPath);
  const outputPath = path.resolve(root, options.output);
  const settings = getLlmSettings();
  console.log(`Using ${settings.label} (${settings.model}).`);
  console.log(`Scanning ${root}`);
  const candidates = await scanProject(root, { excludePaths: [outputPath] });
  const context = await readProjectFiles(candidates, root, settings.limits);
  for (const warning of context.warnings) console.warn(warning);
  const prompt = buildPrompt(root, context.files, settings.limits);
  const output = await prepareOutput(outputPath);
  if (!output) {
    console.log('Cancelled. No API request was sent.');
    return;
  }
  const omitted = context.skipped + prompt.omittedFiles;
  console.log(`Selected ${prompt.includedFiles} files; omitted ${omitted} candidates.`);
  console.log(`Sending ${prompt.promptBytes} prompt bytes to ${settings.label}...`);
  const markdown = await generateReadme(prompt);
  const savedPath = await writeReadme(output, markdown);
  console.log(`Saved ${savedPath}`);
}

const program = new Command();
program
  .name('readme-gen')
  .description('Generate a README with a free local Ollama model (default) or optional Anthropic API.')
  .argument('<project-path>', 'project folder to scan')
  .option('-o, --output <file>', 'output path, relative to the project folder', 'README.md')
  .action(run);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
