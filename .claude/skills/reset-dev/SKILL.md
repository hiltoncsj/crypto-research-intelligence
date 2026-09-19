---
name: reset-dev
description: Kill orphaned node/tsx processes on Windows when npm run dev / worker:dev / scheduler:dev won't release their port after being stopped. Use when a dev server restart fails with "port already in use" or similar on this Windows machine.
---

On Windows, stopping the "parent" `npm run dev` / `npm run worker:dev` / `npm run scheduler:dev`
process does not always kill the real child process (`next-server`, `tsx`). If the port is still
in use after stopping the command:

1. Find the PID holding the port: `netstat -ano | grep ":<port>"` (default Next.js dev port is
   3000; worker/scheduler don't bind a port but can still leave an orphaned `tsx`/`node` process).
2. Kill it directly: `taskkill //F //PID <pid>`.
3. If unsure which process is the right one, list node/tsx processes first (`tasklist | grep -i
node`) before killing, to avoid taking down an unrelated process.

This is a known Windows-specific gotcha, not a bug in the app — see CLAUDE.md.
