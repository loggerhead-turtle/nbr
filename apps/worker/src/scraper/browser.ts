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

  // Give the SPA time to fetch + render; wait for network to settle, then a
  // small human-like pause + a scroll to load lazy-rendered completed games.
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await sleep(randInt(1500, 3500));
  await humanScroll(page);
  await sleep(randInt(800, 1600));

  return { page, httpStatus: response?.status() ?? null };
}

/**
 * Diagnostic snapshot of the rendered page — used to tune the parser against
 * GameChanger's real (obfuscated) DOM. Enabled via SCRAPER_DEBUG.
 */
export async function pageDiagnostics(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    const gameLinks = anchors.filter((a) => /\/games?\//.test(a.getAttribute("href") || ""));
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      url: window.location.href,
      title: document.title,
      anchorCount: anchors.length,
      gameLinkCount: gameLinks.length,
      gameLinkSamples: gameLinks.slice(0, 8).map((a) => a.getAttribute("href")),
      hasFinalText: /\bfinal\b/i.test(bodyText),
      hasScorePattern: /\b\d{1,2}\s*[-–]\s*\d{1,2}\b/.test(bodyText),
      bodyTextSample: bodyText.slice(0, 2500),
    };
  });
}

/** Render an arbitrary URL (used by the MaxPreps harvester). */
export async function openUrl(
  context: BrowserContext,
  url: string,
): Promise<{ page: Page; httpStatus: number | null }> {
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await sleep(randInt(1500, 3500));
  await humanScroll(page);
  await sleep(randInt(600, 1400));
  return { page, httpStatus: response?.status() ?? null };
}

/** All anchors on the page as {href, text} — for harvesting team links. */
export async function pageLinks(page: Page): Promise<{ href: string; text: string }[]> {
  return page.evaluate(() => {
    const out: { href: string; text: string }[] = [];
    for (const a of Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[]) {
      const href = a.href; // absolute
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (href) out.push({ href, text });
    }
    return out;
  });
}

async function humanScroll(page: Page): Promise<void> {
  const steps = randInt(2, 5);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, randInt(400, 900));
    await sleep(randInt(400, 1200));
  }
}
