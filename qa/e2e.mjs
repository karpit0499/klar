import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:4173/'
const errors = [], results = {}
const browser = await chromium.launch()
async function overflow(page){ const o = await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})); return o.sw <= o.cw + 1 }
async function run(viewport, tag){
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('console', m => { if(m.type()==='error'||m.type()==='warning') errors.push(`[${tag}] ${m.text()}`) })
  page.on('pageerror', e => errors.push(`[${tag}] ${e.message}`))
  await page.goto(BASE, { waitUntil:'networkidle' })
  await page.getByText('Find flexible work', { exact:false }).first().click()
  await page.locator('input[autocomplete="address-level2"]').first().fill('Berlin')
  await page.getByRole('button', { name:/Explore flexible work/i }).click()
  await page.getByRole('button', { name:/Search flexible work/i }).first().click()
  await page.waitForTimeout(3000)
  results[tag] = {
    overflow_ok: await overflow(page),
    cards: await page.locator('ul[aria-label] li').count(),
    sourceStatus: await page.getByText(/Source status/i).count() > 0,
    openEntry: /Open application/i.test(await page.locator('main').innerText()),
    terminal: /Search complete|returned no matching/i.test(await page.locator('main').innerText()),
  }
  await ctx.close()
}
await run({ width:1280, height:900 }, 'desktop')
await run({ width:375, height:780 }, 'mobile')
await browser.close()
console.log(JSON.stringify({ results, errors }, null, 2))
if (errors.length || Object.values(results).some(r => !r.overflow_ok || r.cards === 0)) process.exit(1)