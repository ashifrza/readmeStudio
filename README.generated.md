# readme-gen

## Description
readme-gen is a Node.js command-line tool that scans a project folder, reads selected source files, sends a bounded prompt to a local Ollama model, and saves a README. Local generation is the default. An optional Anthropic integration is available when explicitly selected.

## Features
- It scans supported text files recursively and prioritizes manifests, entry points, and configuration.
- It skips dependencies, build output, images, binaries, lock files, and common credential files.
- It bounds file excerpts, total input, and model output.
- It generates locally with Ollama and never falls back to a paid provider.
- It supports a custom output path and asks before replacing an existing file.
- It checks that the result contains a title and all required README sections.

The model receives selected excerpts and can make factual mistakes. Review generated commands, dependencies, installation instructions, and license claims before using a draft.

## Tech Stack
The implementation uses Node.js 18+ and JavaScript ES modules.

- Commander parses CLI arguments.
- dotenv loads optional environment settings.
- The Anthropic SDK supports the optional paid provider.
- Node's built-in fetch calls the local Ollama API.
- Node's built-in filesystem, path, and readline modules handle local operations.

The default model is Qwen3 1.7B.

## Installation
Open a terminal inside this project folder and install its dependencies:

```bash
npm install
```

Install Ollama using its [official instructions](https://docs.ollama.com/windows), then download the local model:

```bash
ollama pull qwen3:1.7b
```

Keep Ollama running. Local generation requires no API key or API credits.

## Usage

From this folder, generate a README for the current project:

```bash
node bin/index.js . --output README.generated.md
```

The dot means the current folder. For another project, replace it with that folder's real path. Relative output paths resolve inside the project being scanned.

When the terminal prints a Saved message, open the output file. If it already exists, enter y to confirm replacement or press Enter to cancel.

View the CLI's arguments and options with:

```sh
node bin/index.js --help
```

## Project Structure
```
readme-gen/
├── bin/
│   └── index.js
├── src/
│   ├── config.js
│   ├── scanner.js
│   ├── reader.js
│   ├── promptBuilder.js
│   ├── llmClient.js
│   └── writer.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Contributing
Keep functions focused, document their purpose with JSDoc, and update the setup guide when behavior changes. Check the CLI entry point's syntax with:

```sh
npm run check
```

Verify changes with a sample project, including error handling and overwrite confirmation. Keep real credentials out of source files and example environment files.

## License
No license has been selected. The package is marked private and UNLICENSED. Choose a license and add its text before distributing or publishing the package.
