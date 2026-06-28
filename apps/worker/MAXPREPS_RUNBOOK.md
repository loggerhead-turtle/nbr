# MaxPreps Utah harvest — runbook (non-prod)

Goal for this phase: scrape **team + completed-game scores** for every Utah
high-school varsity baseball team, load them into a **non-prod** NBR database,
and run ratings. No roster / box-score / per-player stats yet (that's a later
build). The harvester (`src/scraper/runMaxPreps.ts`) already does exactly this —
it visits each team's schedule, reads classification, and upserts only games with
both scores. No code changes needed for the happy path.

## Why this can't run in an allowlist-only web session

A real run needs outbound HTTPS to two hosts, both blocked by a restrictive
egress policy:

- `www.maxpreps.com` (+ `*.maxpreps.com`) — render the pages (MaxPreps 403s
  non-browser clients, so we use real Chromium via Playwright).
- `binaries.prisma.sh` — Prisma downloads its query engine here; without it
  `@prisma/client` can't be generated and the worker can't talk to the DB.

To run, start a **new web session on this branch** with a network policy that
allows at least those two hosts (a custom allowlist is enough — no full internet,
no prod DB, no secrets). Playwright's Chromium is pre-installed.

## Ready-to-go steps (run in a network-enabled session)

```bash
# 1) Non-prod Postgres + NBR schema (idempotent; recreates the ephemeral DB)
bash scripts/dev-db.sh
export DATABASE_URL="postgresql://nbr@127.0.0.1:5433/nbr?schema=public"

# 2) Prisma client (needs binaries.prisma.sh)
pnpm --filter @nbr/db exec prisma generate

# 3) Scraper env
export SCRAPER_ENABLED=true
export MAXPREPS_SEASON_YEAR=2026

# 4) DISCOVERY (no writes) — find the per-classification (1A–6A) standings URLs
#    off the Utah hub and confirm the live 2025-26 page shapes:
MAXPREPS_DEBUG_URL="https://www.maxpreps.com/ut/baseball/" pnpm --filter @nbr/worker maxpreps
#    Repeat with each standings URL it surfaces to verify team-link extraction.

# 5) Seed the harvest with those standings URLs (full coverage incl. unranked),
#    then — ONLY ON YOUR GO — run the load:
export MAXPREPS_SEEDS='["<1A standings>","<2A>","<3A>","<4A>","<5A>","<6A>"]'
export MAXPREPS_MAX_TEAMS=10   # small first pass; raise after sanity-checking
pnpm --filter @nbr/worker maxpreps

# 6) Ratings over the loaded games
pnpm --filter @nbr/worker recompute
```

## Notes / expected gotchas

- The parsers in `parseMaxPreps.ts` are written but **never verified against a
  live MaxPreps page** — expect small selector/regex tweaks after step 4.
- The worker reads `process.env` directly (no dotenv), so export the vars above
  or prefix the command; on Render they come from the platform.
- Seeding from **standings** (not the hub/rankings) is deliberate: it enumerates
  every team in each classification, including unranked schools, and is the same
  region/classification graph used later for ratings context.
