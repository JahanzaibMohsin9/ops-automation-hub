import { readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

describe("workspace security guardrails", () => {
  it("does not reference private env vars from client components", () => {
    const clientFiles = [
      "src/components/hubspot-connection-card.tsx",
      "src/components/slack-connection-card.tsx",
      "src/components/lead-intake-form.tsx",
      "src/components/document-upload-panel.tsx",
      "src/components/lead-scoring-settings-card.tsx",
    ];

    for (const relativePath of clientFiles) {
      const source = readSource(relativePath);
      expect(source).not.toMatch(/process\.env\.(?!NEXT_PUBLIC_)/);
      expect(source).not.toMatch(/sk-[a-z0-9]/i);
    }
  });

  it("keeps review exports authenticated through the workspace resolver", () => {
    const exportSource = readSource("src/features/review/exports.ts");

    expect(exportSource).toContain('throw new Error("Unauthorized")');
    expect(exportSource).toContain("getWorkspaceByClerkOrgId");
    expect(exportSource).toContain("workspaceId");
  });
});
