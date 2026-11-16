import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'bundle');
const frontend = join(root, 'frontend');
const push = process.argv.slice(2);
if (push.some((arg) => arg !== '--push') || push.length > 1) {
  throw new Error('Usage: node scripts/build-bundle.mjs [--push]');
}

function run(command, args, cwd = root, capture = false) {
  const output = execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  return capture ? output.trim() : '';
}

function git(args, cwd = root, capture = false) {
  return run('git', args, cwd, capture);
}

function requireClean(cwd, label) {
  if (git(['status', '--porcelain', '--untracked-files=all'], cwd, true)) {
    throw new Error(`${label} has uncommitted changes; preserve them before building`);
  }
}

if (git(['branch', '--show-current'], root, true) !== 'main') {
  throw new Error('Run this script from a main branch checkout');
}
requireClean(root, 'Superproject');
git(['submodule', 'update', '--init', 'backend', 'frontend', 'cli', 'bundle']);
for (const name of ['backend', 'frontend', 'cli', 'bundle']) {
  requireClean(join(root, name), name);
}
if (git(['status', '--porcelain', '--ignored', '--', 'public'], bundle, true)) {
  throw new Error('bundle/public contains uncommitted or ignored files');
}

git(['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli']);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (process.platform === 'win32') {
  run('cmd.exe', ['/d', '/s', '/c', npm, 'ci'], frontend);
  run('cmd.exe', ['/d', '/s', '/c', npm, 'run', 'build'], frontend);
} else {
  run(npm, ['ci'], frontend);
  run(npm, ['run', 'build'], frontend);
}

const output = join(frontend, 'dist', 'snip-frontend', 'browser');
if (!existsSync(join(output, 'index.html'))) {
  throw new Error(`Missing frontend build output: ${join(output, 'index.html')}`);
}

rmSync(join(bundle, 'public'), { recursive: true, force: true });
mkdirSync(join(bundle, 'public'), { recursive: true });
cpSync(output, join(bundle, 'public'), { recursive: true });
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
writeFileSync(join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
writeFileSync(join(bundle, 'package.json'), JSON.stringify({
  name: 'snip-bundle',
  private: true,
  scripts: { start: 'bun server.js' },
}, null, 2) + '\n');
writeFileSync(join(bundle, 'Dockerfile'), [
  'FROM oven/bun:1-alpine',
  'WORKDIR /app',
  'COPY . .',
  'ENV PORT=3000',
  'EXPOSE 3000',
  'CMD ["bun", "server.js"]',
  '',
].join('\n'));
writeFileSync(join(bundle, '.dockerignore'), '.git\nnode_modules\n');
writeFileSync(join(bundle, 'railway.json'), JSON.stringify({
  build: { builder: 'DOCKERFILE' },
}, null, 2) + '\n');

git(['add', '-A', '--', 'server.js', 'cli.js', 'public', 'package.json',
  'Dockerfile', '.dockerignore', 'railway.json'], bundle);
git(['add', '-f', '--', '.env'], bundle);
const bundleChanged = git(['diff', '--cached', '--name-only'], bundle, true);
if (bundleChanged) {
  git(['commit', '-m', 'Generate application bundle',
    '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    '-m', 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>'], bundle);
} else {
  console.log('Bundle unchanged');
}

git(['add', '--', 'backend', 'frontend', 'cli', 'bundle']);
const mainChanged = git(['diff', '--cached', '--name-only'], root, true);
if (mainChanged) {
  git(['commit', '-m', 'Update release submodule pointers',
    '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    '-m', 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>']);
} else {
  console.log('Superproject unchanged');
}
if (push.includes('--push')) {
  git(['push', 'origin', 'HEAD:refs/heads/bundle'], bundle);
  git(['push', 'origin', 'HEAD:refs/heads/main']);
}
