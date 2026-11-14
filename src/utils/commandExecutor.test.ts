import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommandDetailed } from './commandExecutor.js';
import { runWithRequestContext } from './requestContext.js';

const posixOnly = { skip: process.platform === 'win32' ? 'uses POSIX sleep/yes' : false };

test('cancelling the request stops the child and reports aborted', posixOnly, async () => {
  const ac = new AbortController();
  const started = Date.now();
  const pending = runWithRequestContext({ signal: ac.signal }, () =>
    executeCommandDetailed('sleep', ['30'], { timeoutMs: 60_000 })
  );
  setTimeout(() => ac.abort(), 200);
  const r = await pending;
  assert.equal(r.ok, false);
  assert.equal(r.aborted, true);
  assert.equal(r.timedOut, false);
  assert.ok(Date.now() - started < 10_000, 'process should stop promptly');
});

test('an already-cancelled request spawns nothing', posixOnly, async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await runWithRequestContext({ signal: ac.signal }, () =>
    executeCommandDetailed('sleep', ['30'])
  );
  assert.equal(r.aborted, true);
  assert.equal(r.code, null);
});

test('timeoutMs of 0 or below means "use the default", not "kill now"', posixOnly, async () => {
  for (const timeoutMs of [0, -5]) {
    const r = await executeCommandDetailed('sh', ['-c', 'sleep 0.2; echo ok'], { timeoutMs });
    assert.equal(r.ok, true, `timeoutMs=${timeoutMs}`);
    assert.equal(r.stdout, 'ok');
  }
});

test('a real timeout is reported as timedOut', posixOnly, async () => {
  const r = await executeCommandDetailed('sleep', ['30'], { timeoutMs: 200 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
});

test('output overflow is reported as outputExceeded, not as a timeout', posixOnly, async () => {
  const r = await executeCommandDetailed('yes', [], { maxOutputBytes: 10_000, timeoutMs: 30_000 });
  assert.equal(r.ok, false);
  assert.equal(r.outputExceeded, true);
  assert.equal(r.timedOut, false);
});

test('only the tail of stderr is kept', posixOnly, async () => {
  const r = await executeCommandDetailed('sh', [
    '-c',
    'head -c 3000000 /dev/zero | tr "\\0" x >&2; echo END >&2',
  ]);
  assert.ok(r.stderr.length <= 1024 * 1024);
  assert.ok(r.stderr.endsWith('END'));
});
