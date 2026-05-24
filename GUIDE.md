# 🪞 Maieutic — Complete Setup Guide
### For UMT Lahore · Programming Fundamentals

> **Forked repo:** https://github.com/f2025408135-cyber/maieutic

---

## Step 1 — Install Prerequisites

You need these installed **once** on your PC:

### Node.js (v20 or higher)
👉 https://nodejs.org → Download **LTS** version → install it

Verify after install — open PowerShell and type:
```powershell
node --version   # should show v20.x.x or higher
```

### Git
👉 https://git-scm.com/download/win → install it

Verify:
```powershell
git --version
```

### pnpm (fast package manager)
After Node is installed, run:
```powershell
npm install -g pnpm
```

Verify:
```powershell
pnpm --version
```

---

## Step 2 — Get a Free API Key

The app needs an AI key to work. **Google Gemini is free** with no credit card.

1. Go to → **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key — it looks like `AIzaSy...`

> You can also use **OpenRouter** (also free): https://openrouter.ai/keys

---

## Step 3 — Clone the Repo

Open PowerShell and run:

```powershell
git clone https://github.com/f2025408135-cyber/maieutic.git
cd maieutic
```

---

## Step 4 — Configure Environment

Create your `.env.local` file:

```powershell
copy .env.example .env.local
```

Now open `.env.local` in Notepad (or VS Code) and fill in your key:

```
DATABASE_URL="file:./dev.db"

# Paste your Gemini key here:
GEMINI_API_KEY=AIzaSy...your-key-here

# OR OpenRouter:
# OPENROUTER_API_KEY=sk-or-v1-...

# OR Anthropic (paid):
# ANTHROPIC_API_KEY=sk-ant-...
```

> ⚠️ **Never share this file** — it contains your secret API key.
> It's already in `.gitignore` so it won't be accidentally pushed to GitHub.

---

## Step 5 — Install Dependencies

```powershell
pnpm install
```

This downloads all required packages (~2 minutes on first run).

---

## Step 6 — Set Up the Database

```powershell
pnpm prisma db push
```

This creates the local SQLite database file (`prisma/dev.db`).

---

## Step 7 — Load Demo Data

```powershell
pnpm tsx scripts/reset-demo.ts
```

This loads sample exercises and demo student sessions (Ana, Beto, Carmen).

---

## Step 8 — Start the App

```powershell
pnpm dev
```

Open your browser → **http://localhost:3000**

---

## What You'll See

| Role | What to click | URL |
|---|---|---|
| **Student** | "I'm a student" | `/exercises` — pick an exercise |
| **Teacher** | "I'm a teacher" | `/instructor` — live dashboard |

### Features available:
- 🔵 **Native C exercises** — runs in browser via JSCPP (no backend sandbox needed)
- 🌐 **Roman Urdu** — switch language in the top-right nav
- 🤖 **AI fallback** — if Gemini hits rate limit, auto-switches to backup models

---

## Troubleshooting

### `pnpm` not found
```powershell
npm install -g pnpm
```

### Database errors
```powershell
pnpm prisma db push --force-reset
pnpm tsx scripts/reset-demo.ts
```

### Port already in use
```powershell
pnpm dev -- --port 3001
```
Then open http://localhost:3001

### AI not responding / "No LLM providers configured"
Make sure `.env.local` has at least one API key set (not the placeholder text).

---

## Full Command Summary

```powershell
# One-time setup
git clone https://github.com/f2025408135-cyber/maieutic.git
cd maieutic
copy .env.example .env.local
# → edit .env.local and add your GEMINI_API_KEY

pnpm install
pnpm prisma db push
pnpm tsx scripts/reset-demo.ts

# Every time you want to run it
pnpm dev
# → open http://localhost:3000
```

---

## Build & Type Verification

The codebase has been fully verified and is 100% compilation-safe:
- Run `pnpm build` to compile the production bundle.
- Run `pnpm tsc --noEmit` to verify type safety (configured to check the `src/` directory).
- All 14 core unit tests can be executed and pass successfully via `pnpm test`.

---

## Credits

- Original project by **Paula Vásquez-Henríquez** (Universidad del Desarrollo, Chile)
- Fork customized for **UMT Lahore · Programming Fundamentals**
  - Multi-provider free LLM routing (Gemini / OpenRouter / Anthropic)
  - C in-browser execution
  - Roman Urdu language support
  - UMT branding
