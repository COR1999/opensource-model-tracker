import type { ModelInfo, TestResult } from "./types";
import { NVIDIA_BASE, OPENCODE_BASE, OPENROUTER_BASE } from "./providers";

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
  if (body && (body.includes("tool choice") || body.includes("tool-call-parser"))) {
    return "working";
  }
  return "error";
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

export async function testModel(
  apiKey: string,
  model: ModelInfo
): Promise<TestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), testTimeoutMs(model));

  try {
    const baseUrl =
      model.provider === "opencode" ? OPENCODE_BASE
      : model.provider === "openrouter" ? OPENROUTER_BASE
      : NVIDIA_BASE;

    // Tracker ids are provider-namespaced; upstream APIs expect them bare
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
        clearTimeout(timeout);
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

    // Step 1: Test without tools — just check if model responds
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

    // Parse (and thus validate) the response even though the body is unused
    await res.json();

    // Step 2: Probe function calling separately (best-effort, don't fail the test)
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
      // If tools probe fails with 400, model just doesn't support tools — that's fine
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
    // controller.abort() throws AbortError; AbortSignal.timeout() throws
    // TimeoutError — both mean the model didn't answer in time. Message
    // sniffing misses TimeoutError ("The operation timed out").
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
