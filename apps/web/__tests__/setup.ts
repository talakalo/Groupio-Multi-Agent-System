import "@testing-library/jest-dom/vitest";

// Mock scrollIntoView which is not implemented in jsdom
Element.prototype.scrollIntoView = () => {};

// Provide a working localStorage so Zustand's persist middleware doesn't receive
// undefined. In Node.js 22+, `localStorage` resolves to the experimental built-in
// (which is undefined unless --localstorage-file is provided) BEFORE jsdom can
// override the global — causing Zustand's createJSONStorage to cache undefined.
// This baseline mock is defined configurable+writable so individual test files
// can replace it with their own spy mock via Object.defineProperty or vi.stubGlobal.
class _LocalStorageMock {
  private _store: Record<string, string> = {};
  getItem(key: string) { return key in this._store ? this._store[key] : null; }
  setItem(key: string, value: string) { this._store[key] = value; }
  removeItem(key: string) { delete this._store[key]; }
  clear() { this._store = {}; }
  get length() { return Object.keys(this._store).length; }
  key(index: number) { return Object.keys(this._store)[index] ?? null; }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new _LocalStorageMock(),
  writable: true,
  configurable: true,
});
