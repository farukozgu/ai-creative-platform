import { AsyncLocalStorage } from "node:async_hooks";

export type LocalImageAuthorization = {
  generationId: string;
  projectId: string;
  ownerId: string;
  model: string;
  maxQuality: "high" | "xhigh";
};

const scope = new AsyncLocalStorage<LocalImageAuthorization & { calls: number }>();
export function withLocalImageBudget<T>(authorization: LocalImageAuthorization, execute: () => Promise<T>) {
  return scope.run({ ...authorization, calls: 0 }, execute);
}
export function isLocalImageExecution() { return Boolean(scope.getStore()); }

export function assertLocalImageRequest(input: { generationId: string; projectId: string; model: string; quality: string }) {
  const budget = scope.getStore();
  if (!budget) {
    if (process.env.NODE_ENV === "development") throw new Error("Local image inference requires selected-job authorization.");
    return;
  }
  if (input.generationId !== budget.generationId || input.projectId !== budget.projectId || input.model !== budget.model ||
      !["high", ...(budget.maxQuality === "xhigh" ? ["xhigh"] : [])].includes(input.quality) || budget.calls >= 1) {
    throw new Error("Local image authorization or single-call budget rejected the request.");
  }
}

/** Consume synchronously immediately before the SDK request, including failed requests. */
export function consumeLocalImageRequest(input: Parameters<typeof assertLocalImageRequest>[0]) {
  assertLocalImageRequest(input);
  const budget = scope.getStore();
  if (budget) budget.calls += 1;
}
