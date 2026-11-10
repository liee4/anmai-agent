# Demo Completion State Implementation Plan

**Goal:** End an ordinary abnormal event without leaving a stale model review on screen, and keep the event outcome visible beside the next scenario choice.

**Architecture:** When an emergency event reaches `closed`, the API closes its associated risk review. The Web app retains a compact, non-medical summary of the completed simulation in component state until the next scenario starts. The existing event state machine remains authoritative.

**Tech Stack:** Fastify, SQLite, React, TypeScript, Vitest, Playwright.

## Tasks

- [x] Add an API regression test: ordinary abnormality, model observation, wearer help, relative takeover, close, then a fresh ordinary abnormality calls the model again.
- [x] Close the risk review whenever an event action successfully reaches `closed`; verify the API test passes.
- [x] Add browser regression tests for a persistent completion card, correct post-close step, and older `asked` review data without an active event.
- [x] Capture the just-finished event facts, show them until another scenario is chosen, and keep the page positioned at the card and scenario choices.
- [x] Run targeted tests and `pnpm verify`; inspect the local browser flow and leave Railway untouched.
