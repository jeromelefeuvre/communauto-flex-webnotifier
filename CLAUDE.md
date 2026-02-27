# AI Assistant Rules — Communauto Flex WebNotifier

These rules apply to all AI coding assistants (Claude, Gemini, Copilot, etc.) working on this project.

## Git Safety

- **Never push or commit without explicit user permission.** You may write code and run tests, but always ask before running `git commit` or `git push`.
- Never commit secrets, `.env`, or credential files.
- **Never add `Co-Authored-By` trailers to commit messages.**

## Testing

- **Every bug fix and feature must have a corresponding Playwright test** in `tests/app.spec.js` or `tests/ui.spec.js` that would catch a regression.
- **Always run `npm test` before committing.** All tests must pass without skipping.
- After every change, review existing tests for redundancy or invalidity and update or remove them accordingly.
- Prefer terminal console coverage summaries over heavy file-based V8 reports.

## Releases & Tagging

- **Always bump `version` in `package.json` before creating a git tag.** This also triggers cache busting for Docker clients.
- Use the multi-line annotated tag format:
  ```
  git tag -a vX.Y.Z -m "Release vX.Y.Z Summary:
  - feat: ...
  - fix: ...
  - chore: ..."
  ```
- Do not manually append `?v=` query strings to imports in `index.html` — the server-side cache busting in `server.mjs` handles this via the package version.

## Docker

- After all Playwright tests pass, validate production readiness with `docker build -t communauto-car-notify .` before committing.

## Development

- Start the app: `npm start` (serves on port 8000).
- Run tests: `npm test` (Playwright E2E suite).
