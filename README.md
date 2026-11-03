<div align="center">
  <h1>PaladinsCat Frontend</h1>
  <p>The player-facing web application for <a href="https://paladinscat.com/">PaladinsCat</a>.</p>

  [![CI](https://github.com/NabiCook/PaladinsCat-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/NabiCook/PaladinsCat-frontend/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/NabiCook/PaladinsCat-frontend/actions/workflows/codeql.yml/badge.svg)](https://github.com/NabiCook/PaladinsCat-frontend/actions/workflows/codeql.yml)
</div>

Built with Next.js, React, and TypeScript, this repository powers PaladinsCat's player profiles, match histories, champion analytics, activity reporting, research articles, localization, account flows, and staff operations interface.

## Project map

| Area | Purpose |
| --- | --- |
| `app/` | Routes, layouts, server handlers, and application surfaces |
| `components/` | Shared interface and visualization components |
| `lib/` | API clients, security helpers, localization, and domain logic |
| `public/` | Optimized game and site assets |
| `scripts/` | Build-time data, localization, and security audits |
| `locales/` | Pinned community locale submodule |

## Development

```text
git submodule update --init --recursive
npm ci
npm run dev
```

Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

Licensed under the [MIT License](LICENSE).
