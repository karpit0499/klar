# Klar

## Your next move, made clear.

Klar brings your entire job search into one calm, private workspace. Discover live roles, understand where you fit, create stronger applications, and keep every opportunity moving—without losing yourself in tabs, spreadsheets, and scattered notes.

[**Open Klar →**](https://karpit0499.github.io/klar/) · [See what’s new in v2.2](CHANGELOG.md)

![Klar dashboard](docs/klar-dashboard.png)

---

## From searching to applying. All in one place.

### Find roles worth your time

Search live opportunities across Germany and nearby European markets. Klar brings together public job feeds and employer career pages, removes repeated listings, and helps you focus with filters for location, distance, recency, employment type, language, and more.

When a search returns nothing, Klar does not leave you guessing. It shows what happened, which sources responded, which filters removed results, and what you can try next.

### See the match. Understand the reason.

Klar reads your résumé and compares it with each role. Every match comes with a clear score breakdown, the strengths working in your favour, and the gaps worth considering.

Adjust what matters most to you. Save the promising roles. Hide the noise. Come back to a saved search and see what is genuinely new.

### Make every application feel considered

Turn one résumé into a focused application for each opportunity. Klar can help you:

- Tailor your résumé in English or German.
- Download clean, ATS-friendly DOCX and PDF files.
- See which important keywords are covered or missing.
- Draft a cover letter grounded in your real experience.
- Prepare interview questions, talking points, and honest ways to address gaps.
- Explore salary context and estimate German take-home pay.

Klar is designed to strengthen your story—not invent a new one. Generated material remains tied to the facts in your résumé and should always be reviewed before you send it.

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

## New in v2.2

### Safety you can see. Reliability you can feel.

Klar v2.2 strengthens the parts of a job-search workspace that should never be uncertain.

- **Complete workspace protection** — optional encryption now covers sensitive career content and saved connections, with safe locking and clear wrong-passphrase handling.
- **Backups you can trust** — choose a credential-free standard backup or a complete encrypted backup. Every restore is checked before your current workspace is changed.
- **Honest search results** — see source health, removed duplicates, filter effects, location limitations, and a useful next step when no roles remain.
- **Safer Adzuna connections** — credentials are treated as one pair, and Settings can test the connection with clearer feedback.
- **Smarter saved searches** — the first run starts clean, genuinely new or changed roles are recognised, and old history is kept under control.
- **Clearer recovery** — errors explain what happened, whether your data is safe, what still works, and what to do next.
- **A steadier experience** — long labels, small screens, mobile drawers, loading states, and bilingual layouts have been checked and tightened.

[Read the complete changelog →](CHANGELOG.md)

---

## Start in a few minutes

You need a current browser and your own [Groq API key](https://console.groq.com/). Adzuna credentials are optional and add more listings and salary information where available.

1. [Open Klar](https://karpit0499.github.io/klar/).
2. Choose your language and appearance.
3. Add your Groq key.
4. Upload a PDF or DOCX résumé and review your profile.
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

- **v2.2 — Stability & Safety:** stronger privacy boundaries, trustworthy backups, honest search diagnostics, safer connections, and resilient recovery.
- **v2.1 — Reliability:** bilingual résumé improvements, consistent state, responsive fixes, and safer updates.
- **v2 — The complete workspace:** multi-country discovery, application tools, localization, accessibility, salary insights, and a redesigned experience.
- **v1 — The beginning:** private job discovery, matching, tracking, exports, and application support.

---

## License

Klar’s source is visible so its behaviour and privacy model can be inspected, but it is **not open source**. Copying, modification, redistribution, and independent deployment are restricted. See [LICENSE](LICENSE).

---

*Klar means “clear” in German. Built by Kumar Arpit.*
