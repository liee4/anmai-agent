# Risk Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace additive risk scores with auditable, per-channel evidence and keep the current wearer/relative emergency loop intact.

**Architecture:** The detector produces a discrete risk level plus structured evidence. Emergency progression compares levels and evidence, never score deltas. The ordinary-anomaly review sends a minimal anonymous evidence request to DeepSeek; the UI explains the level and evidence without a total score.

**Tech Stack:** TypeScript 6, TypeBox contracts, Vitest, React, SQLite, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-09-risk-evidence-design.md`

## Global Constraints

- Keep all safety boundaries as demo-only engineering values; never present them as clinical thresholds.
- Preserve fixed-boundary bypass of DeepSeek, one short observation, and model-failure fallback to asking the wearer.
- New risk responses have no total score. Legacy stored risk JSON may contain one but it must not drive actions or appear in new requests.
- Do not send wearer identifiers or location to the DeepSeek ordinary-risk review.

## Review Focus

- One missing channel while another is abnormal: detector must still evaluate the valid channel.
- Intra-second conflict in one channel: suppress only that channel; do not promote the other channel's data to a false fixed alert.
- Unknown activity: fixed boundaries remain active while personalized comparisons do not run.
- Existing `wearer_safe` monitor state: an explicit new worsening risk must bypass suppression without comparing scores.
- Existing SQLite events with `score`: read them without making the old number part of a new risk decision.

---

### Task 1: Risk contract and detector

**Files:** `packages/contracts/src/emergency.ts`, `apps/api/src/features/monitoring/risk-detector.ts`, `apps/api/src/features/monitoring/second-window.ts`, `apps/api/tests/features/monitoring/risk-detector.test.ts`.

**Interfaces:** `RiskAssessment` keeps `level`, `reasons`, `assessedAt`; adds optional structured `evidence` for compatibility with older SQLite rows. Its new producer never includes `score`. `RiskDetector.evaluate(samples, baseline)` remains the entrypoint.

- [x] Write failing tests for upward SpO2 deviation, HR-only and SpO2-only streams, two mild persistent channels remaining ordinary, confirmed fixed boundary with the other channel missing, and worsening trend after persistence.
- [x] Run `pnpm exec vitest run apps/api/tests/features/monitoring/risk-detector.test.ts` and inspect the expected failures.
- [x] Implement per-channel second buckets, quality gate, directional deviations, duration and trend evidence, and the decision table.
- [x] Run focused tests and `pnpm --filter @anmai/api typecheck`; resolve failures.

### Task 2: Event progression without score

**Files:** `apps/api/src/features/emergency/emergency-service.ts`, `apps/api/src/features/agent/anmai-agent.ts`, relevant emergency/agent tests and legacy fixtures.

**Interfaces:** Active event and safe-recheck transitions use `risk.level` and fixed-boundary reason changes. Timeline payload contains level/reasons/evidence, not score.

- [x] Add failing tests for wearer-safe plus new worsening, active primary contact plus new fixed boundary, and legacy event JSON containing a score.
- [x] Run focused emergency and agent tests; inspect failures.
- [x] Remove score comparisons and score payloads; update typed fixtures to the new contract.
- [x] Run focused tests and typecheck.

### Task 3: Minimal anonymous model request

**Files:** `apps/api/src/features/monitoring/risk-review-provider.ts`, `apps/api/src/features/monitoring/risk-review-service.ts`, `apps/api/src/features/monitoring/deepseek-risk-review-provider.ts`, review/provider tests.

**Interfaces:** `RiskReviewRequest` retains `wearerId` only for internal demo-provider routing. The actual DeepSeek HTTP body omits it and the legacy score; it carries an evidence-bearing risk assessment, latest/recent vital snapshots without location, baseline version and summary. `review()` still returns `ask | observe | uncertain` and reason.

- [x] Add failing tests inspecting the actual JSON sent to the provider: no wearer ID, location or score; evidence, recent values and baseline present.
- [x] Run focused review tests; inspect failures.
- [x] Construct the minimal request and preserve timeout/uncertain fallback behavior.
- [x] Run focused tests and typecheck.

### Task 4: Explainability in the demo and full regression

**Files:** `apps/web/src/app/GuidedDemo.tsx`, any affected component tests, the design/research notes.

**Interfaces:** Risk panel shows discrete level, reasons, per-channel quality and time evidence. It never displays a total score.

- [x] Add a failing component test that a normal/ordinary risk panel does not show `风险分数` and does show actionable quality/duration evidence.
- [x] Run focused web tests; inspect failure.
- [x] Render new evidence, including missing-channel status; keep copy labelled as simulation.
- [x] Run `pnpm verify` and review `git diff --check` plus `git status --short`.

## Self-review

Tasks cover each part of the confirmed decision table, provider boundary, event progression and presentation. Performance claims from open data are excluded until source files are downloaded and replayed with subject-level separation.
