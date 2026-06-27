# Worker image with Playwright + Chromium preinstalled.
# Build context is the repo root (see render.yaml dockerfilePath).
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Enable pnpm via corepack.
RUN corepack enable

# Install dependencies (copy manifests first for better layer caching).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/ratings/package.json packages/ratings/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source and generate the Prisma client.
COPY . .
RUN pnpm --filter @nbr/db generate

# Default job is the scraper; the recompute cron overrides the command.
CMD ["node", "--import", "tsx", "apps/worker/src/index.ts", "scrape"]
