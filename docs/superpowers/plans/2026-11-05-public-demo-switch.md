# Public Demo Provider Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give judges a stable, protected URL and a one-click Fake/DeepSeek switch for all three model tasks, without exposing the API key.

**Architecture:** A single Fastify process serves the built React app and API on Railway with a persistent SQLite volume. A signed, cookie-backed demo session selects a provider mode and a unique wearer ID. Provider routing is resolved at each call and recorded with the result; active work and call budgets constrain switching and DeepSeek use.

**Tech Stack:** Node.js 24, Fastify, React, TypeScript, SQLite, Vitest, Playwright, Railway.

**Spec:** `docs/superpowers/specs/2026-11-05-demo-provider-switch-design.md`.

## Global Constraints

- `DEEPSEEK_API_KEY` stays in backend environment only; it never appears in an API response or browser bundle.
- Public demo requires `DEMO_ACCESS_TOKEN`; startup refuses missing token in public mode.
- A browser session gets its own wearer ID and provider mode; existing simulation remains local-test compatible.
- Only new model tasks use a switched mode. Existing baseline and emergency records retain their provider and state.
- Default mode is Fake. API restart may reset mode to Fake.
- DeepSeek calls have per-session and global bounds. No real contacts or emergency calls.

## Review Focus

1. Two browsers must not share a wearer ID, baseline or event.
2. Missing or wrong access token must not create a session or reach model endpoints.
3. DeepSeek Key must not appear in HTML, API JSON, logs or tests.
4. Switching during a pending review or active event must fail without changing mode.
5. A call arriving as the budget is exhausted must fail closed and retain the simulation flow.

### Task 1: Protected demo sessions

**Files:** Create `apps/api/src/features/demo/demo-session.ts`, migration 013; modify `apps/api/src/app.ts`, simulator reset, `apps/web/src/app/App.tsx`; test HTTP and browser session isolation.

**Interfaces:** `DemoSessionService` validates a random token with timing-safe compare, issues an HttpOnly SameSite cookie, maps sessions to a unique `wearerId`, and stores mode plus call counts in SQLite. Protected mode applies to `/api` and static assets; local tests may omit it.

- [ ] Write failing tests for invalid token, two sessions and cross-session wearer access.
- [ ] Implement session route, cookie guard, wearer scoping and reset for the active session.
- [ ] Run focused tests and commit.

### Task 2: Runtime provider selection

**Files:** Create provider mode router; modify baseline, risk review and message services plus `apps/api/src/main.ts` and `app.ts`; test HTTP provider switching.

**Interfaces:** `GET/PUT /api/settings/provider-mode` reports/sets `fake|deepseek` for the current session. Each model operation captures the selected provider and name at its start. In-flight work, pending review and active event reject mode changes. Missing Key and exhausted quota reject DeepSeek operations clearly.

- [ ] Write failing tests for all three provider names, no Key, active work and quota.
- [ ] Implement routing and audit-safe provider snapshot.
- [ ] Run focused tests and commit.

### Task 3: Single-port Railway service and page control

**Files:** Modify `apps/api/src/main.ts`, `apps/web/src/app/App.tsx`, API client, styles, root scripts; create Dockerfile or Railway config; update README and demo runbook.

**Interfaces:** Production API serves `apps/web/dist` and `/api` on `0.0.0.0:$PORT`; SQLite path is `DATABASE_PATH` on a Railway volume. Page shows mode, Key configuration and switch result without exposing secrets.

- [ ] Add component and browser tests for switch and per-browser isolation.
- [ ] Build single-port service and UI, then test locally with a fake Key.
- [ ] Run `pnpm verify`, inspect browser view and deployment instructions; commit.

### Task 4: Deploy and verify

- [ ] Complete all local files, checks and commits before syncing GitHub.
- [ ] Push or sync to private `liee4/anmai` and verify remote tree.
- [ ] If Railway account access is available, configure service, volume, variables and domain, then smoke test. Otherwise provide exact user-only setup steps and stop before entering the user's Key or payment details.
