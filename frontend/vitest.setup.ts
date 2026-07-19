import "@testing-library/jest-dom/vitest"

// jsdom doesn't implement ResizeObserver — needed by cmdk (CommandPalette)
// and recharts (ResponsiveContainer), both real dependencies as of F05b.
// Global rather than per-test-file since it's cross-cutting DOM
// infrastructure, not behavior specific to any one component's test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub

// jsdom doesn't implement scrollIntoView either — cmdk calls it when the
// active command item changes.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom doesn't implement matchMedia — useMediaQuery (usePrefersReducedMotion,
// useIsOptimalWidth) is now used by real components as of F06. Defaults to
// "no match" (e.g. no reduced-motion preference), matching a typical
// browser default; individual tests that need a specific match state
// still stub window.matchMedia locally, as several already do.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
