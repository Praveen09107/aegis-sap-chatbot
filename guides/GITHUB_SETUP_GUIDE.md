# AEGIS — GITHUB REPOSITORY SETUP GUIDE
## Complete Step-by-Step for Beginners

---

## STEP 1 — Create a GitHub Account (skip if you have one)

1. Open browser → go to `https://github.com`
2. Click **Sign up**
3. Enter your email, create a password, choose a username
4. Verify your email address
5. Choose the **Free** plan
6. Skip the personalization questions

---

## STEP 2 — Create the Repository

1. After login, click the **+** icon (top-right, next to your profile icon)
2. Click **New repository**
3. Fill in the form exactly as below:

```
Repository name:   aegis-sap-helpdesk
Description:       AEGIS SAP Helpdesk AI — Sona Comstar
Visibility:        ● Private   ← MUST be Private (enterprise code)
Initialize:        ✗ Do NOT tick "Add a README file"
                   ✗ Do NOT add .gitignore (you already have one)
                   ✗ Do NOT choose a license
```

4. Click **Create repository**

GitHub shows your new empty repository. The page has a URL like:
```
https://github.com/YOUR-USERNAME/aegis-sap-helpdesk
```

**Keep this page open.** You need the URL in Step 5.

---

## STEP 3 — Generate a Personal Access Token (PAT)

GitHub no longer accepts passwords for Git operations. You need a token.

1. Click your profile picture (top-right) → **Settings**
2. Scroll down the left sidebar → **Developer settings** (at the very bottom)
3. Click **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. Fill in:

```
Note:        AEGIS Development
Expiration:  90 days  (or choose "No expiration" if preferred)
Scopes:      ✓ repo      (tick this — it selects all sub-items)
             ✓ workflow  (tick this)
```

6. Click **Generate token** at the bottom
7. **COPY THE TOKEN NOW** — GitHub shows it only once

The token looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Save it somewhere safe (your phone notes, a password manager). You cannot view it again on GitHub after leaving the page.

---

## STEP 4 — Configure Git in Ubuntu

Open Ubuntu terminal (from Windows: press Windows key, type Ubuntu, press Enter).

Run these four commands with your real name and email:

```bash
git config --global user.name "Praveen"
git config --global user.email "your-email@example.com"
git config --global credential.helper store
git config --global init.defaultBranch main
```

The `credential.helper store` line saves your token after the first use, so you never have to type it again.

---

## STEP 5 — Connect Your Local Project to GitHub

In Ubuntu terminal:

```bash
# Go to your project
cd ~/aegis-project

# Initialize git (if not already done)
git init
git checkout -b main

# Connect to GitHub
# Replace YOUR-USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR-USERNAME/aegis-sap-helpdesk.git

# Verify the connection
git remote -v
```

Expected output:
```
origin  https://github.com/YOUR-USERNAME/aegis-sap-helpdesk.git (fetch)
origin  https://github.com/YOUR-USERNAME/aegis-sap-helpdesk.git (push)
```

---

## STEP 6 — Initial Commit and Push

```bash
cd ~/aegis-project

# Stage all files
git add -A

# Check what will be committed
# Verify .env does NOT appear in this list
git status

# Create the first commit
git commit -m "Initial AEGIS project structure

- All directories created (80 directories)
- Essential files: .gitignore, .env.example, Makefile, .editorconfig
- Onboarding files: CONTRIBUTING.md, docs/ARCHITECTURE.md, docs/ONBOARDING.md
- Docker ignores: backend/.dockerignore, frontend/.dockerignore
- Service READMEs: bge-embedding, deberta-nli
- Python package markers: all __init__.py files
- All paths match IMPL_01-29 and FRONTEND_01-40 spec documents
- Agent (Copilot) will create all source code during implementation sessions"

# Push to GitHub
git push -u origin main
```

When asked for credentials:
- **Username:** your GitHub username
- **Password:** paste your Personal Access Token (the `ghp_xxx...` token from Step 3)

After this, Git saves your token. All future `git push` commands work without asking.

---

## STEP 7 — Verify on GitHub

1. Refresh your GitHub repository page
2. You should see all your directories listed
3. Check that `.env` does NOT appear (the `.gitignore` should exclude it)
4. The `specs/` folder should show all your specification documents
5. The `backend/` folder should show the structure
6. The `docs/` folder should show `ARCHITECTURE.md` and `ONBOARDING.md`
7. The `guides/` folder should show your pre-implementation guides

If `.env` appears in GitHub, run these commands immediately:
```bash
git rm --cached .env
git commit -m "Remove .env from tracking"
git push
```
Then verify `.env` is in your `.gitignore` file.

---

## STEP 8 — Create the Dev Branch

```bash
cd ~/aegis-project

# Create and push the dev branch
git checkout -b dev
git push -u origin dev

# Return to main
git checkout main
```

You now have two branches:
- `main` — production-ready code only
- `dev` — integration branch (all sessions merged here)

---

## STEP 9 — Protect the Main Branch

This prevents accidentally pushing broken code directly to main.

1. On GitHub, go to your repository
2. Click **Settings** (top tab row)
3. Left sidebar → **Branches**
4. Click **Add branch protection rule**
5. Branch name pattern: `main`
6. Tick:
   - ✓ Require a pull request before merging
   - ✓ Do not allow bypassing the above settings
7. Click **Create**

---

## STEP 10 — Your Daily Workflow

**Before every implementation session:**

```bash
cd ~/aegis-project

# Get latest code
git checkout dev
git pull origin dev

# Create a branch for this session
# Replace XX with the IMPL number, e.g. impl-03-docker
git checkout -b session/impl-XX-description
```

**During the session:**
The agent creates files. You review. No need to commit during the session.

**After the session is complete and verified:**

```bash
git add -A
git commit -m "Session N: IMPL_XX — [short description]

- [what was built]
- [what was tested]"

git push -u origin session/impl-XX-description
```

**After review, merge to dev:**

```bash
git checkout dev
git merge session/impl-XX-description
git push origin dev
```

---

## STEP 11 — VS CODE + GITHUB COPILOT SETUP FOR AEGIS

Setting up VS Code correctly gives Copilot the best context when implementing AEGIS specs.

### Install VS Code

Download from `https://code.visualstudio.com` (Windows installer).

### Install Required Extensions

Open VS Code, press `Ctrl+Shift+X` (Extensions panel), and install:

```
GitHub Copilot              (github.copilot)        ← AI code completion
GitHub Copilot Chat         (github.copilot-chat)   ← Chat interface for spec implementation
Python                      (ms-python.python)       ← Python language support
Pylance                     (ms-python.vscode-pylance) ← Fast type checking
ESLint                      (dbaeumer.vscode-eslint) ← TypeScript linting
Tailwind CSS IntelliSense   (bradlc.vscode-tailwindcss) ← Tailwind class autocomplete
Docker                      (ms-azuretools.vscode-docker) ← Docker Compose management
Remote - WSL                (ms-vscode-remote.remote-wsl) ← Edit files in WSL2 from Windows
```

### Open the Project Correctly

Always open the project from inside WSL2 Ubuntu, not from Windows Explorer:

```bash
# In Ubuntu terminal
cd ~/aegis-project
code .
```

This opens VS Code connected to WSL2. All terminal commands run in Ubuntu, not Windows PowerShell.

### Configure VS Code Workspace Settings

Create `.vscode/settings.json` in your project (this file is gitignored, so it stays local):

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/.venv/bin/python",
  "python.terminal.activateEnvironment": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "ms-python.black-formatter",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "github.copilot.enable": {
    "*": true
  }
}
```

---

## STEP 12 — USING COPILOT WITH AEGIS SPEC DOCUMENTS

GitHub Copilot Chat is the implementation agent for AEGIS. Here is how to use it effectively.

### The Implementation Prompt Pattern

For each implementation session, open Copilot Chat (`Ctrl+Shift+I`) and paste this prompt:

```
You are implementing Session [N] of the AEGIS SAP Helpdesk AI for Sona Comstar.

Read the full specification document at: specs/tier2_implementation/IMPL_[XX]_[NAME].md

The project directory structure is in: guides/AEGIS_DIRECTORY_STRUCTURE.md
The full reference tree showing all expected files is in Part 4 of that document.

Instructions:
1. Read the entire spec document first before writing any code
2. Create all files exactly at the paths specified in the spec
3. If a file already exists, edit it — do not create a duplicate
4. After creating all files, run the verification commands from the spec
5. Report any files you could not create and explain why

Begin with Session [N]: [IMPL_XX] — [description]
```

### Using Copilot to Verify Structure

After any session, ask Copilot to check the structure:

```
Open the file guides/AEGIS_DIRECTORY_STRUCTURE.md
Go to the section "FULL FINAL REFERENCE TREE — FOR COPILOT VERIFICATION"
Check my current project against that reference tree.
List any files from the reference tree that are missing from my project.
```

### Giving Copilot Good Context

Copilot works better when it can see related files. Before asking it to implement a service, open the relevant spec AND the existing related files in VS Code:

- When implementing `form_chunker.py` → also open `ingestion_pipeline.py` (same pattern)
- When implementing Quick Entry pages → also open an existing admin page (same layout pattern)
- When implementing a new task → also open an existing task (same ARQ pattern)

### Copilot Chat Commands for AEGIS

```
/explain [select a complex function] — explains what it does
/fix [select broken code] — Copilot suggests a fix
/tests [select a function] — generate unit tests
/doc [select a function] — generate docstring
```

---

## BRANCH NAMING CONVENTION

```
session/impl-01-dependencies
session/impl-02-env-setup
session/impl-03-docker
session/impl-04-models
session/impl-05-postgresql
session/impl-06-qdrant
session/impl-07-opensearch
session/impl-08-redis
session/impl-09-middleware
session/impl-10-security
session/impl-11-orchestration
session/impl-12-query-intelligence
session/impl-13-vision-service
session/impl-14-retrieval-stages-1-5
session/impl-15-retrieval-stages-6-8
session/impl-16-reasoning-service
session/impl-17-validation-engine
session/impl-18-ingestion-pipeline
session/impl-19-employee-frontend
session/impl-20-admin-observability
session/impl-21-fix-session
session/impl-22-final-polish
session/impl-23-quickentry-overview
session/impl-24-quickentry-data-model
session/impl-25-quickentry-api
session/impl-26-quickentry-pipeline
session/impl-27-quickentry-chunker
session/impl-28-quickentry-screenshots
session/impl-29-quickentry-operations
session/frontend-01-11-core
session/frontend-12-15-employee
session/frontend-16-22-admin
session/frontend-36-40-quickentry
```

---

## USEFUL GIT COMMANDS CHEAT SHEET

```bash
# Check what branch you are on
git branch

# See all changes since last commit
git status

# See what changed inside specific files
git diff

# See commit history
git log --oneline -10

# Undo all uncommitted changes (careful — this deletes your work)
git checkout .

# See all branches including remote
git branch -a

# Delete a local branch after merging
git branch -d session/impl-XX-description

# Pull latest changes from dev
git checkout dev && git pull origin dev

# See which files the agent created in this session
git diff --name-only HEAD

# See full diff of a specific file
git diff backend/app/services/model_gateway.py
```

---

## IF SOMETHING GOES WRONG

**Accidentally committed .env:**
```bash
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Remove .env and update gitignore"
git push
```

**Push rejected (someone else pushed):**
```bash
git pull origin dev --rebase
git push
```

**Want to undo the last commit (before pushing):**
```bash
git reset HEAD~1
```

**Wrong branch — committed to main instead of dev:**
```bash
# Save your commit hash
git log --oneline -1   # note the hash e.g. abc1234
# Apply it to dev
git checkout dev
git cherry-pick abc1234
git push origin dev
# Remove from main
git checkout main
git reset HEAD~1
git push origin main --force
```

**Agent created a file in the wrong location:**
```bash
# Move it to the correct path
git mv wrong/path/file.py correct/path/file.py
git commit -m "Fix: move file.py to correct location per spec"
```

**Need to see what files were created in a specific commit:**
```bash
git show --stat <commit-hash>
```

**Check if a specific file matches what the spec expects:**
```
In Copilot Chat:
"Compare backend/app/services/model_gateway.py against what IMPL_16 specifies.
List any missing functions or incorrect implementations."
```

