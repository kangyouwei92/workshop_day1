# Snip

Snip is a URL shortener with one Bun backend and two clients: an Angular web
app and a Node.js CLI. Links are held in memory and disappear on restart.

## Architecture

Each component lives at the root of an independent branch in this repository.
This `main` branch is the superproject: its submodules pin exact commits of
`backend`, `frontend`, and `cli`. The `.gitmodules` file records their URLs and
tracked branches.

Clone with submodules (a plain clone leaves their directories empty):

```sh
git clone --recurse-submodules https://github.com/kangyouwei92/workshop_day1.git
cd workshop_day1
```

For an existing clone, run `git submodule update --init --recursive`.

## API

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/links` | `{"url":"https://example.com"}` | `201` with `code`, `url`, `shortUrl`, `hits`, `createdAt`; `400` for invalid input |
| GET | `/api/links` | — | `200` with an array of link records |
| GET | `/:code` | — | `302` to the original URL and increments hits; `404` if unknown |

Codes are six base62 characters. `createdAt` is an ISO timestamp. Both clients
use the same backend state.

## Run locally

Install Bun 1.x and Node.js 20+ with npm. From separate terminals:

```sh
cd backend
bun start
```

```sh
cd frontend
npm ci
npm start
```

```sh
cd cli
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

The backend listens on port 3000 by default; the development frontend is at
`http://localhost:4200`. The CLI uses `http://localhost:3000` unless `SNIP_API`
is set. See each component's README for configuration and tests.

## Update a component

Commit and push changes from inside its submodule on the appropriate branch.
Then update and commit the superproject's pointer separately:

```sh
git submodule update --remote backend
git add backend
git commit -m "Update backend submodule"
git push origin main
```

Replace `backend` with `frontend` or `cli` as needed. A submodule commit must be
pushed before its new pointer can be used by other clones.

## Generated bundle

The `bundle` submodule tracks generated output; do not edit it by hand. On a
clean `main` checkout, run `node scripts/build-bundle.mjs` to update source
submodules to their branch tips, build the frontend, and commit changed bundle
and superproject pointers locally. Run it with `--push` to publish both branches.
The script requires Git commit identity and refuses dirty component checkouts.
Run it again without source changes to verify it is a no-op. The bundle runs
with `bun start` or can be built with `docker build -t snip bundle`.

The hourly/manual bundle workflow checks dependencies and the CLI before
pushing. It dispatches the image workflow explicitly because a push made with
`GITHUB_TOKEN` does not trigger a separate push workflow. The image workflow
checks dependencies, smoke-tests and scans the candidate image before pushing
it to GHCR. High or critical findings block publication.
