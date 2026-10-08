import type { Prisma } from "../generated/prisma/client";
import { prisma } from "@/lib/prisma";

type CreateAuditLogInput = {
  workspaceId: string;
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  metadataJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

export async function createAuditLog({
  workspaceId,
  actorUserId,
  eventType,
  entityType,
  entityId,
  metadataJson,
}: CreateAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      workspaceId,
      actorUserId: actorUserId ?? null,
      eventType,
      entityType,
      entityId: entityId ?? null,
      metadataJson,
    },
  });
}
