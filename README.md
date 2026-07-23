# Klar

## Your next move, made clear.

Klar brings your entire job search into one calm, private workspace. Discover live roles, understand where you fit, create stronger applications, and keep every opportunity moving—without losing yourself in tabs, spreadsheets, and scattered notes.

[**Open Klar →**](https://karpit0499.github.io/klar/) · [See what’s new in v2.3](CHANGELOG.md)

![Klar dashboard](docs/klar-dashboard.png)

---

## From searching to applying. All in one place.

### Find roles worth your time

Search live opportunities across Germany and nearby European markets. Klar brings together public job feeds and employer career pages, removes repeated listings, and helps you focus with filters for location, distance, recency, employment type, language, and more.

When a search returns nothing, Klar does not leave you guessing. It shows what happened, which sources responded, which filters removed results, and what you can try next.

### Start the way that fits you

Klar meets you where you are. Choose the path that matches your search and it sets up only what you need:

- **Build a career profile** to match roles against a structured résumé.
- **Find flexible work** — minijobs, part-time, working-student, weekend, evening, and seasonal roles—without uploading a résumé at all.
- **Explore Klar first** in a temporary sample workspace where nothing is saved.
- **Restore a backup** and pick up exactly where you left off.

Setup remembers where you stopped, so you can leave and continue later instead of starting over.

### See the match. Understand the reason.

Klar reads your résumé and compares it with each role. Every match comes with a clear score breakdown, the strengths working in your favour, and the gaps worth considering.

Adjust what matters most to you. Save the promising roles. Hide the noise. Come back to a saved search and see what is genuinely new.

### Keep your résumé in one trustworthy place

Your résumé is now the single source of truth behind everything Klar does. Edit it directly inside Klar—experience, education, skills, projects, certifications, and languages—reorder what matters, and undo a change if you go too far. A structural completeness check points out missing dates or roles without achievements, and earlier versions are kept so you can look back or restore one.

### Make every application feel considered

Turn one résumé into a focused application for each opportunity. Klar can help you:

- Tailor your résumé in English or German.
- Download clean, ATS-friendly DOCX and PDF files.
- See which important keywords are covered or missing.
- Draft a cover letter grounded in your real experience.
- Prepare interview questions, talking points, and honest ways to address gaps.
- Explore salary context and estimate German take-home pay.

Klar is designed to strengthen your story—not invent a new one. Generated material stays tied to the specific bullets and facts in your résumé and should always be reviewed before you send it.

### Keep momentum without the spreadsheet

Move applications through a simple visual tracker. Add notes, contacts, reminders, and follow-ups. See older listings that may need attention, switch between board and list views, and export your progress whenever you need it.

---

## Private by design

Your career is personal. Klar treats it that way.

- Your résumé, profile, saved jobs, applications, and preferences stay in your browser.
- Klar has no application server that stores your career history.
- Your Groq key is used directly from your browser for AI features.
- Optional vault protection can encrypt sensitive career data and saved credentials on your device.
- A standard backup never contains API credentials.
- A complete encrypted backup can move credentials safely while keeping them unreadable.
- A readable data export is separate, clearly warned, and always requires confirmation.

When you use an AI feature, the information needed for that feature is sent to Groq for processing. It is not stored on a Klar-controlled application server. If you enable the vault, keep your passphrase safe—Klar cannot recover it.

---

## Built for a European job search

Use Klar in **English or German** across desktop and mobile. Search coverage includes:

- Germany
- Austria
- Switzerland
- The Netherlands
- Luxembourg
- Liechtenstein

Available roles vary by country, employer, and original job source.

---

## New in v2.3

### A résumé-first workspace that adapts to you.

Klar v2.3 rebuilds the foundation of the workspace around one clear résumé and an onboarding that fits how you actually search.

- **One canonical résumé** — your résumé is now the single source of truth. Everything Klar matches, tailors, and drafts is derived from it, so your experience stays consistent everywhere.
- **Edit your résumé inside Klar** — a full editor for experience, education, skills, projects, certifications, and languages, with reordering, undo, and a structural completeness check that flags missing dates and achievements.
- **Résumé history you can trust** — earlier versions are saved automatically, kept tidy over time, and can be restored whenever you need them.
- **Onboarding that adapts** — choose to build a career profile, find flexible work, explore a sample workspace, or restore a backup. Klar detects what you already have and lets you continue setup instead of starting over.
- **Flexible Work mode** — a résumé-free path built for minijobs, part-time, working-student, weekend, evening, and seasonal roles, with multi-city radius, schedule, and availability preferences.
- **Explore Klar first** — try a temporary sample workspace where nothing is saved before committing your own data.
- **Ask for a key only when needed** — Klar requests and verifies your Groq key at the moment an AI feature needs it, rather than blocking you at the door.
- **Grounded applications** — cover letters and interview prep now reference the exact résumé bullets they build on, keeping generated material tied to your real experience.
- **Safer exports and backups** — spreadsheet and CSV exports are hardened against formula injection, and backups carry your full workspace forward with checked, all-or-nothing restores.

[Read the complete changelog →](CHANGELOG.md)

---

## Start in a few minutes

You need a current browser and your own [Groq API key](https://console.groq.com/). Adzuna credentials are optional and add more listings and salary information where available.

1. [Open Klar](https://karpit0499.github.io/klar/).
2. Choose your language and appearance.
3. Pick how you want to start—career profile, flexible work, or a quick explore.
4. Upload a PDF or DOCX résumé and review it, or skip it for flexible work.
5. Tell Klar what kind of role you want.
6. Start discovering, comparing, and saving opportunities.

Klar can be installed from your browser for a more app-like experience.

---

## Good to know

- Job availability and freshness depend on the original providers.
- Some sources or salary features may require separate credentials and may have quotas.
- AI-generated material should be reviewed before submission.
- Salary calculations are estimates, not tax or financial advice.
- Because your workspace is local, clearing browser data or moving to another device can remove it. Download backups regularly.

---

## For contributors

Klar requires Node.js 20 or newer and npm.

```bash
git clone https://github.com/karpit0499/klar.git
cd klar
npm install
cp .env.example .env.local
npm run dev
```

Before proposing a change:

```bash
node --check public/sw.js
npm run typecheck
npm test
npm run build
```

The production app is published from `main` through GitHub Pages.

---

## Release journey

- **v2.3 — Résumé foundation & adaptive onboarding:** one canonical résumé, an in-app résumé editor with history, adaptive onboarding, a résumé-free Flexible Work mode, a sample explore workspace, grounded applications, and safer exports.
- **v2.2 — Stability & Safety:** stronger privacy boundaries, trustworthy backups, honest search diagnostics, safer connections, and resilient recovery.
- **v2.1 — Reliability:** bilingual résumé improvements, consistent state, responsive fixes, and safer updates.
- **v2 — The complete workspace:** multi-country discovery, application tools, localization, accessibility, salary insights, and a redesigned experience.
- **v1 — The beginning:** private job discovery, matching, tracking, exports, and application support.

---

## License

Klar’s source is visible so its behaviour and privacy model can be inspected, but it is **not open source**. Copying, modification, redistribution, and independent deployment are restricted. See [LICENSE](LICENSE).

---

*Klar means “clear” in German. Built by Kumar Arpit.*
