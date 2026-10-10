import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Only these two files are ever loaded into a prompt.
 *
 * `pricing.md` is the source of truth for rates and is deliberately NOT in this
 * repo. If it ever appears, loading fails loudly rather than quietly leaking a
 * rate card into the model's context.
 */
const ALLOWED = ['qualified.md', 'services.md'] as const;
const FORBIDDEN = ['pricing.md', 'pricing.markdown', 'rates.md'];

const dir = () => join(process.cwd(), 'knowledge');

let cache: { qualified: string; services: string } | null = null;

export function loadKnowledge(): { qualified: string; services: string } {
  const base = dir();

  // Checked on every call, ahead of the cache: a rate card that appears after the
  // first load must still stop the agent rather than ride along on a warm cache.
  for (const f of FORBIDDEN) {
    if (existsSync(join(base, f))) {
      throw new Error(
        `THE CUT: ${f} must never be available to the agent. Remove knowledge/${f}.`,
      );
    }
  }

  if (cache) return cache;

  const stray = existsSync(base)
    ? readdirSync(base).filter((f) => f.endsWith('.md') && !ALLOWED.includes(f as never))
    : [];
  if (stray.length > 0) {
    console.warn(`[knowledge] ignoring files not on the allowlist: ${stray.join(', ')}`);
  }

  cache = {
    qualified: readFileSync(join(base, 'qualified.md'), 'utf8'),
    services: readFileSync(join(base, 'services.md'), 'utf8'),
  };
  return cache;
}
