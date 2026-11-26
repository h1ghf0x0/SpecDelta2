import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

async function waitForServer(url: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // Retry until ready
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Timed out waiting for production server at ${url}`);
}

test('npm start (tsx server.ts) boots production build, uses APP_URL canonical, and serves 200/404', async (t) => {
  const distIndex = path.resolve(process.cwd(), 'dist/index.html');
  if (!fs.existsSync(distIndex)) {
    execFileSync('npx', ['vite', 'build'], { stdio: 'ignore' });
  }

  const testPort = 3199;
  const canonicalOrigin = 'https://specdelta.example.com';
  const tsxBin = path.resolve(process.cwd(), 'node_modules/.bin/tsx');

  const child = spawn(tsxBin, ['server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(testPort),
      APP_URL: `${canonicalOrigin}/`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  t.after(() => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });

  await waitForServer(`http://127.0.0.1:${testPort}/`);
  assert.equal(stderr.includes('ERR_MODULE_NOT_FOUND'), false, `Unexpected stderr: ${stderr}`);

  const homeRes = await fetch(`http://127.0.0.1:${testPort}/`, {
    headers: { Host: 'spoofed.attacker.test', Accept: 'text/html' },
  });
  const homeHtml = await homeRes.text();
  assert.equal(homeRes.status, 200);
  assert.ok(homeHtml.includes(`<link rel="canonical" href="${canonicalOrigin}/" />`));
  assert.ok(!homeHtml.includes('spoofed.attacker.test'));

  const bluebeamRes = await fetch(`http://127.0.0.1:${testPort}/vs-bluebeam`, {
    headers: { Accept: 'text/html' },
  });
  const bluebeamHtml = await bluebeamRes.text();
  assert.equal(bluebeamRes.status, 200);
  assert.ok(
    bluebeamHtml.includes('<title>Bluebeam Compare Documents Alternative for Spec Books | SpecDelta</title>')
  );
  assert.ok(bluebeamHtml.includes(`<link rel="canonical" href="${canonicalOrigin}/vs-bluebeam" />`));

  const notFoundRes = await fetch(`http://127.0.0.1:${testPort}/nonexistent-smoke-check`, {
    headers: { Accept: 'text/html' },
  });
  const notFoundHtml = await notFoundRes.text();
  assert.equal(notFoundRes.status, 404);
  assert.ok(notFoundHtml.includes('<meta name="robots" content="noindex, nofollow" />'));
});
