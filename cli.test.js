'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { browserCommand, openBrowser } = require('./cli');

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'cli.js'), ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function server(handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${instance.address().port}`;
  return { instance, base };
}

test('help and invalid arguments do not require the API', async () => {
  const help = await run(['help'], { SNIP_API: 'not-a-url' });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /snip add <url>/);
  for (const args of [['add', 'file:///tmp/x'], ['open', '../bad'], ['ls', 'extra']]) {
    const result = await run(args);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr);
  }
});

test('add and list use the shared API contract', async t => {
  const received = [];
  const api = await server((req, res) => {
    received.push([req.method, req.url]);
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        assert.deepEqual(JSON.parse(body), { url: 'https://example.com/a' });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ shortUrl: `${api.base}/Ab1234` }));
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ code: 'Ab1234', hits: 3, url: 'https://example.com/a' }]));
    }
  });
  t.after(() => api.instance.close());
  const env = { SNIP_API: api.base };
  const add = await run(['add', 'https://example.com/a'], env);
  assert.equal(add.code, 0);
  assert.equal(add.stdout.trim(), `${api.base}/Ab1234`);
  const list = await run(['ls'], env);
  assert.equal(list.code, 0);
  assert.match(list.stdout, /CODE\s+HITS\s+URL/);
  assert.match(list.stdout, /Ab1234\s+3\s+https:\/\/example.com\/a/);
  assert.deepEqual(received, [['POST', '/api/links'], ['GET', '/api/links']]);
});

test('empty list, API errors, invalid JSON and missing links', async t => {
  const api = await server((req, res) => {
    if (req.url === '/Bad123') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"Not found"}');
    } else if (req.method === 'POST') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":"Bad URL"}');
    } else if (req.url === '/api/links') {
      res.end('[]');
    } else {
      res.end('not json');
    }
  });
  t.after(() => api.instance.close());
  const env = { SNIP_API: api.base };
  assert.equal((await run(['ls'], env)).stdout.trim(), 'No links yet.');
  const missing = await run(['open', 'Bad123'], env);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /404.*Not found/);
  const bad = await run(['add', 'https://example.com'], env);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /400.*Bad URL/);
  api.instance.removeAllListeners('request');
  api.instance.on('request', (req, res) => res.end('not json'));
  const malformed = await run(['ls'], env);
  assert.equal(malformed.code, 1);
  assert.match(malformed.stderr, /invalid JSON/);
});

test('manual redirect opens the destination without following it', { skip: process.platform === 'win32' }, async t => {
  let destinationRequests = 0;
  const api = await server((req, res) => {
    if (req.url === '/Ab1234') {
      res.writeHead(302, { Location: `${api.base}/destination?x=1&y=2` });
      res.end();
    } else {
      destinationRequests++;
      res.end();
    }
  });
  t.after(() => api.instance.close());
  const dir = await mkdtemp(path.join(os.tmpdir(), 'snip-cli-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const name = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const output = path.join(dir, 'opened');
  await writeFile(path.join(dir, name), '#!/bin/sh\nprintf "%s" "$1" > "$SNIP_TEST_OUTPUT"\n', { mode: 0o755 });
  const result = await run(['open', 'Ab1234'], {
    SNIP_API: api.base, SNIP_TEST_OUTPUT: output, PATH: `${dir}${path.delimiter}${process.env.PATH}`,
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(output, 'utf8'), `${api.base}/destination?x=1&y=2`);
  assert.equal(destinationRequests, 0);
});

test('browser command selection and failures', async () => {
  const target = 'https://example.com/?a=1&b=2';
  assert.deepEqual(browserCommand('darwin', target), ['open', [target]]);
  assert.deepEqual(browserCommand('linux', target), ['xdg-open', [target]]);
  assert.deepEqual(browserCommand('win32', target), ['rundll32.exe', ['url.dll,FileProtocolHandler', target]]);
  await assert.rejects(openBrowser(target, 'linux', (cmd, args, callback) => callback(new Error('missing'))),
    /Could not open browser: missing/);
});

test('unreachable backend and timeout return exit 1', async t => {
  const api = await server(() => {});
  t.after(() => api.instance.closeAllConnections());
  t.after(() => api.instance.close());
  const timeout = await run(['ls'], { SNIP_API: api.base });
  assert.equal(timeout.code, 1);
  assert.match(timeout.stderr, /timed out/);
  await new Promise(resolve => api.instance.close(resolve));
  const dead = await run(['ls'], { SNIP_API: api.base });
  assert.equal(dead.code, 1);
  assert.match(dead.stderr, /API request failed/);
});
