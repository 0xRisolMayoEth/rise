'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withRetry } = require('../src/utils/retry');

test('resolves after transient failures', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    },
    { retries: 3, baseMs: 1 }
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('fails fast when shouldRetry returns false', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error('permanent');
      },
      { retries: 3, baseMs: 1, shouldRetry: () => false }
    ),
    /permanent/
  );
  assert.equal(calls, 1);
});

test('gives up after exhausting retries', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error('down');
      },
      { retries: 2, baseMs: 1 }
    ),
    /down/
  );
  assert.equal(calls, 3); // 1 initial + 2 retries
});

test('onRetry receives attempt number and wait time', async () => {
  const seen = [];
  await withRetry(
    async () => {
      if (seen.length < 1) throw new Error('once');
      return true;
    },
    { retries: 1, baseMs: 4, onRetry: (_e, attempt, waitMs) => seen.push([attempt, waitMs]) }
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], 1);
  assert.ok(seen[0][1] >= 2 && seen[0][1] <= 4);
});
