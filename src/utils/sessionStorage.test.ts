import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getOrCreateSession,
  setCodexConversationId,
  parseConversationIdFromOutput,
  deleteSession,
  listSessions,
} from './sessionStorage.js';

test('a sessionId reused in another workspace does not resume the old conversation', () => {
  const repoA = mkdtempSync(join(tmpdir(), 'repo-a-'));
  const repoB = mkdtempSync(join(tmpdir(), 'repo-b-'));
  getOrCreateSession(repoA, 'shared');
  setCodexConversationId('shared', '01a1dae8-0000-7000-8000-000000000001', repoA);
  assert.equal(
    getOrCreateSession(repoA, 'shared').codexConversationId,
    '01a1dae8-0000-7000-8000-000000000001'
  );
  const inB = getOrCreateSession(repoB, 'shared');
  assert.equal(inB.codexConversationId, undefined);
  assert.equal(inB.workingDir, repoB);
});

test('the conversation id comes only from a whole `session id:` line', () => {
  assert.equal(
    parseConversationIdFromOutput('model: x\nsession id: 01a1dae8-f77e-7401-8429-0000\n'),
    '01a1dae8-f77e-7401-8429-0000'
  );
  assert.equal(
    parseConversationIdFromOutput('the answer mentions session id: deadbeef1234 inline'),
    null
  );
});

test('a branch switch in the same directory keeps the conversation', () => {
  const repo = mkdtempSync(join(tmpdir(), 'repo-head-'));
  mkdirSync(join(repo, '.git'));
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  getOrCreateSession(repo, 'branchy');
  setCodexConversationId('branchy', '01a1dae8-0000-7000-8000-000000000002', repo);
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
  assert.equal(
    getOrCreateSession(repo, 'branchy').codexConversationId,
    '01a1dae8-0000-7000-8000-000000000002'
  );
});

test('using a sessionId in another directory does not replace the first conversation', () => {
  const repoA = mkdtempSync(join(tmpdir(), 'repo-keep-a-'));
  const repoB = mkdtempSync(join(tmpdir(), 'repo-keep-b-'));
  getOrCreateSession(repoA, 'reused');
  setCodexConversationId('reused', '01a1dae8-0000-7000-8000-00000000000a', repoA);
  getOrCreateSession(repoB, 'reused');
  setCodexConversationId('reused', '01a1dae8-0000-7000-8000-00000000000b', repoB);

  assert.equal(
    getOrCreateSession(repoA, 'reused').codexConversationId,
    '01a1dae8-0000-7000-8000-00000000000a'
  );
  assert.equal(
    getOrCreateSession(repoB, 'reused').codexConversationId,
    '01a1dae8-0000-7000-8000-00000000000b'
  );
  assert.equal(listSessions().filter(s => s.sessionId === 'reused').length, 2);
});

test('a trailing slash addresses the same session', () => {
  const repo = mkdtempSync(join(tmpdir(), 'repo-slash-'));
  getOrCreateSession(repo, 'slashy');
  setCodexConversationId('slashy', '01a1dae8-0000-7000-8000-00000000000c', `${repo}/`);
  assert.equal(
    getOrCreateSession(`${repo}/`, 'slashy').codexConversationId,
    '01a1dae8-0000-7000-8000-00000000000c'
  );
});

test('deleteSession with a directory removes only that directory', () => {
  const repoA = mkdtempSync(join(tmpdir(), 'repo-del-a-'));
  const repoB = mkdtempSync(join(tmpdir(), 'repo-del-b-'));
  getOrCreateSession(repoA, 'gone');
  getOrCreateSession(repoB, 'gone');
  assert.equal(deleteSession('gone', repoA), 1);
  assert.equal(listSessions().filter(s => s.sessionId === 'gone').length, 1);
  assert.equal(deleteSession('gone'), 1);
  assert.equal(listSessions().filter(s => s.sessionId === 'gone').length, 0);
});
