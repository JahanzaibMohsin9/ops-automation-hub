import { NextResponse } from "next/server";
import { exportSingleApprovedReviewTask } from "@/features/review/exports";

type RouteContext = {
  params: Promise<{
    reviewTaskId: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { error: "Export format must be csv or json." },
      { status: 400 }
    );
  }

  try {
    const resolvedParams = await params;
    const exported = await exportSingleApprovedReviewTask(
      resolvedParams.reviewTaskId,
      format
    );

    if (!exported) {
      return NextResponse.json(
        { error: "Approved review task export was not found." },
        { status: 404 }
      );
    }

    return new NextResponse(exported.body, {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not export the approved review record.",
      },
      { status: 400 }
    );
  }
}
