import '@testing-library/jest-dom';
import path from 'path';

// Server tests write the same users.test.json / play-stats.test.json. Vitest runs
// test files in parallel workers, so give each worker its own data root instead
// of letting them delete each other's fixtures mid-run.
process.env.MUSIC_DATA_DIR ??= path.join(
  process.cwd(),
  'server',
  `.vitest-${process.env.VITEST_WORKER_ID ?? '0'}`
);

// Mock localStorage for the test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() {
      return Object.keys(store).length;
    }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// jsdom ships no matchMedia; useMediaQuery needs one. Tests drive the viewport
// through `setTestViewportWidth` below.
let testViewportWidth = 1280;

export function setTestViewportWidth(width: number) {
  testViewportWidth = width;
}

function evaluateQuery(query: string): boolean {
  const max = query.match(/max-width:\s*(\d+)px/);
  if (max) return testViewportWidth <= Number(max[1]);
  const min = query.match(/min-width:\s*(\d+)px/);
  if (min) return testViewportWidth >= Number(min[1]);
  return false;
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    media: query,
    get matches() {
      return evaluateQuery(query);
    },
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

