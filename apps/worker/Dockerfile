# Worker image with Playwright + Chromium preinstalled.
# Build context is the repo root (see render.yaml dockerfilePath).
# Pinned to the same Playwright version as the worker's dependency so the
# preinstalled Chromium matches the library.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app
# Browsers ship in the base image; never try to download them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Enable pnpm via corepack.
RUN corepack enable

# Copy the whole repo, then install. We must include dev dependencies
# (--prod=false) because the worker runs via tsx and generates the Prisma client.
COPY . .
RUN pnpm install --frozen-lockfile --prod=false || pnpm install --prod=false

# Generate the Prisma client (downloads engines at build time on an open network).
RUN pnpm --filter @nbr/db generate

ENV NODE_ENV=production

# Default job is the scraper; the recompute cron overrides the command.
CMD ["pnpm", "--filter", "@nbr/worker", "scrape"]
