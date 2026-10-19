# Run README Studio

README Studio is the website version of this project. A visitor describes a project, submits the form, and downloads a README.md draft. The website uses your existing local Ollama model, with no API key or API charges.

## 1. Open the project folder

In VS Code, choose File, then Open Folder. Select the readme-gen folder that contains package.json, src, bin, and web.

Choose Terminal, then New Terminal. Run all commands below in that terminal, one at a time. The terminal should be inside the readme-gen folder.

## 2. Open Ollama

Open Ollama from the Windows Start menu and leave it running in the background. Check the terminal can find it:

```powershell
ollama --version
```

If this computer has not downloaded the model yet, run:

```powershell
ollama pull qwen3:1.7b
```

Wait for success before continuing. If the model is already downloaded, you can skip the pull command. You need internet for the initial software and model downloads; generation then runs locally. See the [official Ollama Windows guide](https://docs.ollama.com/windows).

## 3. Install the JavaScript dependencies

Run this once after downloading or updating the project:

```powershell
npm install
```

The website uses the same dependencies as the existing CLI. It adds no extra npm packages.

## 4. Start the website

```powershell
npm run web
```

The terminal prints:

```text
README Studio: http://localhost:3000
Free local AI: qwen3:1.7b. Keep Ollama running.
Press Ctrl+C in this terminal to stop the website.
```

Keep this terminal open. It is running the server that receives the browser form and talks to Ollama.

## 5. Open the page in your browser

Enter this address in the address bar of Edge, Chrome, or another browser:

```text
http://localhost:3000
```

You should see README Studio, a project form, and a README.md output panel.

## 6. Describe a project

For a first test, enter this fictional example:

```text
Project name:
TaskNest

What does it do?
A task manager for students to organize assignments, set due dates, and mark
tasks as complete. Students can group tasks by course and see which assignments
are still pending.

Tech stack:
JavaScript, Node.js, HTML, and CSS
```

Project name and description are required. The description needs at least 40 characters. Tech stack is optional. Expand Add installation & usage notes to supply actual setup and start commands for your own project.

The website analyzes the details entered in the form. It does not scan a repository. Missing setup instructions, folder structure, or license details should stay marked as unspecified. Adding accurate details improves the result.

## 7. Generate and download the README

Click Generate README. The button shows a loading message while Ollama writes the draft. A small local model can take several minutes, depending on your computer.

When generation succeeds, the output panel contains Markdown. Review the claims and commands. Click Copy to copy the Markdown, or Download to save README.md using your browser's normal download behavior.

The result contains a title, Description, Features, Tech Stack, Installation, Usage, Project Structure, Contributing, and License. Ollama returns structured section content, and JavaScript adds the title and headings. The server rejects invalid or incomplete section data before returning a successful result.

Submissions are kept in memory for the request. The server does not save them or the generated README to project files. The browser holds the current draft until you reload or close the page.

## 8. Stop the website

Return to the terminal running the website and press Ctrl+C. Next time, open Ollama, run npm run web in the project folder, and open the browser address again.

## How the files work together

```text
Browser form: web/public/index.html
    -> Browser request: web/public/app.js
    -> Node endpoint: web/server.js, POST /api/generate
    -> Description prompt: src/descriptionPrompt.js
    -> Local model request and validation: src/llmClient.js
    -> Browser output and README.md download
```

The stylesheet lives in web/public/styles.css. The original scanner, reader, and writer remain part of the terminal CLI and are not used by the website form.

## Troubleshooting

If the browser cannot open the page, check that the terminal is still running npm run web and has printed the local address.

If generation says it cannot reach Ollama, open Ollama from the Start menu. If necessary, open a second terminal and run ollama serve there, then retry the form in the browser.

If the model is missing, run ollama pull qwen3:1.7b. If generation runs out of memory, close unused applications. The existing OLLAMA_MODEL setting can select another downloaded local model.

If port 3000 is busy, stop your earlier website terminal with Ctrl+C. To use port 3001 instead, run these commands in the website terminal:

```powershell
$env:PORT = '3001'
npm run web
```

Then open http://localhost:3001. To return to port 3000 in a later run, remove the session setting:

```powershell
Remove-Item Env:PORT -ErrorAction SilentlyContinue
```

The website always selects local Ollama, including when the CLI's LLM_PROVIDER environment setting selects Anthropic. It accepts one generation at a time so multiple submissions do not load multiple model requests into memory.

## Check the implementation

```powershell
npm run check
npm test
```

The website tests use synthetic descriptions and a fake Ollama server on loopback. They cover validation, input budgets, asset access, errors, concurrent requests, and the local-only provider selection. No paid model is called.

## Let other people visit it

This version binds to this computer's loopback address. Localhost works only on the computer running the server; sending that address to a friend does not give them access.

For a public website, the Node backend needs a reachable host and access to a running model. Visitors would use a browser; the host runs Node and Ollama. Hosting only the HTML files cannot run this backend or connect to the Ollama process on your private computer.

Public deployment is a separate step. It needs a hosting choice, a reachable model service, HTTPS, and request limits appropriate to the machine. Local model generation avoids API charges, but publicly serving it still requires an available computer and internet connection. This project has not been deployed publicly.
