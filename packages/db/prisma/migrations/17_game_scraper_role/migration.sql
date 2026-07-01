-- Limited staff role: may add games + use the GameChanger lookup, nothing else.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GAME_SCRAPER';
