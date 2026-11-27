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
    bluebeamHtml.includes('<title>Bluebeam Compare Alternative for Spec Books | SpecDelta</title>')
  );
  assert.ok(bluebeamHtml.includes(`<link rel="canonical" href="${canonicalOrigin}/vs-bluebeam" />`));

  const notFoundRes = await fetch(`http://127.0.0.1:${testPort}/nonexistent-smoke-check`, {
    headers: { Accept: 'text/html' },
  });
  const notFoundHtml = await notFoundRes.text();
  assert.equal(notFoundRes.status, 404);
  assert.ok(notFoundHtml.includes('<meta name="robots" content="noindex, nofollow" />'));
  assert.equal(notFoundRes.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(notFoundRes.headers.get('x-powered-by'), null);

  // Malformed JSON must return clean 400 JSON instead of HTML stack trace
  const badJsonRes = await fetch(`http://127.0.0.1:${testPort}/api/scope-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad json',
  });
  assert.equal(badJsonRes.status, 400);
  const badJsonBody = (await badJsonRes.json()) as { error?: string };
  assert.equal(badJsonBody.error, 'Invalid JSON request body.');

  // Missing riskFlags in changedParagraphs must return 400 validation error, never 500
  const invalidSchemaRes = await fetch(`http://127.0.0.1:${testPort}/api/scope-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sections: [
        {
          sectionCode: '03 30 00',
          division: '03 - Concrete',
          title: 'CAST-IN-PLACE CONCRETE',
          status: 'modified',
          changedParagraphs: [{ oldText: '3000 psi', newText: '4000 psi' }],
        },
      ],
    }),
  });
  assert.equal(invalidSchemaRes.status, 400);
  const invalidSchemaBody = (await invalidSchemaRes.json()) as { error?: string };
  assert.ok(invalidSchemaBody.error?.includes('riskFlags'));
});
