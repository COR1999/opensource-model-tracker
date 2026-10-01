import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATA_BRANCH } from "@/lib/curated";

/**
 * Guards against the writer/reader branch mismatch that shipped twice.
 *
 * Both incidents were the same shape: a branch name hardcoded in one place
 * drifted from the branch used in another, and nothing failed — uptime just
 * silently stopped updating. These assertions turn that into a build failure.
 *
 * The rule is deliberately blunt: no code-branch name may appear inside a
 * string or template literal anywhere under src/. Only DATA_BRANCH decides
 * where generated files live. Prose in comments is exempt, because explaining
 * the constraint is the whole point of those comments.
 */
const SRC = join(process.cwd(), "src");
const CODE_BRANCHES = /\b(?:master|main-dev)\b|\/main\//;

/** Comments are documentation, not code: a branch named in prose is fine. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every string/template literal in the file, including multi-line templates. */
function literals(code: string): string[] {
  return [...code.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)].map((m) => m[0]);
}

describe("data branch is the only place cron output lives", () => {
  it("pins DATA_BRANCH to the data branch", () => {
    expect(DATA_BRANCH).toBe("data");
  });

  it("never names a code branch inside a string or URL under src/", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = file.replace(`${process.cwd()}\\`, "").replace(/\\/g, "/");
      const code = stripComments(readFileSync(file, "utf8"));
      literals(code).forEach((lit) => {
        if (CODE_BRANCHES.test(lit)) offenders.push(`${rel}: ${lit}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("writes cron output to DATA_BRANCH", () => {
    const cron = readFileSync(join(SRC, "app", "api", "cron", "route.ts"), "utf8");
    expect(cron).toMatch(/const GITHUB_BRANCH\s*=\s*DATA_BRANCH;/);
  });

  it("reads history and snapshots through DATA_BRANCH", () => {
    expect(readFileSync(join(SRC, "app", "api", "uptime", "route.ts"), "utf8")).toContain(
      "DATA_BRANCH"
    );
    expect(readFileSync(join(SRC, "app", "api", "results", "route.ts"), "utf8")).toContain(
      "DATA_BRANCH"
    );
    expect(readFileSync(join(SRC, "lib", "rankings.ts"), "utf8")).toMatch(
      /BENCHMARKS_SNAPSHOT_URLS[\s\S]{0,240}?data\/data\/benchmarks\.json/
    );
  });

  it("does not commit generated data to a code branch", () => {
    // If a data/ directory reappears in the working tree it would get
    // committed, recreating the second divergent copy this setup removed.
    expect(existsSync(join(process.cwd(), "data"))).toBe(false);
  });
});