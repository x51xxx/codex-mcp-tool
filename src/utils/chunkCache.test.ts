import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheChunks, getChunks, isValidCacheKey } from './chunkCache.js';

test('cache keys that could leave the cache directory are rejected', () => {
  for (const key of [
    '../../etc/passwd',
    '../x',
    'abc',
    'ABCDEF0123456789',
    '0123456789abcdef/..',
  ]) {
    assert.equal(isValidCacheKey(key), false, key);
    assert.equal(getChunks(key), null, key);
  }
});

test('chunks round-trip through the cache with a random 16-hex key', () => {
  const chunks = [{ edits: [], chunkIndex: 1, totalChunks: 1, hasMore: false, estimatedChars: 0 }];
  const a = cacheChunks('same prompt', chunks as never);
  const b = cacheChunks('same prompt', chunks as never);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, b, 'the same prompt in two runs must not share a key');
  assert.deepEqual(getChunks(a), chunks);
});
