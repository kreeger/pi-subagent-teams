import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

describe("package resources", () => {
  it("declares the extension and bundled skills", () => {
    const packageJson = readJson("package.json");
    expect(packageJson.pi.extensions).toContain("./src/index.ts");
    expect(packageJson.pi.skills).toContain("./skills");
    expect(packageJson.files).toContain("src/*.ts");
    expect(packageJson.files).not.toContain("src");
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.author).toBe("Ben Kreeger");
  });

  it("provides the subagent-teams skill metadata", () => {
    const skill = readFileSync(
      resolve(root, "skills/subagent-teams/SKILL.md"),
      "utf8",
    );
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatter?.[1]).toMatch(/name:\s*subagent-teams/);
    expect(frontmatter?.[1]).toMatch(
      /description:.*team.*model.*preset.*delegation/i,
    );
  });
});
