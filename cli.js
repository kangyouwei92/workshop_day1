#!/usr/bin/env node
'use strict';

const { execFile } = require('node:child_process');

const usage = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open the original URL in your browser
  snip help         Show this help

Set SNIP_API to the API base URL (default: http://localhost:3000).`;

function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  return url;
}

function apiBase() {
  const url = httpUrl(process.env.SNIP_API || 'http://localhost:3000', 'SNIP_API');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('SNIP_API must not contain credentials, a query, or a fragment.');
  }
  return url.href.replace(/\/+$/, '');
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('API request timed out.');
    throw new Error(`API request failed: ${error.message}`);
  }
  if (!response.ok && response.status !== 302) {
    let message = `API returned HTTP ${response.status}`;
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed.error === 'string' && parsed.error) message += `: ${parsed.error}`;
    } catch {
      // Error responses are not guaranteed to be JSON.
    }
    throw new Error(message);
  }
  return response;
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('API returned invalid JSON.');
  }
}

function browserCommand(platform, url) {
  if (platform === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  if (platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

function openBrowser(url, platform = process.platform, run = execFile) {
  const [command, args] = browserCommand(platform, url);
  return new Promise((resolve, reject) => {
    run(command, args, (error) => {
      if (error) reject(new Error(`Could not open browser: ${error.message}`));
      else resolve();
    });
  });
}

async function main(args) {
  const [command, ...rest] = args;
  if ((!command || ['help', '--help', '-h'].includes(command)) && rest.length === 0) {
    console.log(usage);
    return;
  }
  if (command === 'add' && rest.length === 1) {
    httpUrl(rest[0], 'URL');
    const response = await request('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rest[0] }),
    });
    if (response.status !== 201) throw new Error(`Unexpected API status: ${response.status}`);
    const link = await json(response);
    if (!link || typeof link.shortUrl !== 'string') throw new Error('API returned an invalid link.');
    httpUrl(link.shortUrl, 'Short URL');
    console.log(link.shortUrl);
    return;
  }
  if (command === 'ls' && rest.length === 0) {
    const response = await request('/api/links');
    if (response.status !== 200) throw new Error(`Unexpected API status: ${response.status}`);
    const links = await json(response);
    if (!Array.isArray(links) || links.some(link => !link || typeof link.code !== 'string' ||
      typeof link.hits !== 'number' || typeof link.url !== 'string')) {
      throw new Error('API returned an invalid links list.');
    }
    if (!links.length) {
      console.log('No links yet.');
      return;
    }
    const codeWidth = Math.max(4, ...links.map(link => link.code.length));
    const hitsWidth = Math.max(4, ...links.map(link => String(link.hits).length));
    console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
    for (const link of links) {
      console.log(`${link.code.padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`);
    }
    return;
  }
  if (command === 'open' && rest.length === 1) {
    if (!/^[a-zA-Z0-9]{6}$/.test(rest[0])) throw new Error('Code must be six base62 characters.');
    const response = await request(`/${rest[0]}`, { redirect: 'manual' });
    if (response.status !== 302) throw new Error(`Expected a redirect, got HTTP ${response.status}.`);
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect did not include a Location header.');
    let target;
    try {
      target = new URL(location, response.url).href;
    } catch {
      throw new Error('Redirect Location is invalid.');
    }
    httpUrl(target, 'Redirect Location');
    await openBrowser(target);
    return;
  }
  throw new Error(`Invalid arguments.\n${usage}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, browserCommand, openBrowser };
