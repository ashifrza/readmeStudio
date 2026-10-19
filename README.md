# readme-gen

## Description

A small Node.js CLI that reads selected project files, asks a local model to document the project, and saves a README. The default uses Ollama on your computer, with no API key or API credits. Each module handles one part of the process so the code is easy to follow and change.

```text
scan folder -> read excerpts -> build prompt -> call local model -> save README
```

## Features

- It scans supported source and configuration files recursively.
- It uses a free local Ollama model by default and never falls back to a paid provider.
- It skips dependencies, build output, images, binaries, lock files, and common credential files.
- It prioritizes package manifests, entry points, and configuration files.
- It limits each excerpt to 200 lines and applies the selected provider's byte budget.
- It selects at most 40 files and checks the size of the complete prompt.
- It requests a title and all eight required README sections, then checks that the response contains them.
- It asks before overwriting an existing file and reports common API and filesystem errors.

The byte budget is a conservative input bound, not an exact token count. Paths, JSON escaping, and instructions count toward the final prompt limit, so some excerpts may be omitted even after reading them. Smaller excerpts help keep local memory use manageable.

| Limit | Ollama, the default | Optional Anthropic API |
|---|---:|---:|
| Bytes per file | 3,000 | 12,000 |
| Total source bytes | 5,000 | 40,000 |
| Complete prompt bytes | 8,000 | 48,000 |
| Maximum output tokens | 2,048 | 4,096 |
| Request timeout | 10 minutes | 60 seconds per attempt |

The local request uses a 12,288-token context to leave room for the bounded prompt, message formatting, and output. Byte caps are intentionally conservative. A model can still produce inaccurate documentation; review its claims and commands.

## Tech Stack

This project uses Node.js 18+ with ES modules and three direct dependencies:

- Commander parses command-line arguments.
- dotenv loads optional settings from a local environment file.
- The Anthropic SDK supports the original paid provider when explicitly selected.

The default local client uses Node's built-in fetch, with no extra npm dependency. Filesystem access, paths, and terminal questions also use built-in modules. The default model is [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b), served by Ollama. The optional Anthropic SDK remains pinned to version 0.39.0 for Node 18 compatibility; [that version's requirements](https://github.com/anthropics/anthropic-sdk-typescript/tree/sdk-v0.39.0#requirements) document Node 18 support.

## Installation

Open this project folder in VS Code. Select Terminal, then New Terminal. Install the dependencies if you have not already done so:

```sh
npm install
```

Install Ollama from its [official Windows download page](https://ollama.com/download/windows), using the Windows installer. The [Windows guide](https://docs.ollama.com/windows) lists supported systems and disk requirements: allow at least 4 GB for the application, plus model storage. The default model is approximately a 1.4 GB download. You need internet access for these downloads; generation then runs on your computer.

After installation, close and reopen VS Code so the new terminal sees the Ollama command. Check that installation worked:

```powershell
ollama --version
```

Download the local model once:

```powershell
ollama pull qwen3:1.7b
```

Wait for the download to complete. The Ollama Windows app runs the local server in the background. If the CLI later says it cannot reach Ollama, open Ollama from the Start menu and retry. Close unused apps if memory is tight. Local generation can take several minutes on a CPU.

No environment file or API key is required for this default setup. An existing Anthropic key does not enable paid calls. The tool chooses Anthropic only when you explicitly set the provider to anthropic.

For optional local settings, create or edit an environment file in the folder where you run the command:

```dotenv
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3:1.7b
```

These values are already the defaults. Do not overwrite an existing environment file just to use local generation. dotenv reads from the terminal's current working folder; existing environment variables take precedence. The optional local server address must be a loopback HTTP address, such as the default below:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

## Usage

For the first run, generate a README for this tool itself:

```sh
node bin/index.js . --output README.generated.md
```

The dot means the current folder. This command writes a separate output file and preserves this setup guide. When the terminal prints a Saved message, open the generated Markdown file in VS Code and press Ctrl+Shift+V to preview it.

For another project, replace the dot with that folder's real path. Use quotes around paths with spaces. Relative output paths resolve inside the project being scanned. Absolute output paths also work, and parent folders are created when saving.

The default request goes only to your local Ollama server. It sends no API key and does not follow redirects. Cloud model names are rejected. The scanner excludes the chosen output file, skips symbolic links, and includes only supported text types. It does not interpret a project's Git ignore rules or detect every secret embedded in source. Keep example environment files limited to placeholders.

View help without calling the API:

```sh
node bin/index.js --help
```

To make the executable available locally through npm, run this inside the tool's folder:

```sh
npm link
readme-gen . --output README.generated.md
```

When an output file exists, the CLI asks for confirmation before calling the model. Only an explicit yes permits replacement. The default answer cancels. An existing output requires an interactive terminal; redirected input cannot authorize replacement. If the file changes during generation, the writer refuses to replace it. New destinations use exclusive creation so a file that appears during generation is not silently overwritten.

Failures print a readable error and return exit code 1. Missing arguments, nonexistent paths, non-folder paths, empty or unsupported folders, and folders without readable text fail before a request. Incomplete responses or responses missing required sections are not written.

If a local response starts with Description and omits its H1 title, the client adds the project folder's name as the title, then checks all required sections. This small formatting repair also works when the response is inside a Markdown code fence. Other missing sections still cause an error.

| Local error | Action |
|---|---|
| Could not reach Ollama | Open Ollama from the Start menu. If needed, start its server in a second terminal using the command below. |
| Local model not found | Run the model download command from Installation. |
| Memory or allocation error | Close unused apps. A smaller model is an option, as described below. |
| Generation timed out | Close unused apps and retry. Check that the chosen model fits your computer. |
| Missing sections or incomplete output | Retry, then review the result carefully. Small models can omit requested details. |

To start a server manually, run this in a second terminal and leave it open while the first terminal runs the generator:

```powershell
ollama serve
```

If memory is still insufficient, download the smaller model:

```powershell
ollama pull qwen3:0.6b
```

Then change the local model setting in your environment file:

```dotenv
OLLAMA_MODEL=qwen3:0.6b
```

### Optional paid provider

The original Anthropic integration remains available for people who already have API credits. It is disabled by default and is never an automatic fallback. Selecting it requires these environment settings:

```dotenv
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Anthropic uses the larger limits shown above. Its SDK retries transient connection errors, rate limits, and server errors twice. HTTP 400 and 422 errors include a bounded provider detail with keys redacted. See [Anthropic's billing guide](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage) for account requirements.

## Project Structure

```text
readme-gen/
|-- bin/
|   `-- index.js          CLI arguments and the generation loop
|-- src/
|   |-- scanner.js        Folder traversal, filtering, and priority
|   |-- reader.js         Bounded text reads and truncation
|   |-- promptBuilder.js  Instructions and serialized source excerpts
|   |-- llmClient.js      Local/default and optional paid clients, response checks
|   |-- writer.js         Overwrite confirmation and file writing
|   `-- config.js         Ignore rules, provider limits, sections, and models
|-- package.json
|-- .env.example
|-- .gitignore
`-- README.md
```

## Contributing

Read the modules in this order: configuration, scanner, reader, prompt builder, LLM client, writer, and CLI. Follow the data between them: an array of paths becomes an array of excerpts, then a prompt, then Markdown.

Keep functions focused, document their purpose with JSDoc, and preserve the three-dependency scope. Check syntax before changing behavior:

```sh
npm run check
```

Run the local scan-and-prompt check below. It reads this project but does not call a model or write a README:

```sh
node --input-type=module -e '
import { scanProject } from "./src/scanner.js";
import { readProjectFiles } from "./src/reader.js";
import { buildPrompt } from "./src/promptBuilder.js";
import { LOCAL_LIMITS } from "./src/config.js";
const candidates = await scanProject(".");
const context = await readProjectFiles(candidates, ".", LOCAL_LIMITS);
const prompt = buildPrompt(".", context.files, LOCAL_LIMITS);
console.log({ files: prompt.includedFiles, bytes: prompt.promptBytes });
'
```

For manual error checks, run these separately. Both should print an error and exit with status 1 without an API call:

```sh
node bin/index.js
node bin/index.js ./a-folder-that-does-not-exist
```

### Possible next steps after the MVP

- Add a dry-run flag that previews the prompt without sending a request.
- Support custom README templates while preserving the source-data boundaries.
- Count tokens before sending, using the provider's token-counting API.
- Prepare an npm release by choosing an available package name and a license, removing the private flag, testing the packed executable, and publishing.

## License

No license has been selected. The package is marked UNLICENSED and private. Choose a license and add its text before distributing or publishing the package.
