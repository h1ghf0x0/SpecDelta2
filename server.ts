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
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

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

// NOTE: In-memory counters protect single-instance deployments; multi-replica production should swap to a shared Redis counter.
const rawDailyCap = Number(process.env.SCOPE_BRIEF_DAILY_CAP);
const SCOPE_BRIEF_DAILY_CAP =
  Number.isFinite(rawDailyCap) && rawDailyCap > 0 ? Math.floor(rawDailyCap) : 200;
let dailyCapDate = new Date().toISOString().slice(0, 10);
let dailyRequestCount = 0;

function checkDailyQuota(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCapDate) {
    dailyCapDate = today;
    dailyRequestCount = 0;
  }
  if (dailyRequestCount >= SCOPE_BRIEF_DAILY_CAP) {
    return false;
  }
  dailyRequestCount += 1;
  return true;
}

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

const VALID_INPUT_STATUSES = new Set(['modified', 'added', 'deleted']);

function validateScopeBriefPayload(
  body: unknown
): { ok: true; sections: SectionDiffInput[]; totalChangedCount: number } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    return { ok: false, error: 'sections must be a non-empty array of changed specification sections.' };
  }
  if (obj.sections.length > 200) {
    return { ok: false, error: 'sections exceeds the maximum batch size of 200 sections.' };
  }

  const sanitizedSections: SectionDiffInput[] = [];
  for (let i = 0; i < obj.sections.length; i++) {
    const sec = obj.sections[i];
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) {
      return { ok: false, error: `sections[${i}] must be an object.` };
    }
    const s = sec as Record<string, unknown>;
    if (typeof s.sectionCode !== 'string' || s.sectionCode.trim().length === 0 || s.sectionCode.length > 40) {
      return { ok: false, error: `sections[${i}].sectionCode must be a valid non-empty string.` };
    }
    if (typeof s.division !== 'string' || s.division.length > 120) {
      return { ok: false, error: `sections[${i}].division must be a string.` };
    }
    if (typeof s.title !== 'string' || s.title.length > 300) {
      return { ok: false, error: `sections[${i}].title must be a string.` };
    }
    if (typeof s.status !== 'string' || !VALID_INPUT_STATUSES.has(s.status)) {
      return { ok: false, error: `sections[${i}].status must be modified, added, or deleted.` };
    }
    if (!Array.isArray(s.changedParagraphs)) {
      return { ok: false, error: `sections[${i}].changedParagraphs must be an array.` };
    }

    const cleanParagraphs: ChangedParagraphInput[] = [];
    for (let j = 0; j < s.changedParagraphs.length; j++) {
      const para = s.changedParagraphs[j];
      if (!para || typeof para !== 'object' || Array.isArray(para)) {
        return { ok: false, error: `sections[${i}].changedParagraphs[${j}] must be an object.` };
      }
      const p = para as Record<string, unknown>;
      if (typeof p.oldText !== 'string' || typeof p.newText !== 'string') {
        return {
          ok: false,
          error: `sections[${i}].changedParagraphs[${j}] must include string oldText and newText.`,
        };
      }
      if (!Array.isArray(p.riskFlags) || !p.riskFlags.every((rf) => typeof rf === 'string')) {
        return {
          ok: false,
          error: `sections[${i}].changedParagraphs[${j}].riskFlags must be an array of strings.`,
        };
      }
      cleanParagraphs.push({
        oldText: p.oldText,
        newText: p.newText,
        riskFlags: p.riskFlags.slice(0, 20),
      });
    }

    sanitizedSections.push({
      sectionCode: s.sectionCode.trim(),
      division: s.division.trim(),
      title: s.title.trim(),
      status: s.status as SectionDiffInput['status'],
      changedParagraphs: cleanParagraphs,
    });
  }

  const totalChangedCount =
    typeof obj.totalChangedCount === 'number' &&
    Number.isFinite(obj.totalChangedCount) &&
    obj.totalChangedCount >= sanitizedSections.length
      ? Math.round(obj.totalChangedCount)
      : sanitizedSections.length;

  return { ok: true, sections: sanitizedSections, totalChangedCount };
}

app.use(express.json({ limit: '2mb' }));

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (
      err instanceof SyntaxError &&
      'status' in err &&
      (err as { status?: number }).status === 400
    ) {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    next(err);
  }
);

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

    const validation = validateScopeBriefPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
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

    if (!checkDailyQuota()) {
      res.status(429).json({
        error:
          'Daily AI Scope Brief quota reached for this server instance. Continue using local deterministic risk flags or retry tomorrow.',
      });
      return;
    }

    const { sections, totalChangedCount } = validation;

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

    const requestConfig = {
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
    };

    const modelsToTry = ['gemini-4-hydrogen', 'gemini-2.5-flash'] as const;
    let responseText = '';
    let lastModelErr: unknown = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: requestConfig,
        });
        responseText = (response.text ?? '{}').trim();
        lastModelErr = null;
        break;
      } catch (modelErr: unknown) {
        lastModelErr = modelErr;
        const msg = modelErr instanceof Error ? modelErr.message : '';
        if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
          throw modelErr;
        }
      }
    }

    if (lastModelErr) {
      throw lastModelErr;
    }

    const parsed = JSON.parse(responseText || '{}') as Record<string, unknown>;
    res.json({
      ...parsed,
      sectionsSentCount: condensed.length,
      totalChangedSections: totalChangedCount,
    });
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scope-brief] generation failed:', rawMsg);
    if (rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('API_KEY_INVALID')) {
      res.status(403).json({
        error:
          'Gemini API authorization failed. Verify GEMINI_API_KEY in server configuration or continue using local deterministic risk flags.',
      });
      return;
    }
    if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      res.status(429).json({
        error:
          'Upstream Gemini rate limit reached. Please retry shortly or continue using local deterministic risk flags.',
      });
      return;
    }
    res.status(502).json({
      error:
        'Unable to generate AI Scope Impact Brief right now. Continue using local deterministic risk flags.',
    });
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
