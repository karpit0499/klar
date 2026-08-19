import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/'
const errors = []
const results = {}
let careerContinuity
let issueReporting
let resumeDesignLab
let applicationPacket
let trackedRescore
let resumeNavigation
let searchCancellation
const browser = await chromium.launch()

const EXPECTED_DOCUMENT_CHECK_IDS = [
  'provenance',
  'required_fields',
  'blank_paragraphs',
  'placeholders',
  'unicode',
  'prompt_fragments',
  'body_greeting',
  'body_signoff',
  'body_header',
  'page_length',
]
const EXPECTED_MESSAGE_CHECK_IDS = [
  'greeting',
  'role_company',
  'discovery_context',
  'candidate_evidence',
  'human_ask',
  'sign_off',
  'application_state',
  'unsupported_claims',
  'length',
  'prompt_fragments',
]

async function namedCheckResults(section, label) {
  const entries = await section.locator(
    `[aria-label="${label}"] [data-check-id]`,
  ).evaluateAll((nodes) => nodes.map((node) => [
    node.dataset.checkId,
    node.dataset.checkOk === 'true',
  ]))
  return Object.fromEntries(entries)
}

function expectedChecksPass(actual, expectedIds) {
  return expectedIds.every((id) => actual?.[id] === true)
}

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

  // Keep the general viewport suite deterministic. Local build assets continue
  // normally; every external connector is handled in-memory so a stale public
  // endpoint cannot create hundreds of console 404s or change the assertion
  // result. Scenarios that need real response shapes install their own routes.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
      return
    }
    if (url.pathname.endsWith('/chat/completions')) {
      chatRequests += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Unexpected E2E chat request.' } }),
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
    officialRoute: /Official route/i.test(searchMain),
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
  const chatRequestsAfterInitialSearch = chatRequests

  let details = page.getByRole('button', { name: 'Details', exact: true })
  const initialCount = await details.count()
  const initialTopTitle = await page.locator('button h3').first().innerText()
  const initialTopCard = details.first().locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  const initialTopScore = Number((await initialTopCard.innerText()).match(/(\d+)\s*\/100/)?.[1])

  const diagnostics = page.locator('details').filter({ hasText: 'Search diagnostics' })
  await diagnostics.locator('summary').click()
  const diagnosticsText = await diagnostics.innerText()

  // A source-report action must carry only the source id into Settings, open
  // the privacy-reviewed form, and leave this complete result set mounted.
  await diagnostics.getByRole('button', { name: 'Report source', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Submit a bug or issue', exact: true }).waitFor()
  const sourcePrefillCategory = await page.locator('#issue-category').inputValue()
  const sourcePrefillTitle = await page.locator('#issue-title').inputValue()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  details = page.getByRole('button', { name: 'Details', exact: true })
  const afterSourceReportCount = await details.count()

  // v2.6 makes the complete deterministic ranking snapshot authoritative.
  // Navigating through the semantic wordmark must hide, not discard, the live
  // career search and all 137 ranked results.
  await page.getByRole('button', { name: 'Klar — Dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  details = page.getByRole('button', { name: 'Details', exact: true })
  const afterWordmarkCount = await details.count()
  const afterWordmarkTopTitle = await page.locator('button h3').first().innerText()
  const afterWordmarkTopCard = details.first().locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  const afterWordmarkTopScore = Number((await afterWordmarkTopCard.innerText()).match(/(\d+)\s*\/100/)?.[1])

  // A hidden, still-mounted search must suspend modal side effects. Force the
  // same tab transition an app event can trigger while a drawer is open, then
  // prove scroll locking is released and restored with the visible surface.
  await details.first().click()
  await page.getByRole('dialog').first().waitFor()
  const bodyLockedWithDrawer = await page.evaluate(() =>
    document.body.style.position === 'fixed' && document.body.style.overflow === 'hidden')
  await page.evaluate(() => {
    const wordmark = document.querySelector('[aria-label="Klar — Dashboard"]')
    if (!(wordmark instanceof HTMLButtonElement)) throw new Error('Wordmark button not found')
    wordmark.click()
  })
  await page.waitForFunction(() =>
    document.querySelector('[aria-current="page"]')?.textContent?.trim() === 'Dashboard')
  const bodyUnlockedWhenSearchHidden = await page.evaluate(() =>
    document.body.style.position !== 'fixed' && document.body.style.overflow !== 'hidden')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('[aria-current="page"]')?.textContent?.trim() === 'Search')
  await page.getByRole('dialog').first().waitFor()
  const bodyRelockedWhenDrawerVisible = await page.evaluate(() =>
    document.body.style.position === 'fixed' && document.body.style.overflow === 'hidden')
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  const overflowCard = details.nth(99).locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]',
  )
  const overflowCompany = (await overflowCard.innerText()).match(/QA Company \d+/)?.[0]
  await details.nth(99).click()
  await page.getByRole('button', { name: 'Explain this job with AI', exact: true }).click()
  await page.getByRole('heading', { name: 'AI opinion', exact: true }).waitFor()
  const chatRequestsAfterFirstExplain = chatRequests
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
  await page.getByRole('heading', { name: 'AI opinion', exact: true }).waitFor()
  const chatRequestsAfterCachedExplain = chatRequests

  careerContinuity = {
    initialCount,
    afterSourceReportCount,
    afterWordmarkCount,
    initialTopTitle,
    afterWordmarkTopTitle,
    initialTopScore,
    afterWordmarkTopScore,
    diagnosticsCandidate137: /Candidates selected\s+137/.test(diagnosticsText),
    diagnosticsOutside97: /Relevant jobs outside the AI priority set\s+97/.test(diagnosticsText),
    diagnosticsLocal137: /Local relevance scores used\s+137/.test(diagnosticsText),
    sourcePrefillCategory,
    sourcePrefillTitle,
    chatRequests,
    chatRequestsAfterInitialSearch,
    chatRequestsAfterFirstExplain,
    chatRequestsAfterCachedExplain,
    overflowCompany,
    bodyLockedWithDrawer,
    bodyUnlockedWhenSearchHidden,
    bodyRelockedWhenDrawerVisible,
  }
  await context.close()
}

async function runIssueReporting() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(() => {
    window.__klarOpenedUrls = []
    window.open = (url) => {
      window.__klarOpenedUrls.push(String(url ?? ''))
      return null
    }
  })
  const page = await context.newPage()
  const githubRequests = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'github.com') githubRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[issue-reporting] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[issue-reporting] pageerror: ${error.message}`))

  await seedCareerWorkspace(page)
  await page.getByRole('button', { name: 'Open support', exact: true }).click()
  await page.getByRole('heading', { name: 'Submit a bug or issue', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Prepare report', exact: true }).click()

  await page.getByLabel('Concise title').fill('Login output exposed qa.person@example.test')
  await page.getByLabel('What happened?').fill(
    'The response included gsk_abcdefghijklmnop for qa.person@example.test at ' +
    '/Users/alice/private/resume.docx and https://example.test/search?token=secret#private.',
  )
  await page.getByLabel('Steps to reproduce').fill('Open the result from /home/alice/klar and inspect it.')
  await page.getByLabel('Expected result').fill('No secret or qa.person@example.test should be visible.')
  await page.getByLabel(/Include a minimal diagnostic summary/).check()
  await page.getByRole('button', { name: 'Review privacy preview', exact: true }).click()

  const publicPreview = page.locator('section[aria-labelledby="issue-preview-heading"]')
  await publicPreview.waitFor()
  const publicPreviewText = await publicPreview.innerText()
  const publicOpen = publicPreview.getByRole('button', { name: 'Open issue in GitHub', exact: true })
  const attemptsBeforeReview = await page.evaluate(() => window.__klarOpenedUrls.length)
  const publicInitiallyDisabled = await publicOpen.isDisabled()
  await publicPreview.getByLabel(/I reviewed all of the text/).check()
  await publicOpen.click()
  const openedAfterPublic = await page.evaluate(() => [...window.__klarOpenedUrls])

  await publicPreview.getByRole('button', { name: 'Continue editing', exact: true }).click()
  await page.locator('#issue-category').selectOption('privacy_security')
  const privateNotice = await page.getByText(
    'This category opens GitHub private vulnerability reporting, not a public issue.',
    { exact: true },
  ).isVisible()
  await page.getByRole('button', { name: 'Review privacy preview', exact: true }).click()
  const privatePreview = page.locator('section[aria-labelledby="issue-preview-heading"]')
  await privatePreview.waitFor()
  const privateOpen = privatePreview.getByRole('button', {
    name: 'Open private report in GitHub',
    exact: true,
  })
  const attemptsBeforePrivateReview = await page.evaluate(() => window.__klarOpenedUrls.length)
  const privateInitiallyDisabled = await privateOpen.isDisabled()
  await privatePreview.getByLabel(/I reviewed all of the text/).check()
  await privateOpen.click()
  const openedAfterPrivate = await page.evaluate(() => [...window.__klarOpenedUrls])

  issueReporting = {
    redactedSecret: publicPreviewText.includes('[secret redacted]'),
    redactedEmail: publicPreviewText.includes('[email redacted]'),
    redactedPath: publicPreviewText.includes('[local path redacted]'),
    strippedUrlQuery:
      publicPreviewText.includes('https://example.test/search') &&
      !publicPreviewText.includes('token=secret') &&
      !publicPreviewText.includes('#private'),
    rawValuesAbsent:
      !publicPreviewText.includes('gsk_abcdefghijklmnop') &&
      !publicPreviewText.includes('qa.person@example.test') &&
      !publicPreviewText.includes('/Users/alice') &&
      !publicPreviewText.includes('/home/alice'),
    diagnosticsMinimal:
      /Redacted diagnostics/.test(publicPreviewText) &&
      /Klar: 2\.6\.1/.test(publicPreviewText) &&
      !/Groq|API key|r(?:esume|\u00e9sum\u00e9) body/i.test(publicPreviewText),
    attemptsBeforeReview,
    publicInitiallyDisabled,
    openedAfterPublic,
    privateNotice,
    attemptsBeforePrivateReview,
    privateInitiallyDisabled,
    openedAfterPrivate,
    githubRequests,
  }
  await context.close()
}

async function runResumeDesignLab() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  // Seeding the career workspace mounts Search once. Keep those background
  // connectors deterministic even though this scenario only exercises Resume.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
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
      errors.push(`[resume-design-lab] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[resume-design-lab] pageerror: ${error.message}`))

  await seedCareerWorkspace(page)
  await page.getByRole('button', { name: 'Open Resume', exact: true }).click()
  await page.getByRole('heading', { name: 'Resume', exact: true }).waitFor()
  const hiddenByDefault = await page.getByRole('heading', {
    name: 'Internal resume design lab',
    exact: true,
  }).count() === 0
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('heading', { name: 'Release features', exact: true }).waitFor()

  const labFlag = page.getByLabel('Show the internal resume design evaluation lab', { exact: true })
  // This controlled checkbox updates after its IndexedDB write resolves, so a
  // plain click plus an explicit state wait mirrors what the user observes.
  await labFlag.click()
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('label')].some((label) =>
      label.textContent?.trim() === 'Show the internal resume design evaluation lab' &&
      label.querySelector('input')?.checked)
  })

  await page.getByRole('button', { name: 'Klar — Dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Open Resume', exact: true }).click()

  const labHeading = page.getByRole('heading', { name: 'Internal resume design lab', exact: true })
  await labHeading.waitFor()
  await page.getByRole('button', { name: 'Create ATS parse preview', exact: true }).click()
  const preview = page.locator('section[aria-labelledby="resume-lab-preview-heading"]')
  try {
    await preview.waitFor({ timeout: 20_000 })
  } catch (error) {
    console.error(JSON.stringify({ designLabErrors: errors, main: await page.locator('main').innerText() }, null, 2))
    throw error
  }
  const previewText = await preview.innerText()
  const checkLabels = await preview.locator('span').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? '').filter((text) => /^[✓×]/.test(text)),
  )

  const eligibleOption = page.locator('#resume-lab-default-status option[value="eligible_for_v28"]')
  const eligibleInitiallyDisabled = await eligibleOption.evaluate((option) => option.disabled)
  const prerequisites = page.locator('fieldset').filter({ hasText: 'Study prerequisites' })
  const prerequisiteInputs = prerequisites.locator('input[type="checkbox"]')
  const prerequisiteCount = await prerequisiteInputs.count()
  for (let index = 0; index < prerequisiteCount; index += 1) {
    await prerequisiteInputs.nth(index).check()
  }
  const eligibleDisabledAfterPrerequisites = await eligibleOption.evaluate(
    (option) => option.disabled,
  )

  await page.locator('#resume-lab-decision').selectOption('sample_a_base')
  const eligibleDisabledWithoutSelectedVariant = await eligibleOption.evaluate(
    (option) => option.disabled,
  )
  const variants = page.locator('fieldset').filter({ hasText: 'Allowed variants' })
  await variants.getByLabel('Data & analytics', { exact: true }).check()
  const eligibleAfterCoherentSelection = await eligibleOption.evaluate(
    (option) => !option.disabled,
  )
  await page.locator('#resume-lab-default-status').selectOption('eligible_for_v28')
  await page.locator('#resume-lab-note').fill('QA owner decision after all blinded study gates passed.')
  await page.getByRole('button', { name: 'Save decision locally', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Decision saved locally.' }).waitFor()

  await page.reload({ waitUntil: 'networkidle' })
  await labHeading.waitFor()
  const reloadedPrerequisites = page.locator('fieldset').filter({ hasText: 'Study prerequisites' })
    .locator('input[type="checkbox"]')
  const reloadedPrerequisiteStates = await reloadedPrerequisites.evaluateAll((inputs) =>
    inputs.map((input) => input.checked),
  )
  const decisionPersisted = await page.locator('#resume-lab-decision').inputValue()
  const defaultStatusPersisted = await page.locator('#resume-lab-default-status').inputValue()
  const notePersisted = await page.locator('#resume-lab-note').inputValue()
  const allowedVariantPersisted = await page.locator('fieldset')
    .filter({ hasText: 'Allowed variants' })
    .getByLabel('Data & analytics', { exact: true })
    .isChecked()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const persistedFlag = page.getByLabel(
    'Show the internal resume design evaluation lab',
    { exact: true },
  )
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('label')].some((label) =>
      label.textContent?.trim() === 'Show the internal resume design evaluation lab' &&
      label.querySelector('input')?.checked)
  })
  const flagPersisted = await persistedFlag.isChecked()

  resumeDesignLab = {
    hiddenByDefault,
    flagPersisted,
    previewCheckCount: checkLabels.length,
    previewChecksPass: checkLabels.length > 0 && checkLabels.every((text) => text.startsWith('✓')),
    previewUsesSeededResume:
      previewText.includes('QA Data Engineer') && previewText.includes('QA Platform'),
    previewHasReadingOrder: /Sections:\s+.+→/.test(previewText),
    previewHasRoleAssociation: /Role\/date associations:\s+QA Platform/.test(previewText),
    eligibleInitiallyDisabled,
    prerequisiteCount,
    eligibleDisabledAfterPrerequisites,
    eligibleDisabledWithoutSelectedVariant,
    eligibleAfterCoherentSelection,
    decisionPersisted,
    defaultStatusPersisted,
    notePersisted,
    prerequisitesPersisted: reloadedPrerequisiteStates.every(Boolean),
    allowedVariantPersisted,
  }
  await context.close()
}

async function waitForSavedPacket(page, expectedNote) {
  await page.waitForFunction(async (note) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('klar')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const rows = await new Promise((resolve, reject) => {
        const request = database.transaction('packets', 'readonly').objectStore('packets').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return rows.some((row) => {
        const state = row.languages?.en
        return row.notes === note &&
          state?.letterDetails?.recipientName === 'Morgan Recruiter' &&
          state?.letterDetails?.place === 'Berlin' &&
          state?.messageApplicationState === 'referred' &&
          state?.messageReferralName === 'Taylor Referrer' &&
          Boolean(state?.letter) && Boolean(state?.shortMessage)
      })
    } finally {
      database.close()
    }
  }, expectedNote, { timeout: 20_000 })
}

async function runApplicationPacket() {
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
        body: JSON.stringify({ data: fixtureJobs().slice(0, 1), links: { next: null } }),
      })
      return
    }
    if (url.pathname.endsWith('/chat/completions')) {
      chatRequests += 1
      const body = route.request().postDataJSON()
      const system = body.messages?.find((message) => message.role === 'system')?.content ?? ''
      const content = system.includes('recruiter outreach')
        ? [
            'Dear Morgan Recruiter,',
            '',
            'After finding the role through The Klar career search, Taylor Referrer referred me to the Data Engineer role at QA Company 0. At QA Platform, I built Python and SQL data pipelines in Docker. I would value a short conversation about the role, and I would be grateful if you could take a look.',
            '',
            'Kind regards,',
            'QA Data Engineer',
          ].join('\n')
        : [
            'I am writing regarding the Data Engineer role at QA Company 0. My work at QA Platform directly connects with the role’s focus on dependable data systems.',
            '',
            'I built Python and SQL data pipelines in Docker for production analytics. That experience gives me a grounded basis for contributing to the work described in the posting.',
            '',
            'I would welcome the opportunity to discuss how this experience could support the team.',
          ].join('\n')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content }, finish_reason: 'stop' }],
          usage: { total_tokens: 321 },
        }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[application-packet] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[application-packet] pageerror: ${error.message}`))

  await seedCareerWorkspace(page)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Search & match', exact: true }).click()
  await page.getByRole('button', { name: 'Details', exact: true }).waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Build application packet', exact: true }).click()

  let packetDialog = page.getByRole('dialog', { name: 'Application packet', exact: true })
  await packetDialog.waitFor()
  await packetDialog.getByRole('button', { name: 'Tailor without AI', exact: true }).click()
  await packetDialog.getByRole('heading', { name: /Tailored resume · EN/ }).waitFor()
  const packetDownload = packetDialog.getByRole('button', { name: 'Download packet (.zip)', exact: true })
  const exportBlockedBeforeLetter = await packetDownload.isDisabled()

  const letterSection = packetDialog.locator('section[aria-labelledby="bundle-letter"]')
  await letterSection.getByRole('radio', { name: 'Formal', exact: true }).click()
  await letterSection.locator('#bundle-letter-recipient').fill('Morgan Recruiter')
  await letterSection.locator('#bundle-letter-place').fill('Berlin')
  await letterSection.locator('#bundle-letter-address').fill('Example Street 7\n10115 Berlin')
  await letterSection.locator('#bundle-letter-date').fill('2026-08-15')
  await letterSection.getByRole('button', { name: 'Draft', exact: true }).click()
  await letterSection.locator('#bundle-letter-text').waitFor({ timeout: 20_000 })
  const documentChecks = await namedCheckResults(letterSection, 'Document checks')
  const exportReadyAfterLetter = !(await packetDownload.isDisabled())

  const messageSection = packetDialog.locator('section[aria-labelledby="bundle-message"]')
  await messageSection.getByRole('radio', { name: 'Formal', exact: true }).click()
  await messageSection.locator('#bundle-message-state').selectOption('referred')
  await messageSection.locator('#bundle-message-channel').selectOption('email')
  await messageSection.locator('#bundle-message-recruiter').fill('Morgan Recruiter')
  await messageSection.locator('#bundle-message-discovery').fill('The Klar career search')
  const messageDraft = messageSection.getByRole('button', { name: 'Draft short message', exact: true })
  const referralWarningMessage = messageSection.getByText(
    'Enter the referrer or introducer name so Klar cannot invent the connection.',
    { exact: true },
  )
  await referralWarningMessage.waitFor()
  await page.waitForFunction(() => {
    const section = document.querySelector('section[aria-labelledby="bundle-message"]')
    return [...(section?.querySelectorAll('button') ?? [])].some((button) =>
      button.textContent?.trim() === 'Draft short message' && button.disabled)
  })
  const referralGateBlocksDraft = await messageDraft.isDisabled()
  const referralWarning = await referralWarningMessage.isVisible()
  await messageSection.locator('#bundle-message-referrer').fill('Taylor Referrer')
  await page.waitForFunction(() => {
    const section = document.querySelector('section[aria-labelledby="bundle-message"]')
    return [...(section?.querySelectorAll('button') ?? [])].some((button) =>
      button.textContent?.trim() === 'Draft short message' && !button.disabled)
  })
  const referralGateClears = !(await messageDraft.isDisabled())
  await messageDraft.click()
  await messageSection.locator('#bundle-message-text').waitFor({ timeout: 20_000 })
  const messageChecks = await namedCheckResults(messageSection, 'Message checks')

  const note = 'Ask about the platform team and confirm the interview timezone.'
  await packetDialog.locator('#bundle-notes-text').fill(note)
  await waitForSavedPacket(page, note)
  await packetDialog.getByRole('button', { name: 'Close', exact: true }).click()
  await packetDialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Build application packet', exact: true }).click()
  packetDialog = page.getByRole('dialog', { name: 'Application packet', exact: true })
  await packetDialog.waitFor()

  const reopenedLetter = packetDialog.locator('section[aria-labelledby="bundle-letter"]')
  const reopenedMessage = packetDialog.locator('section[aria-labelledby="bundle-message"]')
  applicationPacket = {
    exportBlockedBeforeLetter,
    documentChecks,
    documentChecksPass: expectedChecksPass(
      documentChecks,
      EXPECTED_DOCUMENT_CHECK_IDS,
    ),
    exportReadyAfterLetter,
    referralGateBlocksDraft,
    referralWarning,
    referralGateClears,
    messageChecks,
    messageChecksPass: expectedChecksPass(
      messageChecks,
      EXPECTED_MESSAGE_CHECK_IDS,
    ),
    chatRequests,
    recipientPersisted: await reopenedLetter.locator('#bundle-letter-recipient').inputValue(),
    placePersisted: await reopenedLetter.locator('#bundle-letter-place').inputValue(),
    addressPersisted: await reopenedLetter.locator('#bundle-letter-address').inputValue(),
    datePersisted: await reopenedLetter.locator('#bundle-letter-date').inputValue(),
    letterTonePersisted: await reopenedLetter.getByRole('radio', { name: 'Formal', exact: true }).getAttribute('aria-checked'),
    applicationStatePersisted: await reopenedMessage.locator('#bundle-message-state').inputValue(),
    channelPersisted: await reopenedMessage.locator('#bundle-message-channel').inputValue(),
    referrerPersisted: await reopenedMessage.locator('#bundle-message-referrer').inputValue(),
    messageStylePersisted: await reopenedMessage.getByRole('radio', { name: 'Formal', exact: true }).getAttribute('aria-checked'),
    notePersisted: await packetDialog.locator('#bundle-notes-text').inputValue(),
    letterPersisted: (await reopenedLetter.locator('#bundle-letter-text').inputValue()).includes('QA Platform'),
    messagePersisted: (await reopenedMessage.locator('#bundle-message-text').inputValue()).includes('Taylor Referrer'),
    exportStillReady: !(await packetDialog.getByRole('button', {
      name: 'Download packet (.zip)',
      exact: true,
    }).isDisabled()),
  }
  await context.close()
}

async function runTrackedRescore() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[tracked-rescore] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[tracked-rescore] pageerror: ${error.message}`))

  await seedCareerWorkspace(page)
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('klar')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('tracked', 'readwrite')
    transaction.objectStore('tracked').put({
      jobId: 'qa-historical-job',
      job: {
        id: 'qa-historical-job',
        source: 'greenhouse',
        source_id: 'qa-historical-job',
        title: 'Historical Data Analyst',
        company: 'QA History GmbH',
        location: { city: 'Berlin', country: 'DE', remote: false },
        description: 'SQL is required. Python and Docker are preferred.',
        url: 'https://example.test/qa-historical-job',
        salary: {},
        tags: ['SQL', 'Python', 'Docker'],
        fetched_at: '2026-07-28T00:00:00.000Z',
      },
      match: {
        jobId: 'qa-historical-job',
        fitScore: 42,
        verdict: 'stretch',
        rationale: 'Historical score.',
        matchedSkills: [],
        missingSkills: [],
        redFlags: [],
        scoredAt: '2025-01-01T00:00:00.000Z',
        modelVersion: 'local-v2.5.5',
      },
      status: 'interested',
      notes: '',
      reminders: [],
      contacts: [],
      history: [{ status: 'interested', at: '2025-01-01T00:00:00.000Z' }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Tracker', exact: true }).click()
  await page.getByText('Historical Data Analyst', { exact: true }).click()
  const rescoreButton = page.getByRole('button', {
    name: 'Rescore with current profile',
    exact: true,
  })
  await rescoreButton.waitFor()
  const historicalLabelVisible = await page.getByText(
    'historical:local-v2.5.5 · historical, unchanged',
    { exact: true },
  ).isVisible()
  const rescoreEnabled = !(await rescoreButton.isDisabled())
  await rescoreButton.click()
  await page.getByText('ranking-v2.6.1 · reproducibly stored', { exact: true }).waitFor()
  const stored = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('klar')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('tracked', 'readonly')
          .objectStore('tracked')
          .get('qa-historical-job')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  })
  trackedRescore = {
    historicalLabelVisible,
    rescoreEnabled,
    storedVersion: stored?.match?.ranking?.rankingVersion,
    storedHistorical: stored?.match?.ranking?.historical,
    storedInputHash: stored?.match?.ranking?.inputHash,
  }
  await context.close()
}

async function runResumeNavigation() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[resume-navigation] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[resume-navigation] pageerror: ${error.message}`))

  await seedCareerWorkspace(page)
  await page.getByRole('button', { name: 'Open Resume', exact: true }).click()
  const resumeHeading = page.getByRole('heading', { name: 'Resume', exact: true })
  await resumeHeading.waitFor()
  const deepLink = new URL(page.url()).hash

  const nameField = page.getByLabel('Name', { exact: true }).first()
  await nameField.fill('Unsaved QA Name')
  await page.getByText('Unsaved changes', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()

  const dialog = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  await dialog.waitFor()
  const guardedHash = new URL(page.url()).hash
  const initialDialogFocus = await page.evaluate(() => document.activeElement?.textContent?.trim())
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  const draftAfterCancel = await nameField.inputValue()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await dialog.getByRole('button', { name: 'Discard and leave', exact: true }).click()
  const settingsHeading = page.getByRole('heading', { name: 'Settings & data', exact: true })
  await settingsHeading.waitFor()
  await page.waitForFunction(() => document.activeElement?.textContent?.includes('Settings & data'))
  const requestedHash = new URL(page.url()).hash
  const requestedFocus = await page.evaluate(() => document.activeElement?.textContent?.trim())

  await page.evaluate(() => history.back())
  await resumeHeading.waitFor()
  const storedNameAfterDiscard = await page.getByLabel('Name', { exact: true }).first().inputValue()

  await page.getByLabel('Name', { exact: true }).first().fill('Second unsaved name')
  await page.evaluate(() => history.back())
  await dialog.waitFor()
  const historyGuardedHash = new URL(page.url()).hash
  await dialog.getByRole('button', { name: 'Discard and leave', exact: true }).click()
  await page.waitForFunction(() => window.location.hash === '#/dashboard')
  const confirmedHistoryHash = new URL(page.url()).hash

  await page.goto(`${BASE}#/support`, { waitUntil: 'networkidle' })
  const supportHeading = page.getByRole('heading', { name: 'Help & feedback', exact: true })
  await supportHeading.waitFor()
  await page.waitForFunction(() => document.activeElement?.textContent?.includes('Help & feedback'))
  const supportFocus = await page.evaluate(() => document.activeElement?.textContent?.trim())

  resumeNavigation = {
    deepLink,
    guardedHash,
    initialDialogFocus,
    draftAfterCancel,
    requestedHash,
    requestedFocus,
    storedNameAfterDiscard,
    historyGuardedHash,
    confirmedHistoryHash,
    supportHash: new URL(page.url()).hash,
    supportFocus,
  }
  await context.close()
}

async function runSearchCancellation() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let arbeitnowCalls = 0
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`[search-cancellation] ${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`[search-cancellation] pageerror: ${error.message}`))
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
      return
    }
    if (url.hostname === 'www.arbeitnow.com' && url.pathname === '/api/job-board-api') {
      arbeitnowCalls += 1
      const generation = arbeitnowCalls
      if (generation === 1) {
        await new Promise((resolve) => setTimeout(resolve, 750))
      }
      const fixture = {
        ...fixtureJobs()[0],
        slug: generation === 1 ? 'cancelled-generation' : 'current-generation',
        title: generation === 1 ? 'Cancelled Generation Data Engineer' : 'Current Generation Data Engineer',
        company_name: generation === 1 ? 'Stale Company' : 'Current Company',
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [fixture], links: { next: null } }),
      }).catch(() => undefined)
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await seedCareerWorkspace(page)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Search & match', exact: true }).click()
  const cancel = page.getByRole('button', { name: 'Cancel search', exact: true })
  await cancel.waitFor()
  await cancel.click()
  const cancelledNotice = await page.getByText(
    'Search cancelled. Any partial results shown below were kept.',
    { exact: true },
  ).isVisible()

  await page.getByRole('button', { name: 'Search & match', exact: true }).click()
  await page.getByText('Current Generation Data Engineer', { exact: true }).waitFor({ timeout: 30_000 })
  await new Promise((resolve) => setTimeout(resolve, 900))
  searchCancellation = {
    cancelledNotice,
    arbeitnowCalls,
    currentCount: await page.getByText('Current Generation Data Engineer', { exact: true }).count(),
    staleCount: await page.getByText('Cancelled Generation Data Engineer', { exact: true }).count(),
    finalHash: new URL(page.url()).hash,
  }
  await context.close()
}

await run({ width: 1280, height: 900 }, 'desktop')
await run({ width: 375, height: 812 }, 'mobile-375')
await run({ width: 320, height: 568 }, 'mobile-320')
await run(
  { width: 640, height: 450 },
  'desktop-high-density-dark-reduced-motion',
  { deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' },
)
await runCareerContinuity()
await runIssueReporting()
await runResumeDesignLab()
await runApplicationPacket()
await runTrackedRescore()
await runResumeNavigation()
await runSearchCancellation()
await browser.close()

console.log(JSON.stringify({
  results,
  careerContinuity,
  issueReporting,
  resumeDesignLab,
  applicationPacket,
  trackedRescore,
  resumeNavigation,
  searchCancellation,
  errors,
}, null, 2))

const failed = Object.values(results).some((result) =>
  result.searchOverflow ||
  result.settingsOverflow ||
  result.cards === 0 ||
  !result.sourceStatus ||
  !result.officialRoute ||
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
  careerContinuity.afterSourceReportCount !== 137 ||
  careerContinuity.afterWordmarkCount !== 137 ||
  careerContinuity.initialTopTitle !== careerContinuity.afterWordmarkTopTitle ||
  careerContinuity.initialTopScore !== careerContinuity.afterWordmarkTopScore ||
  !careerContinuity.diagnosticsCandidate137 ||
  !careerContinuity.diagnosticsOutside97 ||
  !careerContinuity.diagnosticsLocal137 ||
  !careerContinuity.bodyLockedWithDrawer ||
  !careerContinuity.bodyUnlockedWhenSearchHidden ||
  !careerContinuity.bodyRelockedWhenDrawerVisible ||
  careerContinuity.sourcePrefillCategory !== 'source_problem' ||
  !/^Source problem: [a-z0-9_-]+$/i.test(careerContinuity.sourcePrefillTitle) ||
  careerContinuity.chatRequests !== 1 ||
  careerContinuity.chatRequestsAfterInitialSearch !== 0 ||
  careerContinuity.chatRequestsAfterFirstExplain !== 1 ||
  careerContinuity.chatRequestsAfterCachedExplain !== 1 ||
  !careerContinuity.overflowCompany
const issueFailed =
  !issueReporting ||
  !issueReporting.redactedSecret ||
  !issueReporting.redactedEmail ||
  !issueReporting.redactedPath ||
  !issueReporting.strippedUrlQuery ||
  !issueReporting.rawValuesAbsent ||
  !issueReporting.diagnosticsMinimal ||
  issueReporting.attemptsBeforeReview !== 0 ||
  !issueReporting.publicInitiallyDisabled ||
  issueReporting.openedAfterPublic.length !== 1 ||
  !issueReporting.openedAfterPublic[0].startsWith('https://github.com/karpit0499/klar/issues/new?') ||
  !issueReporting.privateNotice ||
  issueReporting.attemptsBeforePrivateReview !== 1 ||
  !issueReporting.privateInitiallyDisabled ||
  issueReporting.openedAfterPrivate.length !== 2 ||
  issueReporting.openedAfterPrivate[1] !== 'https://github.com/karpit0499/klar/security/advisories/new' ||
  issueReporting.githubRequests.length !== 0
const labFailed =
  !resumeDesignLab ||
  !resumeDesignLab.hiddenByDefault ||
  !resumeDesignLab.flagPersisted ||
  resumeDesignLab.previewCheckCount < 5 ||
  !resumeDesignLab.previewChecksPass ||
  !resumeDesignLab.previewUsesSeededResume ||
  !resumeDesignLab.previewHasReadingOrder ||
  !resumeDesignLab.previewHasRoleAssociation ||
  !resumeDesignLab.eligibleInitiallyDisabled ||
  resumeDesignLab.prerequisiteCount !== 5 ||
  !resumeDesignLab.eligibleDisabledAfterPrerequisites ||
  !resumeDesignLab.eligibleDisabledWithoutSelectedVariant ||
  !resumeDesignLab.eligibleAfterCoherentSelection ||
  resumeDesignLab.decisionPersisted !== 'sample_a_base' ||
  resumeDesignLab.defaultStatusPersisted !== 'eligible_for_v28' ||
  resumeDesignLab.notePersisted !== 'QA owner decision after all blinded study gates passed.' ||
  !resumeDesignLab.prerequisitesPersisted ||
  !resumeDesignLab.allowedVariantPersisted
const packetFailed =
  !applicationPacket ||
  !applicationPacket.exportBlockedBeforeLetter ||
  !applicationPacket.documentChecksPass ||
  !applicationPacket.exportReadyAfterLetter ||
  !applicationPacket.referralGateBlocksDraft ||
  !applicationPacket.referralWarning ||
  !applicationPacket.referralGateClears ||
  !applicationPacket.messageChecksPass ||
  applicationPacket.chatRequests !== 2 ||
  applicationPacket.recipientPersisted !== 'Morgan Recruiter' ||
  applicationPacket.placePersisted !== 'Berlin' ||
  applicationPacket.addressPersisted !== 'Example Street 7\n10115 Berlin' ||
  applicationPacket.datePersisted !== '2026-08-15' ||
  applicationPacket.letterTonePersisted !== 'true' ||
  applicationPacket.applicationStatePersisted !== 'referred' ||
  applicationPacket.channelPersisted !== 'email' ||
  applicationPacket.referrerPersisted !== 'Taylor Referrer' ||
  applicationPacket.messageStylePersisted !== 'true' ||
  applicationPacket.notePersisted !== 'Ask about the platform team and confirm the interview timezone.' ||
  !applicationPacket.letterPersisted ||
  !applicationPacket.messagePersisted ||
  !applicationPacket.exportStillReady
const trackedRescoreFailed =
  !trackedRescore ||
  !trackedRescore.historicalLabelVisible ||
  !trackedRescore.rescoreEnabled ||
  trackedRescore.storedVersion !== 'ranking-v2.6.1' ||
  trackedRescore.storedHistorical !== false ||
  !/^[a-f0-9]{8}$/.test(trackedRescore.storedInputHash ?? '')
const resumeNavigationFailed =
  !resumeNavigation ||
  resumeNavigation.deepLink !== '#/resume' ||
  resumeNavigation.guardedHash !== '#/resume' ||
  resumeNavigation.initialDialogFocus !== 'Keep editing' ||
  resumeNavigation.draftAfterCancel !== 'Unsaved QA Name' ||
  resumeNavigation.requestedHash !== '#/settings' ||
  !resumeNavigation.requestedFocus?.includes('Settings & data') ||
  resumeNavigation.storedNameAfterDiscard !== 'QA Data Engineer' ||
  resumeNavigation.historyGuardedHash !== '#/resume' ||
  resumeNavigation.confirmedHistoryHash !== '#/dashboard' ||
  resumeNavigation.supportHash !== '#/support' ||
  !resumeNavigation.supportFocus?.includes('Help & feedback')
const searchCancellationFailed =
  !searchCancellation ||
  !searchCancellation.cancelledNotice ||
  searchCancellation.arbeitnowCalls !== 2 ||
  searchCancellation.currentCount !== 1 ||
  searchCancellation.staleCount !== 0 ||
  searchCancellation.finalHash !== '#/search'
if (
  errors.length ||
  failed ||
  careerFailed ||
  issueFailed ||
  labFailed ||
  packetFailed ||
  trackedRescoreFailed ||
  resumeNavigationFailed ||
  searchCancellationFailed
) process.exit(1)
