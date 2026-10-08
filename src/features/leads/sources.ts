import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_FORM_SOURCE_NAME = "Hosted lead form";

export async function ensureDefaultFormLeadSource(workspaceId: string) {
  const existingSource = await prisma.leadSource.findFirst({
    where: {
      workspaceId,
      type: "form",
      name: DEFAULT_FORM_SOURCE_NAME,
    },
  });

  if (existingSource) {
    return existingSource;
  }

  return prisma.leadSource.create({
    data: {
      workspaceId,
      type: "form",
      name: DEFAULT_FORM_SOURCE_NAME,
      config: {
        mode: "authenticated",
        version: 1,
      },
    },
  });
}

export async function createCsvLeadSource(
  workspaceId: string,
  fileName: string,
  config?: Prisma.InputJsonValue
) {
  const baseName = fileName.trim() || "CSV import";
  let name = baseName;
  let suffix = 1;

  for (;;) {
    const existingSource = await prisma.leadSource.findFirst({
      where: {
        workspaceId,
        type: "csv",
        name,
      },
    });

    if (!existingSource) {
      return prisma.leadSource.create({
        data: {
          workspaceId,
          type: "csv",
          name,
          config,
        },
      });
    }

    suffix += 1;
    name = `${baseName} (${suffix})`;
  }
}
