# Contributing to NetlifyHub

Thank you for your interest in improving NetlifyHub.

## Workflow

1. Fork the repository and create a feature branch from `main`.
2. Install dependencies with `pnpm install` at the repository root.
3. Run `pnpm lint` before opening a pull request.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (for example `feat: add netlify account sync`).

## Security

Please report security issues privately to the maintainers instead of using public issues.

## Code style

- TypeScript is preferred for application code.
- Match existing formatting; Prettier runs via `lint-staged` on commit when Husky is enabled.
