# Snip backend

A dependency-free Bun URL shortener. Links are stored in memory and are cleared
when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the short-link origin, or `RAILWAY_PUBLIC_DOMAIN` to use
`https://<domain>` when `BASE_URL` is unset. `BASE_URL` takes precedence.

Set `PUBLIC_DIR` to serve static files alongside the API and redirects. `/`
serves `index.html`; existing files take precedence over short codes.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link and
  returns `201` with `code`, `url`, `shortUrl`, `hits`, and `createdAt`.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL with `302` and increments `hits`.
- Invalid JSON or non-HTTP(S) URLs return `400`; unknown codes return `404`.
