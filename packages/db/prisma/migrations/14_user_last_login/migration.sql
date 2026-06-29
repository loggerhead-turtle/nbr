-- Track the most recent successful login per coach account, so the admin
-- activity feed can surface "recent logins".
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
