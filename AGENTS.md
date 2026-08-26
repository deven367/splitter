# AGENTS.md

## Scope

This repository is a client-only expense-sharing app built with React 18 and Vite. It has no application server or database. The production app lives in `src/`; GitHub Pages serves the Vite build under `/splitter/`.

These instructions apply to the entire repository.

## Commands

Use Node 20, matching `.github/workflows/deploy.yml`, and npm with the committed lockfile.

```bash
npm ci                 # clean install
npm run dev            # Vite development server
npm run build          # production build; required before finishing code changes
npm run preview        # serve the production build locally
npm test -- --run      # run discovered Vitest tests once
node legacy/tests.js   # run the legacy standalone sanity suite
```

There is no lint or formatter script. Preserve the style of the file being edited rather than introducing a new formatting convention.

Current testing caveat: the repository has no `*.test.*` or `*.spec.*` files, so `npm test -- --run` exits with “No test files found.” `legacy/tests.js` passes as a standalone script, but it copies old calculation code and does not test `src/`. New tests for the React app should use Vitest, import the production module under test, and follow Vitest's normal `*.test.js`/`*.test.jsx` naming.

## Repository Map

- `src/App.jsx`: application composition, group switching, modal state, and member/expense mutation callbacks.
- `src/components/`: presentational and form components. Components receive state and callback props; shared application state should remain above them.
- `src/hooks/useAppState.js`: loads the active group's members and expenses from GitHub or local storage.
- `src/hooks/useGitHubSync.js`: GitHub Contents API integration, local persistence, group metadata, SHA tracking, and the debounced sync queue.
- `src/utils/calculations.js`: balances, settlements, percentage splits, and split classification.
- `src/utils/helpers.js`: group-name/file mapping, reserved filenames, encoding, and display sanitization.
- `src/styles/App.css`: one global stylesheet, including modal, component, and responsive rules.
- `data.json`, `data_*.json`, `groups.json`: real synchronized application data, not test fixtures. Do not edit them during unrelated code work.
- `legacy/`: preserved pre-React implementation. It is reference-only unless a task explicitly targets it; do not duplicate fixes there by default.
- `xlsx.min.js`: vendored legacy artifact. The React app imports the `xlsx` npm package instead; do not edit the vendored file.
- `.github/workflows/deploy.yml`: installs with `npm ci`, builds on Node 20, and deploys `dist/` to `gh-pages`.

## Architecture and State Flow

`App` owns the active group and composes two hooks:

1. `useGitHubSync(currentGroup)` owns GitHub configuration, group metadata, sync status, file SHAs, and queued writes.
2. `useAppState(currentGroup, githubSync)` owns `members` and `expenses`, preferring GitHub data when configured and falling back to group-scoped `localStorage`.
3. Components validate user input and emit complete domain objects through callbacks.
4. Mutation callbacks in `App` update React state and call `githubSync.queueSync` with the same next-state snapshot.

For every member or expense mutation:

- Compute the complete `newMembers` and/or `newExpenses` value first.
- Pass those exact arrays both to the React setter and to `queueSync`; do not rely on state immediately after a setter.
- Keep local-only behavior working. `queueSync` writes to `localStorage` immediately even when GitHub is not configured.
- Preserve the active-group storage namespace: `splitter_<group>_members` and `splitter_<group>_expenses`.
- Preserve group switching and SHA reset behavior. GitHub updates require the SHA for the active data file.
- Treat the 3-second sync queue as debounced persistence; changes must not drop an earlier member or expense mutation.

GitHub credentials are stored in browser `localStorage` under `github_token`, `github_repo`, and `github_branch`. Never add tokens to source, fixtures, logs, `.env`, or committed data files. Keep API failures compatible with the existing local-storage fallback.

## Domain Contracts

Members are strings and also serve as keys in each expense's `splits` object. Renaming or removing a member therefore affects `paidBy`, `splitBetween`, `splits`, balances, settlements, and persisted data.

A normal expense has this shape:

```js
{
  id: Date.now(),
  description: 'Dinner',
  amount: 42.50,
  paidBy: 'Alex',
  splitBetween: ['Alex', 'Sam'],
  splits: { Alex: 21.25, Sam: 21.25 },
  date: new Date().toISOString()
}
```

A payment uses the same accounting model plus `type: 'payment'`: the payer is `paidBy`, the payee is the only member in `splitBetween`, and `splits[payee]` equals the payment amount.

Maintain these monetary invariants:

- Amounts are positive finite numbers.
- Every referenced payer and split member exists in `members`.
- The sum of `splits` equals `amount` within one cent.
- Equal and percentage splits round to cents and assign any rounding remainder deterministically to the first selected member.
- Balance and settlement logic uses a one-cent tolerance; avoid strict floating-point equality for money.
- `calculateBalances` must remain zero-sum for valid expenses.

Keep group validation and filename generation centralized in `src/utils/helpers.js`. Different display names can normalize to the same `data_<name>.json`; collision checks must account for both case-insensitive names and normalized filenames. The `default` group maps to `data.json` and cannot be deleted.

## Implementation Conventions

- Use ES modules and function components with hooks; this is a JavaScript/JSX codebase, not TypeScript.
- Components use PascalCase filenames and default exports. Hooks and utilities use named exports.
- Keep domain calculations in `src/utils/`, persistence in hooks, orchestration in `App`, and rendering/form-local state in components.
- Reuse existing callback props and controlled inputs. Do not add a router, state library, CSS framework, or backend for a local change.
- Reuse classes in `src/styles/App.css`; add responsive behavior alongside the existing `900px` and `500px` breakpoints when relevant.
- Keep destructive actions behind confirmation and validate user input before mutating state.
- Sanitize untrusted values used in user-facing messages with the existing helpers. React already escapes values rendered as JSX; do not add raw HTML rendering.
- Preserve the Vite `base: '/splitter/'` setting unless deployment itself is being changed.
- Update `README.md` when commands, setup, architecture, or user-visible behavior changes.

## Verification

Choose checks that exercise the changed surface:

- Any production code change: run `npm run build`.
- Calculation/helper change: add or update a Vitest test that imports the `src/` implementation, then run `npm test -- --run`.
- UI/state-flow change: run the app and manually exercise the affected path, including local persistence after reload and the relevant empty/error state.
- Sync change: verify both modes—without GitHub configuration (local storage) and with mocked or safely configured GitHub responses. Never use or expose a real token in tests.
- Responsive/CSS change: inspect desktop and narrow layouts, especially below 900px and 500px.
- Legacy-only change: run `node legacy/tests.js`; this command is not a substitute for verifying the React app.

Do not commit generated `dist/`, `node_modules/`, local `.env`, credentials, or incidental changes to synchronized data files.
