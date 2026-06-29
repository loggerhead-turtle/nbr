# Project guidance for Claude

National Baseball Ratings (NBR) — independent ratings for amateur baseball teams,
a tournament pool generator, and a scrimmage finder. Monorepo: `apps/web`
(Next.js site + admin), `apps/worker` (scraper + rating recompute), `packages/*`
(`core`, `db`, `ratings`).

## Terminology: "rating", never "ranking" (IMPORTANT)

This product uses the word **rating**, not **ranking**. In any **user-facing**
copy on the website (`apps/web`) — page text, headings, button labels, metadata
titles/descriptions, alt text, emails, error/empty states, admin UI included —
**never** use the words **"ranking", "rankings", or "ranked"**.

Use instead:
- "ranking" / "rankings" → **"rating" / "ratings"**
- "ranked teams" → **"rated teams"**
- "ranked by …" (ordering) → **"sorted by …"** or **"ordered by …"**

A team's numeric position may be shown as **"#5 overall"** — that's fine because
it doesn't use the word. Don't introduce a "Rankings" page, label, or heading.

This is enforced in CI: `.github/workflows/ci.yml` fails if `ranking`,
`rankings`, or `ranked` appears anywhere under `apps/web`. If you're describing
ordering in an internal code comment, say "order"/"sort"/"position" so the build
stays green. (Internal identifiers like the existing `getTeamRank` are tolerated
because they don't contain those exact words, but prefer neutral names in new
code.)

## Workflow notes

- Production deploys from the **`main`** branch (Render watches `main`); `main`
  is also the GitHub default. Open PRs against `main`.
- CI (`.github/workflows/ci.yml`) runs `prisma generate`, `pnpm -r typecheck`,
  and `pnpm -r test` on every PR. Keep it green.
- DB changes: add a numbered migration under `packages/db/prisma/migrations`
  (next number after the highest existing one — they're applied in order; mind
  that `10`/`11`/`12` sort before `9` lexically, so use the next integer).
