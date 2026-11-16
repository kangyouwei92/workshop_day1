# Snip CLI

A dependency-free Node.js 20+ client for the Snip API.

```sh
./snip add https://example.com
./snip ls
./snip open Ab12Cd
./snip help
```

Windows users can run `snip.cmd` or `snip.ps1`. Set `SNIP_API` to the API
base URL; it defaults to `http://localhost:3000`. Requests time out after
10 seconds. Errors go to stderr and return exit code 1.

`open` requests the short code without following its redirect, then opens the
returned destination in the system browser. This request increments the hit count.
The backend keeps links in memory, so restarting it clears the list.

Run tests with `npm test`.
