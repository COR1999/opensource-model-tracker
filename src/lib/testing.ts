import type { ModelInfo, TestResult } from "./types";
import { NVIDIA_BASE, OPENCODE_BASE, OPENROUTER_BASE } from "./providers";
import { shouldRetryRateLimit, rateLimitRetryDelayMs } from "./rate-limit";

// Paid catalog probes stay on the original budget so a full pass still fits
// Vercel's 60s cron cap. Free tiers queue and throttle far more aggressively
// (live samples: Nemotron Lightning ~5.6s, many 429s under Test All), so they
// get a longer budget — a slow free model is not the same as a dead one.
export const PAID_TEST_TIMEOUT_MS = 8000;
export const FREE_TEST_TIMEOUT_MS = 15000;
/** Above this, a successful response is labelled "slow" rather than "working". */
export const SLOW_THRESHOLD_MS = 5000;
/** Tools probe budget; free tiers get the same stretch as the main probe. */
export const PAID_TOOLS_TIMEOUT_MS = 5000;
export const FREE_TOOLS_TIMEOUT_MS = 8000;

type FreeTierRef = Pick<ModelInfo, "id" | "provider">;

/**
 * Zen renames free models ("space-bunny-free") and has one unsuffixed free
 * agent model (big-pickle). OpenRouter free variants use the `:free` suffix.
 */
export function isFreeTierModel(model: FreeTierRef): boolean {
  if (model.provider === "openrouter") return model.id.endsWith(":free");
  if (model.provider === "opencode") {
    return model.id.endsWith("-free") || model.id === "opencode/big-pickle";
  }
  return false;
}

export function testTimeoutMs(model: FreeTierRef): number {
  return isFreeTierModel(model) ? FREE_TEST_TIMEOUT_MS : PAID_TEST_TIMEOUT_MS;
}

export function toolsTimeoutMs(model: FreeTierRef): number {
  return isFreeTierModel(model) ? FREE_TOOLS_TIMEOUT_MS : PAID_TOOLS_TIMEOUT_MS;
}

/**
 * Map an upstream HTTP failure to a dashboard status. 429 is rate limiting,
 * not proof the model is broken — free gateways return it constantly under
 * parallel Test All.
 */
export function statusFromHttpFailure(
  httpCode: number,
  body?: string
): TestResult["status"] {
  if (httpCode === 410 || httpCode === 404) return "removed";
  if (httpCode === 429) return "rate-limited";
  if (body && isOpenCodeOnlyBody(body)) return "opencode-only";
  if (body && (body.includes("tool choice") || body.includes("tool-call-parser"))) {
    return "working";
  }
  return "error";
}

/** Zen free tier is gated to the OpenCode app; server probes always 403. */
export function isOpenCodeOnlyBody(body: string): boolean {
  return body.includes("FreeTierError") || body.includes("within OpenCode");
}

/**
 * True for OpenCode Zen free/agent ids that only work inside the OpenCode app.
 * Cron, Test All, and auto-test skip these — probing them from Vercel always
 * returns FreeTierError and wastes the free-tier budget.
 */
export function isOpencodeAppOnlyModel(model: FreeTierRef): boolean {
  return isFreeTierModel(model) && model.provider === "opencode";
}

// Tools definition for function-calling detection
const TOOLS_PAYLOAD = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
      },
    },
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeOnce(
  model: ModelInfo,
  baseUrl: string,
  upstreamId: string,
  headers: Record<string, string>
): Promise<TestResult> {
  // Each attempt owns its own clock. Sharing one start across attempts bills the
  // rate-limit backoff to the model, inflating uptime trends and mislabelling a
  // fast model as slow.
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), testTimeoutMs(model));

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: upstreamId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    if (res.status === 410 || res.status === 404 || res.status === 429) {
      const body = res.status === 429 ? await res.text().catch(() => "") : "";
      const status = statusFromHttpFailure(res.status, body);
      return {
        modelId: model.id,
        provider: model.provider,
        status,
        httpCode: res.status,
        responseTimeMs: elapsed,
        supportsFunctionCalling: false,
        ...(status === "rate-limited"
          ? { error: body.slice(0, 200) || "Rate limited by provider" }
          : {}),
      };
    }

    if (!res.ok) {
      const body = await res.text();
      const status = statusFromHttpFailure(res.status, body);
      return {
        modelId: model.id,
        provider: model.provider,
        status,
        httpCode: res.status,
        responseTimeMs: elapsed,
        supportsFunctionCalling: false,
        error: status === "working" ? undefined : body.slice(0, 200),
      };
    }

    await res.json();

    let hasTools = false;
    try {
      const toolRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: upstreamId,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
          tools: TOOLS_PAYLOAD,
        }),
        signal: AbortSignal.timeout(toolsTimeoutMs(model)),
      });
      if (toolRes.ok) {
        const toolData = await toolRes.json();
        hasTools = !!toolData.choices?.[0]?.message?.tool_calls?.length;
      }
    } catch {
      // Tools probe failed — model doesn't support function calling
    }

    return {
      modelId: model.id,
      provider: model.provider,
      status: elapsed > SLOW_THRESHOLD_MS ? "slow" : "working",
      httpCode: 200,
      responseTimeMs: elapsed,
      supportsFunctionCalling: hasTools,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isTimeout =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return {
      modelId: model.id,
      provider: model.provider,
      status: isTimeout ? "timeout" : "error",
      httpCode: 0,
      responseTimeMs: elapsed,
      supportsFunctionCalling: false,
      error: msg,
    };
  }
}

export async function testModel(
  apiKey: string,
  model: ModelInfo
): Promise<TestResult> {
  const start = Date.now();

  const baseUrl =
    model.provider === "opencode" ? OPENCODE_BASE
    : model.provider === "openrouter" ? OPENROUTER_BASE
    : NVIDIA_BASE;

  const upstreamId = model.id.replace(/^(opencode|openrouter)\//, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (model.provider === "nvidia" && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (model.provider === "openrouter") {
    const openrouterKey = process.env.OPENROUTER_API_KEY || "";
    if (!openrouterKey) {
      return {
        modelId: model.id,
        provider: model.provider,
        status: "error",
        httpCode: 0,
        responseTimeMs: Date.now() - start,
        supportsFunctionCalling: false,
        error: "OPENROUTER_API_KEY not configured on server - free models still require auth",
      };
    }
    headers["Authorization"] = `Bearer ${openrouterKey}`;
  }

  // One retry on 429: free gateways throttle under Test All far more often
  // than they hard-fail, and a single backoff cuts false "rate-limited" noise.
  let attempt = 1;
  let result = await probeOnce(model, baseUrl, upstreamId, headers);
  while (result.status === "rate-limited" && shouldRetryRateLimit(attempt)) {
    attempt += 1;
    await sleep(rateLimitRetryDelayMs());
    result = await probeOnce(model, baseUrl, upstreamId, headers);
  }
  return result;
}

export async function runModelTests(
  apiKey: string,
  models: ModelInfo[],
  concurrency = 10
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (let i = 0; i < models.length; i += concurrency) {
    const batch = models.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((m) => testModel(apiKey, m)));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          modelId: batch[j].id,
          provider: batch[j].provider,
          status: "error",
          httpCode: 0,
          responseTimeMs: 0,
          supportsFunctionCalling: false,
          error: r.reason?.message || "Test failed",
        });
      }
    }
  }
  return results;
}
