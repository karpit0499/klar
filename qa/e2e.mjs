import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/'
const errors = []
const results = {}
let careerContinuity
const browser = await chromium.launch()

async function hasOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth > root.clientWidth + 1
  })
}

async function smallButtons(page) {
  return page.locator('button:visible').evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const rect = button.getBoundingClientRect()
      return rect.width < 24 || rect.height < 24
        ? [{ name: button.getAttribute('aria-label') || button.textContent?.trim(), width: rect.width, height: rect.height }]
        : []
    }),
  )
}

async function unnamedFields(page) {
  return page.locator('input:visible, select:visible, textarea:visible').evaluateAll((fields) =>
    fields.flatMap((field) => {
      const id = field.getAttribute('id')
      const labelled =
        field.getAttribute('aria-label') ||
        field.getAttribute('aria-labelledby') ||
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        field.closest('label')
      return labelled ? [] : [field.outerHTML.slice(0, 160)]
    }),
  )
}

async function run(viewport, tag, contextOptions = {}) {
  const context = await browser.newContext({ viewport, ...contextOptions })
  const page = await context.newPage()
  let chatRequests = 0

  await page.route('**/chat/completions', async (route) => {
    chatRequests += 1
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Unexpected E2E chat request.' } }),
    })
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[${tag}] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[${tag}] pageerror: ${error.message}`))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByText('Find flexible work', { exact: false }).first().click()
  await page.locator('input[autocomplete="address-level2"]').first().fill('Berlin')
  await page.getByRole('button', { name: /Explore flexible work/i }).click()
  await page.getByRole('button', { name: /Search flexible work/i }).first().click()
  await page.getByText(/Search complete|returned no matching/i).waitFor({ timeout: 20_000 })

  const searchMain = await page.locator('main').innerText()
  const searchOverflow = await hasOverflow(page)
  const cards = await page.locator('ul[aria-label] li').count()
  const searchSmallButtons = await smallButtons(page)
  const searchUnnamedFields = await unnamedFields(page)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('heading', { name: 'AI budget', exact: true }).waitFor()
  const settingsMain = await page.locator('main').innerText()
  const settingsOverflow = await hasOverflow(page)

  results[tag] = {
    searchOverflow,
    settingsOverflow,
    cards,
    sourceStatus: /Source status/i.test(searchMain),
    openEntry: /Open application/i.test(searchMain),
    terminal: /Search complete|returned no matching/i.test(searchMain),
    budgetTokens: /estimated tokens available now/i.test(settingsMain),
    budgetRequests: /Requests this minute:/i.test(settingsMain),
    chatRequests,
    smallButtons: searchSmallButtons,
    unnamedFields: searchUnnamedFields,
  }

  await context.close()
}

async function seedCareerWorkspace(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByText('Find work your way.', { exact: true }).waitFor()
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('klar')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['resumes', 'preferences', 'settings'], 'readwrite')
    const now = '2026-07-28T00:00:00.000Z'
    transaction.objectStore('resumes').put({
      id: 'current',
      data: {
        schemaVersion: 2,
        contact: { name: 'QA Data Engineer', email: 'qa@example.test', links: [] },
        summary: 'Data engineer building Python, SQL and Docker platforms.',
        experience: [{
          id: 'qa-role',
          title: 'Data Engineer',
          company: 'QA Platform',
          start: '01/2022',
          end: '07/2026',
          bullets: [{
            id: 'qa-bullet',
            text: 'Built Python and SQL data pipelines in Docker.',
            evidenceRefs: [],
          }],
          evidenceRefs: [],
        }],
        education: [],
        skills: [{
          id: 'qa-skills',
          group: 'Data Engineering',
          items: ['Python', 'SQL', 'Docker'].map((name, index) => ({
            id: `qa-skill-${index}`,
            name,
            evidenceRefs: [],
          })),
        }],
        languages: [],
        projects: [],
        certifications: [],
        evidence: [],
        reviewedAt: now,
      },
      createdAt: now,
      updatedAt: now,
      revision: 1,
    })
    transaction.objectStore('preferences').put({
      id: 'current',
      targetTitles: ['Data Engineer'],
      fields: ['Data Engineering'],
      seniority: 'mid',
      salary: { min: 60_000, currency: 'EUR', period: 'year' },
      locations: [{ city: 'Berlin', radius_km: 50 }],
      remoteOnly: false,
      workAuth: {},
      languages: [],
      mustHaves: [],
      dealbreakers: [],
      discoveryMode: 'career',
    })
    transaction.objectStore('settings').put({ key: 'workspaceWorkModeV1', value: 'career' })
    transaction.objectStore('settings').put({ key: 'groqKey', value: 'qa-key' })
    transaction.objectStore('settings').put({ key: 'groqKeyRemember', value: true })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Search', exact: true }).waitFor()
}

function fixtureJobs() {
  const createdAt = Math.floor(new Date('2026-07-28T00:00:00.000Z').getTime() / 1_000)
  return Array.from({ length: 137 }, (_, index) => {
    const skillFocused = index % 2 === 0
    return {
      slug: `qa-career-${index}`,
      title: skillFocused ? 'Data Engineer' : 'Mid Data Engineer',
      company_name: `QA Company ${index}`,
      description: skillFocused
        ? '<p>Build Python and SQL pipelines in Docker for production analytics.</p>'
        : '<p>Build reporting products, operational workflows and customer data systems.</p>',
      remote: false,
      url: `https://example.test/qa-career-${index}`,
      tags: ['data'],
      job_types: ['full-time'],
      location: 'Berlin',
      created_at: createdAt,
    }
  })
}

async function runCareerContinuity() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let chatRequests = 0

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
      return
    }
    if (url.hostname === 'www.arbeitnow.com' && url.pathname === '/api/job-board-api') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: fixtureJobs(), links: { next: null } }),
      })
      return
    }
    if (url.pathname.endsWith('/chat/completions')) {
      chatRequests += 1
      const requestBody = route.request().postDataJSON()
      const prompt = requestBody.messages?.find((message) => message.role === 'user')?.content ?? ''
      const match = prompt.match(/JOBS TO SCORE:\n(\[[\s\S]*?\])\n\nFor EACH job/)
      const requested = match ? JSON.parse(match[1]) : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                results: requested.map((job) => ({
                  jobId: job.jobId,
                  fitScore: 91,
                  verdict: 'strong',
                  rationale: 'Explicit QA explanation.',
                  matchedSkills: ['Python', 'SQL'],
                  missingSkills: [],
                  salaryFit: 'in-range',
                  locationFit: 'exact',
                  seniorityFit: 'match',
                  redFlags: [],
                  factors: { skills: 95, salary: 80, location: 100, seniority: 90 },
                  confidence: 0.94,
                })),
              }),
            },
          }],
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    })
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[career-137] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[career-137] pageerror: ${error.message}`))

  await seedCareerWorkspace(page)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Search & match', exact: true }).click()
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')]
      .filter((button) => button.textContent?.trim() === 'Details').length === 137,
    undefined,
    { timeout: 30_000 },
  )

  let details = page.getByRole('button', { name: 'Details', exact: true })
  const initialCount = await details.count()
  const initialTopTitle = await page.locator('button h3').first().innerText()
  const initialTopCard = details.first().locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  const initialTopScore = Number((await initialTopCard.innerText()).match(/(\d+)\s*\/100/)?.[1])

  await page.locator('label').filter({ hasText: 'Skills' }).locator('input[type="range"]').fill('0')
  await page.locator('label').filter({ hasText: 'Salary' }).locator('input[type="range"]').fill('0')
  await page.locator('label').filter({ hasText: 'Location' }).locator('input[type="range"]').fill('0')
  await page.locator('label').filter({ hasText: 'Seniority' }).locator('input[type="range"]').fill('1')
  await page.waitForFunction(
    (title) => document.querySelector('button h3')?.textContent?.trim() !== title,
    initialTopTitle,
    { timeout: 5_000 },
  )

  details = page.getByRole('button', { name: 'Details', exact: true })
  const adjustedCount = await details.count()
  const adjustedTopTitle = await page.locator('button h3').first().innerText()
  const adjustedTopCard = details.first().locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  const adjustedTopScore = Number((await adjustedTopCard.innerText()).match(/(\d+)\s*\/100/)?.[1])

  const diagnostics = page.locator('details').filter({ hasText: 'Search diagnostics' })
  await diagnostics.locator('summary').click()
  const diagnosticsText = await diagnostics.innerText()

  const overflowCard = details.nth(99).locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  const overflowCompany = (await overflowCard.innerText()).match(/QA Company \d+/)?.[0]
  await details.nth(99).click()
  await page.getByRole('button', { name: 'Explain this job with AI', exact: true }).click()
  await page.getByText('AI-enriched explanation', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Search & match', exact: true }).click()
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')]
      .filter((button) => button.textContent?.trim() === 'Details').length === 137,
    undefined,
    { timeout: 30_000 },
  )
  const cachedCard = page.getByText(overflowCompany, { exact: false }).first().locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  await cachedCard.getByRole('button', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Explain this job with AI', exact: true }).click()
  await page.getByText('AI-enriched explanation', { exact: true }).waitFor()

  careerContinuity = {
    initialCount,
    adjustedCount,
    initialTopTitle,
    adjustedTopTitle,
    initialTopScore,
    adjustedTopScore,
    diagnosticsCandidate137: /Candidates selected\s+137/.test(diagnosticsText),
    diagnosticsOutside97: /Relevant jobs outside the AI priority set\s+97/.test(diagnosticsText),
    diagnosticsLocal137: /Local relevance scores used\s+137/.test(diagnosticsText),
    chatRequests,
    overflowCompany,
  }
  await context.close()
}

await run({ width: 1280, height: 900 }, 'desktop')
await run({ width: 375, height: 812 }, 'mobile-375')
await run({ width: 320, height: 568 }, 'mobile-320')
await run(
  { width: 640, height: 450 },
  'desktop-200-percent-effective',
  { deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' },
)
await runCareerContinuity()
await browser.close()

console.log(JSON.stringify({ results, careerContinuity, errors }, null, 2))

const failed = Object.values(results).some((result) =>
  result.searchOverflow ||
  result.settingsOverflow ||
  result.cards === 0 ||
  !result.sourceStatus ||
  !result.openEntry ||
  !result.terminal ||
  !result.budgetTokens ||
  !result.budgetRequests ||
  result.chatRequests !== 0 ||
  result.smallButtons.length > 0 ||
  result.unnamedFields.length > 0,
)
const careerFailed =
  !careerContinuity ||
  careerContinuity.initialCount !== 137 ||
  careerContinuity.adjustedCount !== 137 ||
  careerContinuity.initialTopTitle === careerContinuity.adjustedTopTitle ||
  careerContinuity.initialTopScore === careerContinuity.adjustedTopScore ||
  !careerContinuity.diagnosticsCandidate137 ||
  !careerContinuity.diagnosticsOutside97 ||
  !careerContinuity.diagnosticsLocal137 ||
  careerContinuity.chatRequests !== 1 ||
  !careerContinuity.overflowCompany
if (errors.length || failed || careerFailed) process.exit(1)