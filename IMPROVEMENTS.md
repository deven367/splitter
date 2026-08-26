# Splitter Improvement Backlog

This file tracks implementation and organization work discovered during the repository review. All items are open unless checked. Update the checkbox, status notes, tests, and affected files in the same commit as each completed item.

Last reviewed: 2026-08-26 at commit `d7accce`.

## Current Baseline

- `npm run build` passes.
- `node legacy/tests.js` passes 24 standalone legacy checks.
- `npm test -- --run` exits with code 1 because no Vitest test files are currently discovered.
- Production code is the React app under `src/`; `legacy/tests.js` duplicates old logic and is not coverage for `src/`.
- Root `data.json`, `data_*.json`, and `groups.json` contain synchronized user data. Do not use or modify them as test fixtures.

## Recommended Execution Order

1. Add a production-module Vitest baseline.
2. Fix state and synchronization races.
3. Fix domain/reporting defects.
4. Consolidate duplicated mutation and split logic.
5. Handle larger data-model and deployment changes separately.

## P0 — State and Synchronization Correctness

### [ ] IMP-001: Persist the filtered expense snapshot on member removal

**Problem:** In `src/App.jsx`, the `MembersList.onRemoveMember` callback calculates and sets `newExpenses`, then calls `queueSync` with stale `appState.expenses`. Related expenses can be written back to local storage or GitHub after the member is removed.

**Change:**

- Derive `newMembers` and `newExpenses` once.
- Pass those exact arrays to both the React setters and `githubSync.queueSync`.
- Preserve the confirmation shown when the member participates in expenses.

**Acceptance:**

- Removing a member with related expenses removes the member and every related expense from React state, group-scoped local storage, and the queued GitHub payload.
- Removing a member without related expenses preserves all expenses.
- A regression test fails if the old expense array is queued.

**Primary files:** `src/App.jsx`, new React/state tests.

### [ ] IMP-002: Connect with the submitted GitHub configuration

**Problem:** `SettingsModal.handleSave` calls `onSave(config)` and immediately calls `loadGroups()` and `onLoadData()`. React state has not updated yet, so both operations can use the previous `githubConfig` while the UI reports a successful connection.

**Change:** Replace this multi-call sequence with one hook operation such as `connect(config)` that persists and uses the exact submitted configuration for all connection requests. Do not depend on a state update becoming synchronously visible.

**Acceptance:**

- A first-time connection uses the token, repository, and branch entered in that submission.
- Success is displayed only after group and active-group data are loaded from GitHub.
- Failed GitHub responses produce an error and do not claim connection success.
- Tests use mocked fetch responses and never real credentials.

**Primary files:** `src/components/SettingsModal.jsx`, `src/hooks/useGitHubSync.js`, `src/hooks/useAppState.js`.

### [ ] IMP-003: Make group switching single-source and race-safe

**Problem:** `App.switchGroup` sets `currentGroup` and then calls an old-render `appState.loadData()` closure, which still targets the previous group. The `useAppState` effect later loads again for the new group. Rapid switches can resolve out of order and overwrite the active group.

**Change:** Choose one loading path:

- Prefer a group-keyed, cancellable effect that is the sole loader; or
- Make `loadData(groupName)` explicit and commit the switch only against that requested group.

Remove the redundant old-group load. Ignore or abort results for groups that are no longer active.

**Acceptance:**

- Switching A → B loads B exactly once under normal operation.
- If A resolves after B, A cannot overwrite B's members, expenses, or SHA.
- A failed B load has defined behavior and cannot falsely restore unrelated data.
- Rapid A → B → A transitions are covered by a deterministic test.

**Primary files:** `src/App.jsx`, `src/hooks/useAppState.js`, `src/hooks/useGitHubSync.js`.

### [ ] IMP-004: Drain synchronization using the latest complete snapshot

**Problem:** `useGitHubSync.performSync` can schedule a follow-up using the earlier invocation's `members` and `expenses`. Mutations queued during an active request may therefore be committed with stale data.

**Change:**

- Keep the latest complete `{ members, expenses }` snapshot in a ref.
- Let the queue accumulate commit-message context, not separate authoritative state copies.
- Every drain commits the latest snapshot available when that drain starts.
- Add effect cleanup for timers and define what happens to pending work during unmount/group changes.

**Acceptance:**

- If mutation B is queued while mutation A is syncing, the final persisted payload contains B.
- Batched commit messages remain intact.
- A failed request preserves pending messages and the latest snapshot for retry.
- No timer fires against an unmounted hook.

**Primary file:** `src/hooks/useGitHubSync.js`.

### [ ] IMP-005: Scope GitHub file SHAs to their groups

**Problem:** The hook stores one `currentSha`. A delayed request for the previous group can finish after a group switch and assign that SHA to the new active group, causing incorrect GitHub update requests or conflicts.

**Change:** Track SHAs by data filename/group, or keep each pending operation bound to an immutable `{ group, filename, sha }` context. Do not let a response update another group's SHA.

**Acceptance:**

- Concurrent or delayed operations for two groups retain independent SHAs.
- Every PUT sends the SHA belonging to its target filename.
- Switching groups during an in-flight request is covered by a test.

**Primary file:** `src/hooks/useGitHubSync.js`.

## P1 — User-Visible Logic

### [ ] IMP-006: Report the actual source of manual synchronization

**Problem:** `useAppState.loadData` catches a GitHub failure and falls back to local storage. `App.syncFromGitHub` then displays “Synced from GitHub!” even when no GitHub data was loaded.

**Change:** Return an explicit source/result, or provide strict and fallback loading modes. An explicit user-requested sync should surface GitHub failure; startup may retain the local fallback.

**Acceptance:**

- Startup remains usable offline with local data.
- Manual sync reports success only after a GitHub response is parsed and applied.
- Manual sync reports GitHub failure instead of presenting local fallback as remote success.

**Primary files:** `src/App.jsx`, `src/hooks/useAppState.js`.

### [ ] IMP-007: Decode GitHub base64 content as UTF-8

**Problem:** Writes use `utf8ToBase64`, but reads use plain `atob` for both `groups.json` and group data. Non-ASCII names and descriptions can be corrupted.

**Change:** Add the inverse `base64ToUtf8` helper and use it at every GitHub JSON decode site.

**Acceptance:**

- Group names, member names, and descriptions containing accents, non-Latin characters, and emoji round-trip without corruption.
- Helper tests cover representative Unicode strings.

**Primary files:** `src/utils/helpers.js`, `src/hooks/useGitHubSync.js`.

### [ ] IMP-008: Reject unsuccessful GitHub group deletion

**Problem:** `deleteGroupDataFile` does not check the DELETE response. The app can remove the group from `groups.json` and local state while its remote data file remains.

**Change:** Check `response.ok`, parse a useful GitHub error, and update the group registry only after deletion succeeds. Keep 404 idempotent.

**Acceptance:**

- 2xx and 404 allow the workflow to complete.
- 401, 403, 409, and 5xx responses stop group removal and display an error.
- Tests verify the registry is unchanged after a failed deletion.

**Primary files:** `src/hooks/useGitHubSync.js`, `src/components/GroupModal.jsx`.

### [ ] IMP-009: Persist split intent instead of inferring it

**Problem:** `checkIfPercentageSplit` classifies nearly every valid unequal custom split as percentage-based because converting split amounts back to percentages naturally totals approximately 100. `EditExpenseModal` therefore cannot reliably restore custom mode.

**Change:** Persist `splitType` on normal expenses. For percentage splits, persist entered percentages if exact editing fidelity is required. Define backward-compatible behavior for existing records without `splitType`; default unequal legacy records to custom rather than guessing percentage intent.

**Acceptance:**

- Equal, percentage, and custom expenses reopen in the mode used to create them.
- Existing records without metadata still edit safely.
- Payments remain excluded from normal split-mode editing.
- Tests cover equal, percentage, custom, rounding, and legacy records.

**Primary files:** `src/components/ExpenseForm.jsx`, `src/components/EditExpenseModal.jsx`, `src/utils/calculations.js`.

### [ ] IMP-010: Exclude payments from spending totals

**Problem:** Payments are stored as expense-shaped accounting entries. `ExpensesList` and the Excel summary sum every entry, so transfers inflate “expense” totals.

**Change:** Keep payments in balance and settlement calculations, but exclude `type === 'payment'` from spending totals and expense-report totals. Decide whether the Excel workbook should show payments on a separate sheet.

**Acceptance:**

- Recording a payment changes balances but not total spending.
- Expense totals include normal expenses only.
- Excel output clearly separates or labels payments and does not count them as spending.

**Primary files:** `src/components/ExpensesList.jsx`, `src/App.jsx`.

## P2 — Maintainability and Data Integrity

### [ ] IMP-011: Establish Vitest coverage against production modules

**Problem:** The configured Vitest command discovers no tests. The legacy suite copies implementations, so it can pass independently of production regressions.

**Change:** Add focused `*.test.js`/`*.test.jsx` tests that import `src/` modules. Start with calculations, filename normalization, Unicode encoding, and the P0 state/sync transitions. Add React Testing Library only if component behavior cannot be tested cleanly through extracted hooks or pure functions.

**Acceptance:**

- `npm test -- --run` exits successfully.
- Tests fail for plausible regressions described in IMP-001 through IMP-010.
- `legacy/tests.js` is clearly retained as legacy-only or removed in a deliberate legacy cleanup.

**Primary files:** new tests beside or under `src/`; `package.json` only if a minimal test dependency is justified.

### [ ] IMP-012: Centralize atomic member and expense mutations

**Problem:** `App.jsx` repeats state derivation, state setters, and sync calls across inline callbacks. This structure allowed stale-snapshot defects.

**Change:** After P0 behavior is tested, expose narrow domain operations such as `addExpense`, `updateExpense`, `deleteExpense`, `addMember`, and `removeMember`. Each operation must atomically derive and persist one next snapshot. A small reducer or hook is sufficient; do not add a state library.

**Acceptance:**

- Components no longer coordinate persistence themselves.
- Every operation has one implementation of its state and sync transition.
- No compatibility wrappers or parallel mutation paths remain.

**Primary files:** `src/App.jsx`, `src/hooks/useAppState.js`, optionally one focused new hook or reducer.

### [ ] IMP-013: Extract shared split construction and validation

**Problem:** `ExpenseForm` and `EditExpenseModal` duplicate equal, percentage, and custom split construction, validation, and rounding.

**Change:** Move the behavior into a pure utility that returns `{ splits }` or `{ error }`. Keep user-interface concerns such as alerts in components.

**Acceptance:**

- Add and edit flows use the same production implementation.
- Split sums, one-cent rounding, invalid percentages, empty selection, and invalid custom values are covered by tests.
- Duplicated calculation blocks are removed.

**Primary files:** `src/components/ExpenseForm.jsx`, `src/components/EditExpenseModal.jsx`, `src/utils/calculations.js`.

### [ ] IMP-014: Validate and normalize persisted data at load boundaries

**Problem:** Local and GitHub JSON is trusted directly. Malformed records or references to missing members can crash rendering or poison balances with `NaN`.

**Change:** Add a lightweight validator/normalizer used by both local and GitHub loaders. Reject or explicitly migrate invalid shapes; do not silently fabricate financial data.

**Acceptance:**

- Invalid JSON and invalid record shapes produce a recoverable, visible error.
- Unknown payers, unknown split members, non-finite amounts, invalid dates, and split-total mismatches are detected.
- Valid existing `data.json` and `data_*.json` shapes remain compatible.

**Primary files:** `src/hooks/useAppState.js`, `src/hooks/useGitHubSync.js`, a focused utility module if needed.

## P3 — Larger Deliberate Changes

### [ ] IMP-015: Migrate monetary storage to integer cents

**Problem:** Floating-point arithmetic produces persisted artifacts and complicates exact financial invariants.

**Change:** Design a versioned migration from decimal-number amounts to integer cents for amounts, splits, balances, settlements, and exports. This is a data migration, not a mechanical refactor.

**Acceptance:**

- Existing persisted data migrates once without changing represented values.
- All internal arithmetic is integer-based.
- Display and Excel export convert cents to decimal currency at boundaries.
- Migration fixtures cover current real-data shapes without containing real user data.

**Primary files:** domain calculations, forms, persistence loaders, export logic, versioned migration code.

### [ ] IMP-016: Decouple synchronized user data from Pages deployment

**Problem:** When GitHub sync writes `data*.json` to `main`, each expense mutation can trigger the GitHub Pages build and deployment workflow, creating noisy history and unnecessary deployments.

**Change:** Choose one explicit model:

- Store synchronized data in a dedicated branch or repository; or
- Add safe workflow path filtering so data-only commits do not deploy.

Confirm that the chosen model still allows the browser client to read and write the configured location.

**Acceptance:**

- Data-only synchronization does not trigger an application deployment.
- Source changes still build and deploy normally.
- README setup instructions describe the chosen branch/repository and required fine-grained token permissions.

**Primary files:** `.github/workflows/deploy.yml`, `src/hooks/useGitHubSync.js`, `README.md`.

## Completion Rules

For every item:

1. Add a regression test that exercises the production implementation when practical.
2. Run `npm test -- --run` once tests exist and run `npm run build` for production code changes.
3. Smoke-test changed UI/state behavior in the running app.
4. Update this file in the implementation commit: check the item, record any design decision that changes later work, and list verification performed.
5. Do not combine IMP-015 or IMP-016 with unrelated bug fixes; both have migration/deployment tradeoffs that require isolated review.
