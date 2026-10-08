import { NextResponse } from "next/server";
import { uploadDocumentToR2 } from "@/lib/r2";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";

export const runtime = "nodejs";

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

  const formData = await request.formData().catch(() => null);
  const uploadedFile = formData?.get("file");
  const storageKeyValue = formData?.get("storageKey");
  const storageKey =
    typeof storageKeyValue === "string" && storageKeyValue.trim().length > 0
      ? storageKeyValue.trim()
      : undefined;

  if (!(uploadedFile instanceof File)) {
    return NextResponse.json({ error: "A file upload is required." }, { status: 400 });
  }

  try {
    const arrayBuffer = await uploadedFile.arrayBuffer();
    const result = await uploadDocumentToR2({
      workspaceId: workspace.id,
      fileName: uploadedFile.name,
      mimeType: uploadedFile.type,
      fileSize: uploadedFile.size,
      body: arrayBuffer,
      storageKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not upload the document to Cloudflare R2.",
      },
      { status: 400 }
    );
  }
}
