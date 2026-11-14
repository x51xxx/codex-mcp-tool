import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context, propagated through every await of a tool call without
 * threading an extra parameter through each tool and executor.
 */
export interface RequestContext {
  /** Aborted when the MCP client cancels the request. */
  signal?: AbortSignal;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(context, fn);
}

/** Abort signal of the MCP request currently being served, if any. */
export function currentAbortSignal(): AbortSignal | undefined {
  return storage.getStore()?.signal;
}
