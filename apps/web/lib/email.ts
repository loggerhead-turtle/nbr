/**
 * Minimal, dependency-free email sender. Uses Resend's HTTP API when
 * RESEND_API_KEY is set; otherwise logs and no-ops so the app works without
 * email configured. All sends are best-effort and never throw to the caller.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export function siteUrl(path = ""): string {
  return `${SITE_URL}${path}`;
}

/** Admin recipient for system notifications (TD requests, etc.). */
export function adminEmail(): string | null {
  if (process.env.ADMIN_NOTIFY_EMAIL) return process.env.ADMIN_NOTIFY_EMAIL;
  const allow = (process.env.ADMIN_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allow[0] ?? null;
}

export async function sendEmail(opts: {
  to: string | null | undefined;
  subject: string;
  html: string;
}): Promise<void> {
  const to = opts.to?.trim();
  if (!to) return;

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "National Baseball Ratings <onboarding@resend.dev>";

  if (!key) {
    console.log(`[email:skipped — no RESEND_API_KEY] to=${to} subject="${opts.subject}"`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      console.error(`[email] send failed ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } catch (e) {
    console.error("[email] error", e);
  }
}

/** Shared wrapper so messages have a consistent look. */
export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0;"><a href="${cta.url}" style="background:#162a60;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${cta.label}</a></p>`
    : "";
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f1f47;">
    <h2 style="color:#0f1f47;">${title}</h2>
    <div style="font-size:15px;line-height:1.5;color:#334155;">${bodyHtml}</div>
    ${button}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
    <p style="font-size:12px;color:#94a3b8;">National Baseball Ratings · ${siteUrl()}</p>
  </div>`;
}
