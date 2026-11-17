# Snip frontend

Angular 22 standalone UI for the shared Snip API. Source lives at the root of
the independent `frontend` branch; `main` mounts it as a submodule.

## Run and verify

Use Node 24.15+ LTS and npm. Angular also supports Node 22.22.3+ within
Node 22, or Node 26+; the exact ranges are declared in `package.json`.

```sh
npm ci
npm start
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
npm audit
npm audit --omit=dev
```

Start the backend separately on port 3000. The development server at
http://localhost:4200 calls http://localhost:3000. Production builds use the
same origin so the generated Bun bundle works when deployed, rather than calling
the visitor's localhost. Settings live in `src/environments/`.

The project name and release output are load-bearing: keep `snip-frontend`
and `dist/snip-frontend/browser/index.html` unchanged.

## API and behavior

- `POST /api/links` sends `{url}` and receives
  `201 {code, url, shortUrl, hits, createdAt}` or `400 {error}`.
- `GET /api/links` returns an array of the same records.
- Opening a short link requests `/:code`, redirects and increments hits.

The reactive form accepts only absolute HTTP(S) URLs, prevents duplicate pending
submissions, and shows validation/server/network errors beside the field.
Success shows the returned short URL and reloads the table. The table supports
loading, empty, error and retry states; Refresh links updates hit counts.
Links open in new tabs. The backend stores links in memory, so restarts clear them.

Tests cover form validation, submission and refresh, duplicate prevention, API
and network errors, retry, and the typed service's request contract. Chrome or
Chromium must be available for the headless test runner (`CHROME_BIN` can select
its executable).

## Security maintenance

The original tutorial used Angular 19. With user approval, the framework and
CLI were migrated together through Angular 20 and 21 to Angular 22, because the
latest Angular 19 runtime still had high-severity audit findings. The API,
project name and build output path are unchanged. Explicit eager change detection
and XHR configuration preserve the previous runtime behavior.

On 2026-11-17, the migrated lockfile resolved zero findings in both the full and
production-only npm audits (previously 14 high/2 critical and 4 high respectively).
Audit results can change as new advisories are published; rerun both checks
before release. No security gate, audit exclusion or dependency override was added.
