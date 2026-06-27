/**
 * Playwright browser harness for GameChanger's public pages.
 *
 * GameChanger is a JavaScript SPA that returns 403 to non-browser requests, so
 * we render pages in a real Chromium with human-like settings. This is a
 * deliberately low-volume, polite client (see scheduling.ts and runScrape.ts for
 * cadence and kill switches).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { randInt, sleep } from "../util.js";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  const ua = USER_AGENTS[randInt(0, USER_AGENTS.length - 1)]!;
  const context = await browser.newContext({
    userAgent: ua,
    locale: "en-US",
    timezoneId: "America/Denver", // Utah
    viewport: { width: randInt(1280, 1680), height: randInt(800, 1000) },
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });

  // Light fingerprint hardening: hide the automation flag.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return context;
}

/** Render a team's schedule page and return the page (caller parses + closes). */
export async function openSchedule(
  context: BrowserContext,
  gcTeamId: string,
): Promise<{ page: Page; httpStatus: number | null }> {
  const page = await context.newPage();
  const url = `https://web.gc.com/teams/${gcTeamId}/schedule`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Give the SPA time to render; small human-like pauses + a scroll to load
  // completed games that may be lazy-rendered.
  await sleep(randInt(1500, 3500));
  await humanScroll(page);

  return { page, httpStatus: response?.status() ?? null };
}

async function humanScroll(page: Page): Promise<void> {
  const steps = randInt(2, 5);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, randInt(400, 900));
    await sleep(randInt(400, 1200));
  }
}
