import { NextResponse } from "next/server";
import { z } from "zod";
import { createDocumentPresignedUpload } from "@/lib/r2";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";

const requestSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  fileSize: z.number().positive(),
});

export async function POST(request: Request) {
  const { userId, orgId } = await getAuthContext();

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspaceByClerkOrgId(orgId);

  if (!workspace) {
    return NextResponse.json(
      { error: "The active organization is not linked to a workspace yet." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid upload request." },
      { status: 400 }
    );
  }

  try {
    const presigned = await createDocumentPresignedUpload({
      workspaceId: workspace.id,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      fileSize: parsed.data.fileSize,
    });

    return NextResponse.json(presigned);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create a presigned upload URL.",
      },
      { status: 400 }
    );
  }
}
