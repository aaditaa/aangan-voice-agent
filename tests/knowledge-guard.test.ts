import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadKnowledge } from '../lib/knowledge.ts';

const pricing = join(process.cwd(), 'knowledge', 'pricing.md');

test('the rubric and the services file load, and carry their real content', () => {
  const k = loadKnowledge();
  assert.match(k.qualified, /five criteria/i);
  assert.match(k.services, /Pune city/);
});

test('pricing.md stops the agent dead, even on a warm cache', () => {
  assert.equal(existsSync(pricing), false, 'pricing.md must not be committed to this repo');
  loadKnowledge(); // warm the cache first — the guard must still fire
  writeFileSync(pricing, '# rates\nFull home: 1,800 per sq ft.\n');
  try {
    assert.throws(() => loadKnowledge(), /THE CUT: pricing\.md must never be available/);
  } finally {
    rmSync(pricing, { force: true });
  }
  assert.equal(existsSync(pricing), false, 'test must leave the repo clean');
  assert.ok(loadKnowledge().qualified.length > 0, 'loading works again once it is gone');
});
