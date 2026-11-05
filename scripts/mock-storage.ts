// In-memory localStorage for Node test scripts. Import this first.
export const mem: Record<string, string> = {}
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => void (mem[k] = v),
  removeItem: (k: string) => void delete mem[k],
} as Storage
