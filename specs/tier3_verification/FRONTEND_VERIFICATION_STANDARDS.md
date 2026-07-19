# AEGIS Frontend — Verification Standards
## Referenced by every session in the guide — read this once, apply it 19 times
## Automated-first, with an explicit, honest residual layer for what genuinely can't be automated

---

## WHY THIS DOCUMENT EXISTS

The original `FRONTEND_34_VERIFICATION.md` is a 371-line manual checklist — a human clicking through pages, checking boxes, on one resolution, two browsers. Confirmed directly: zero mentions of Playwright, Vitest, Jest, Testing Library, or axe-core anywhere in it. That's a legitimate supplementary pass; it is not a production-grade verification standard on its own, and it's a different tier of rigor than every backend session got, where every claim traced to a real command's real output.

This document is what closes that gap. Every session's own "Verify" block in the session guide is short by design — it references the specific parts of *this* document that apply, rather than repeating setup instructions 19 times. Read this document once, in full, before F01.

---

## PART 1 — TOOLING SETUP (done once, in F01, referenced forever after)

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium firefox
```

**`vitest.config.ts`** — real coverage thresholds, not aspirational ones:
```ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      // Branches lower than the rest deliberately — conditional rendering
      // branches (loading/error/empty states) are the hardest to hit 100%
      // and least worth forcing; the other three numbers are the real bar.
    },
  },
});
```

**`playwright.config.ts`** — CI-deterministic from the start, not retrofitted after the first flaky run:
```ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  ],
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.02 } },
  // 1440×900 matches FRONTEND_34's original resolution choice — preserved,
  // not arbitrarily changed, since AEGIS is confirmed desktop-only (≥1280px).
});
```

---

## PART 2 — FUNCTIONAL CORRECTNESS (Vitest + React Testing Library)

**Applies to:** every component, every Zustand store, every TanStack Query hook, across all 19 sessions.

**Standard:** every `Component.tsx` gets a co-located `Component.test.tsx`. Test user-visible behavior (what renders, what fires on interaction), never internal implementation detail (no testing state variable names, no shallow-rendering internals) — this is the standard Testing Library's own philosophy enforces, and it's what keeps tests from breaking on harmless refactors.

**Store and hook standard, specifically because this is where the original checklist had zero coverage:** every Zustand store and TanStack Query hook must have a test for:
1. The success path.
2. The error path (a rejected promise / a WebSocket error message).
3. **A race condition** — a mutation firing while a related query is still in flight, confirming the eventual state is correct, not whichever resolved last by accident. This is the single most common real bug class in Zustand + TanStack Query apps and the original checklist never mentions it once.

**Command, run at the end of every session:**
```bash
npx vitest run --coverage
```
**Session is not complete if coverage drops below Part 1's thresholds for any new file.**

---

## PART 3 — VISUAL REGRESSION (Playwright, applied correctly)

**Applies to:** any session producing a visually distinct component or page (most of F02–F19).

**The real, current-practice rules, not "just enable screenshots":**
1. **Component-level screenshots, not full-page.** Faster, smaller diffs, and a failure tells you exactly which component broke instead of "something on this page changed."
2. **Mask everything dynamic, explicitly, per screenshot** — timestamps (`formatDateLocalized` output), streaming chat bubble content mid-generation, live metric values, avatar images. An unmasked dynamic element is the single most common cause of visual-test flake.
3. **Disable animations before capture** (`animations: 'disabled'`, already set globally in Part 1's config) — an animation mid-frame is not a real regression, it's a timing accident.
4. **Per-component thresholds, not one global number.** A data table with dense text tolerates more pixel drift than the AEGIS logo does; set `maxDiffPixelRatio` per test where the default 0.02 isn't right, not project-wide.
5. **Baselines committed to git**, reviewed in PRs like code — they're test artifacts, not build output.

**Command:**
```bash
npx playwright test --project=chromium --project=firefox -g "visual"
```

---

## PART 4 — ACCESSIBILITY (`@axe-core/playwright`, WCAG 2.2 AA, plus an honest manual layer)

**Applies to:** every page, every session from F05 onward.

**Automated gate, every session, zero-tolerance:**
```ts
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
  .analyze();
expect(results.violations).toEqual([]);
```
**Zero violations is a hard CI gate, not a warning to review later** — axe-core is engineered for zero false positives on the rules it ships, so a violation reported is a violation real.

**The honest part, stated explicitly rather than implied away:** automated scanning catches roughly 30–40% of real WCAG issues. The rest — logical tab order, screen-reader announcement quality, whether an error message is actually helpful when heard rather than read — categorically requires a human. **Every session touching a new page or interactive flow requires one real manual pass:** keyboard-only navigation (no mouse) through the full flow, plus one real screen reader (NVDA, free, current) confirming the page announces sensibly. This is not optional or "nice to have" — it's the residual layer automation cannot replace, made explicit rather than silently skipped.

---

## PART 5 — PERFORMANCE (Lighthouse CI, calibrated to what AEGIS actually is)

**Applies to:** F14 (analytics), F17 (dedicated performance session), and the final F18 full-app pass.

Given AEGIS is confirmed desktop-only with no public traffic, the framework targets Lighthouse's **lab** thresholds directly — real Core Web Vitals field data (CrUX, 75th percentile, 28-day rolling window) will never populate for an internal tool with no public visitors, so chasing it would be measuring nothing. Corrected metric naming from `FRONTEND_28_PERFORMANCE.md`'s "FID / INP" (these are two different metrics; FID was fully retired in March 2024, not renamed):

```bash
npx lighthouse http://localhost:3000/chat --preset=desktop --output=json --output-path=./lighthouse-results.json
```
| Metric | Target | Source |
|---|---|---|
| LCP | < 2.5s | Confirmed current standard |
| INP | < 200ms | Confirmed current standard (not FID — FID is retired) |
| CLS | < 0.1 | Confirmed current standard |
| Performance score | ≥ 90 | Lighthouse lab score, desktop preset |

---

## PART 6 — SECURITY (new — the original spec had zero security-specific tests)

**Applies to:** F03 (auth infrastructure), F09 (chat — LLM-generated content rendering), F18 (final pass).

**Session token storage — automated, not assumed from design intent:**
```ts
const storage = await page.evaluate(() => ({ ls: {...localStorage}, ss: {...sessionStorage} }));
expect(JSON.stringify(storage)).not.toContain('eyJ'); // no JWT fragment in browser storage, anywhere
```

**Cookie flags — confirmed, not trusted from the route handler's source code alone:**
```ts
const cookies = await context.cookies();
const session = cookies.find(c => c.name === 'session');
expect(session?.httpOnly).toBe(true);
expect(session?.sameSite).toBe('Lax');
```

**XSS surface specific to AEGIS — chat renders LLM-generated markdown, a real injection path a generic checklist wouldn't think to test:**
```ts
grep -rn "dangerouslySetInnerHTML" src/components/chat/
# any match must go through a sanitizer (e.g. rehype-sanitize in the markdown
# pipeline) — confirm the sanitizer is actually wired in, not just present in
# package.json
```

---

## PART 7 — THE RESIDUAL MANUAL LAYER (what genuinely can't be automated)

The original checklist's specific feature-flow assertions (per-page smoke tests, exact interaction sequences) are preserved here, not discarded — they're real, useful content, just demoted from "the whole verification strategy" to "the necessary final 10%": subjective animation feel, cross-browser rendering quirks a screenshot diff's threshold intentionally tolerates, and end-to-end judgment calls ("does this actually feel responsive") that no assertion can make for you. Each session's guide entry names its specific residual items explicitly — a short list, not a 371-line substitute for automation.

---

## GATE — A SESSION IS NOT COMPLETE UNTIL

- [ ] `npx vitest run --coverage` passes, meets Part 1's thresholds.
- [ ] `npx playwright test` (functional + visual) passes on both Chromium and Firefox.
- [ ] Zero axe-core violations at WCAG 2.2 AA on every new/changed page.
- [ ] One real manual keyboard-only + screen-reader pass completed for any new interactive flow.
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] The session's specific residual manual checklist (named in its own guide entry) completed.
