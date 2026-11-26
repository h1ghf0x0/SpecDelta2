import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { SEO_ROUTE_META, VALID_APP_ROUTES } from './src/data/seoRoutesMeta.ts';
import type { AppRoute } from './src/types/spec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ChangedParagraphInput {
  oldText: string;
  newText: string;
  riskFlags: string[];
}

interface SectionDiffInput {
  sectionCode: string;
  division: string;
  title: string;
  status: 'modified' | 'added' | 'deleted';
  changedParagraphs: ChangedParagraphInput[];
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHtmlNavigationRequest(req: express.Request): boolean {
  if (req.method !== 'GET') return false;
  const reqPath = req.path;
  if (
    reqPath.startsWith('/api/') ||
    reqPath === '/api' ||
    reqPath.startsWith('/src/') ||
    reqPath.startsWith('/@') ||
    reqPath.startsWith('/node_modules/') ||
    reqPath.startsWith('/assets/')
  ) {
    return false;
  }
  if (path.extname(reqPath)) return false;
  const accept = req.headers.accept ?? '';
  return !accept || accept.includes('text/html') || accept.includes('*/*');
}

function renderRouteSeoHtml(
  templateHtml: string,
  reqPath: string,
  origin: string
): { status: number; html: string } {
  const cleanPath = reqPath.replace(/\/+$/, '') || '/';
  const isValid = VALID_APP_ROUTES.has(cleanPath as AppRoute);
  const status = isValid ? 200 : 404;

  const meta = isValid
    ? SEO_ROUTE_META[cleanPath as AppRoute]
    : {
        title: 'Page Not Found (404) | SpecDelta',
        description: 'The requested SpecDelta page could not be found.',
        h1: '404 — Route Not Found',
        summary:
          'That SpecDelta page does not exist. Return to the Spec Diff Checker or CSI Spec Book Splitter.',
      };

  const titleEsc = escapeHtmlAttr(meta.title);
  const descEsc = escapeHtmlAttr(meta.description);
  const robotsContent = isValid ? 'index, follow' : 'noindex, nofollow';
  const canonicalUrl = isValid ? escapeHtmlAttr(`${origin}${cleanPath}`) : '';

  let html = templateHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleEsc}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/i,
      `<meta name="description" content="${descEsc}" />`
    )
    .replace(
      /<meta\s+property="og:title"[\s\S]*?\/>/i,
      `<meta property="og:title" content="${titleEsc}" />`
    )
    .replace(
      /<meta\s+property="og:description"[\s\S]*?\/>/i,
      `<meta property="og:description" content="${descEsc}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"[\s\S]*?\/>/i,
      `<meta name="twitter:title" content="${titleEsc}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
      `<meta name="twitter:description" content="${descEsc}" />`
    );

  const extraHeadTags = [
    `<meta name="robots" content="${robotsContent}" />`,
    ...(canonicalUrl
      ? [
          `<meta property="og:url" content="${canonicalUrl}" />`,
          `<link rel="canonical" href="${canonicalUrl}" />`,
        ]
      : []),
  ].join('\n    ');

  html = html.replace('</head>', `    ${extraHeadTags}\n  </head>`);

  const noscriptBlock = `<div id="root"><noscript><main style="font-family:sans-serif;max-width:780px;margin:40px auto;padding:0 16px"><h1>${escapeHtmlAttr(meta.h1)}</h1><p>${escapeHtmlAttr(meta.summary)}</p><nav><a href="/">Spec Diff Checker</a> · <a href="/split-spec-book">CSI Spec Splitter</a> · <a href="/vs-bluebeam">SpecDelta vs Bluebeam</a> · <a href="/benchmark">Benchmark</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></nav></main></noscript></div>`;
  html = html.replace(/<div id="root"><\/div>/i, noscriptBlock);

  return { status, html };
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.set('trust proxy', 1);

function resolveCanonicalOrigin(): string {
  const raw = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
  if (raw && raw !== 'MY_APP_URL') {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Fallback below
    }
  }
  return process.env.NODE_ENV === 'production'
    ? 'https://specdelta.app'
    : `http://localhost:${PORT}`;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const ipRequestTimestamps = new Map<string, number[]>();

function checkScopeBriefRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipRequestTimestamps.get(ip) ?? []).filter((ts) => ts > cutoff);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    ipRequestTimestamps.set(ip, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  ipRequestTimestamps.set(ip, recent);

  if (ipRequestTimestamps.size > 1000) {
    for (const [key, list] of ipRequestTimestamps.entries()) {
      const kept = list.filter((ts) => ts > cutoff);
      if (kept.length === 0) ipRequestTimestamps.delete(key);
      else ipRequestTimestamps.set(key, kept);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

app.use(express.json({ limit: '2mb' }));

app.post('/api/scope-brief', async (req, res) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkScopeBriefRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
      res.status(429).json({
        error: `Rate limit exceeded (max ${RATE_LIMIT_MAX_REQUESTS} AI briefs per 15 minutes). Retry in ${rateCheck.retryAfterSeconds}s or continue using deterministic risk flags.`,
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured in Settings > Secrets. Add a Gemini API key to generate AI Scope Impact Briefs, or continue using local deterministic risk flags.',
      });
      return;
    }

    const sections = req.body?.sections as SectionDiffInput[] | undefined;
    if (!Array.isArray(sections) || sections.length === 0) {
      res.status(400).json({ error: 'No changed specification sections provided.' });
      return;
    }

    const totalChangedCount =
      typeof req.body?.totalChangedCount === 'number' && req.body.totalChangedCount >= sections.length
        ? Math.round(req.body.totalChangedCount)
        : sections.length;

    // Prioritize highest-risk and largest-delta sections before capping payload to 25
    const ranked = [...sections].sort((a, b) => {
      const aRisks = a.changedParagraphs.reduce((sum, p) => sum + p.riskFlags.length, 0);
      const bRisks = b.changedParagraphs.reduce((sum, p) => sum + p.riskFlags.length, 0);
      if (aRisks !== bRisks) return bRisks - aRisks;
      return b.changedParagraphs.length - a.changedParagraphs.length;
    });

    const selected = ranked.slice(0, 25);

    // Only transmit compact changed paragraphs (never full spec manuals)
    const condensed = selected.map((s) => ({
      sectionCode: s.sectionCode,
      division: s.division,
      title: s.title,
      status: s.status,
      changes: s.changedParagraphs.slice(0, 8).map((p) => ({
        oldText: p.oldText.slice(0, 700),
        newText: p.newText.slice(0, 700),
        riskFlags: p.riskFlags,
      })),
    }));

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `You are a senior commercial construction chief estimator reviewing isolated specification changes between an original Project Manual and an Addendum.
Analyze ONLY the following changed specification excerpts (the top ${condensed.length} risk-ranked sections out of ${totalChangedCount} changed sections) and produce an executive 5-bullet (or fewer if fewer than 5 distinct changes exist) Cost & Scope Impact Brief for bid day.
Focus strictly on hard cost drivers, material/tolerance upgrades (PSI, mil, gauge), scope transfers (furnish vs. install, by Owner), allowances, warranties, and lead-time risks.
Do not invent sections or values that are not present in the provided JSON.

Changed Excerpts:
${JSON.stringify(condensed, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'Return concise, concrete estimator guidance grounded strictly in the supplied changed specification excerpts. Keep the executive summary under 45 words and produce up to 5 actionable bullets.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: 'One concise 1-2 sentence bid-day summary of overall cost and scope exposure.',
            },
            bullets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sectionCode: {
                    type: Type.STRING,
                    description: 'CSI section code such as 03 30 00 or 08 71 00.',
                  },
                  impactCategory: {
                    type: Type.STRING,
                    description: 'Short category like Material Upgrade, Scope Shift, Allowance, Warranty, or Lead Time.',
                  },
                  headline: {
                    type: Type.STRING,
                    description: 'Crisp 6-10 word estimator takeaway.',
                  },
                  detail: {
                    type: Type.STRING,
                    description: 'Specific quantitative or contractual delta from old to new text.',
                  },
                },
                required: ['sectionCode', 'impactCategory', 'headline', 'detail'],
              },
            },
          },
          required: ['executiveSummary', 'bullets'],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw);
    res.json({
      ...parsed,
      sectionsSentCount: condensed.length,
      totalChangedSections: totalChangedCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate Scope Impact Brief.';
    const status = message.includes('403') || message.includes('PERMISSION_DENIED') ? 403 : 500;
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      if (!isHtmlNavigationRequest(req)) {
        return next();
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        const rawTemplate = fs.readFileSync(indexPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const { status, html } = renderRouteSeoHtml(transformed, req.path, resolveCanonicalOrigin());
        res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexFile = path.join(distDir, 'index.html');
    const cachedTemplate = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf-8') : null;

    app.use(express.static(distDir, { index: false }));

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API route not found.' });
        return;
      }
      if (path.extname(req.path)) {
        res.status(404).send('Not found.');
        return;
      }
      if (!cachedTemplate) {
        res.status(404).send('Build output not found.');
        return;
      }
      const { status, html } = renderRouteSeoHtml(cachedTemplate, req.path, resolveCanonicalOrigin());
      res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SpecDelta server listening on http://localhost:${PORT}`);
  });
}

startServer();
