import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCodexDiagnostic } from './codexExecutor.js';
import {
  classifyError,
  createCodexError,
  ErrorCategory,
  InvalidArgumentError,
} from './errorTypes.js';
import { assertReasoningEffortSupported } from './modelDetection.js';
import { CodexCommandBuilder } from './codexCommandBuilder.js';

const BANNER = [
  'OpenAI Codex v0.169.0',
  '--------',
  'workdir: /tmp',
  'model: bogus-model-xyz',
  'approval: never',
  'sandbox: read-only',
  'session id: 01a1dae8-f77e-7401-8429-000000000000',
  '--------',
  'warning: Model metadata for `bogus-model-xyz` not found.',
  "ERROR: The 'bogus-model-xyz' model is not supported when using Codex with a ChatGPT account.",
  "ERROR: The 'bogus-model-xyz' model is not supported when using Codex with a ChatGPT account.",
].join('\n');

test('only the ERROR lines are extracted, deduplicated', () => {
  assert.equal(
    extractCodexDiagnostic(BANNER),
    "ERROR: The 'bogus-model-xyz' model is not supported when using Codex with a ChatGPT account."
  );
});

test('an unknown model is a model error, not a sandbox/permission error', () => {
  const message = `Codex CLI failed with exit code 1: ${extractCodexDiagnostic(BANNER)}`;
  assert.equal(classifyError(message), ErrorCategory.MODEL);
});

test('401/429 inside a UUID are not auth or rate-limit errors', () => {
  assert.equal(classifyError('thread 01a1dae8-f77e-7401-8429-0000 ended'), ErrorCategory.UNKNOWN);
  assert.equal(classifyError('HTTP 401 Unauthorized'), ErrorCategory.AUTHENTICATION);
  assert.equal(classifyError('status 429 from upstream'), ErrorCategory.RATE_LIMIT);
});

test('without ERROR lines the tail of stderr is used', () => {
  assert.equal(extractCodexDiagnostic('a\nb\n\nc\n'), 'a\nb\nc');
});

test('precise causes win over the loose "error … model" wording', () => {
  assert.equal(
    classifyError(
      'Codex CLI failed with exit code 1: ERROR: rate limit reached for model gpt-6-luna'
    ),
    ErrorCategory.RATE_LIMIT
  );
  assert.equal(
    classifyError(
      'Codex CLI failed with exit code 1: ERROR: unauthorized access to model gpt-6-astra'
    ),
    ErrorCategory.AUTHENTICATION
  );
  assert.equal(classifyError('ERROR: model gpt-x was rejected'), ErrorCategory.MODEL);
});

test('incidental "connect", "session" or "expired" do not pick a category', () => {
  assert.equal(
    classifyError('the connector produced an expired-looking session token'),
    ErrorCategory.UNKNOWN
  );
  assert.equal(classifyError('failed to connect to api.openai.com'), ErrorCategory.NETWORK);
});

test('the fallback tail drops the run banner', () => {
  const stderr =
    'OpenAI Codex v0.169.0\n--------\nsandbox: read-only\nsession id: 01a1-401\n--------\nsomething broke';
  assert.equal(extractCodexDiagnostic(stderr), 'something broke');
});

test('our own validation errors are Invalid Arguments, not Unknown', () => {
  let thrown: unknown;
  try {
    assertReasoningEffortSupported('gpt-6-luna', 'ultra');
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof InvalidArgumentError);
  const codexError = createCodexError(thrown as Error);
  assert.equal(codexError.category, ErrorCategory.INVALID_ARGUMENTS);
  assert.doesNotMatch(codexError.toUserFriendlyString(), /codex login/);
});

test('conflicting builder options are Invalid Arguments', async () => {
  await assert.rejects(
    new CodexCommandBuilder().build('hi', { yolo: true, fullAuto: true }),
    (error: unknown) =>
      error instanceof InvalidArgumentError &&
      createCodexError(error).category === ErrorCategory.INVALID_ARGUMENTS
  );
});

test('a plain Error with similar wording is still classified by message', () => {
  assert.equal(
    createCodexError(new Error('Cannot use both yolo and fullAuto')).category,
    ErrorCategory.UNKNOWN
  );
});
