import { NextResponse } from "next/server";
import { exportApprovedReviewTasks } from "@/features/review/exports";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { error: "Export format must be csv or json." },
      { status: 400 }
    );
  }

  try {
    const exported = await exportApprovedReviewTasks(format);

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
          error instanceof Error ? error.message : "Could not export approved review records.",
      },
      { status: 400 }
    );
  }
}
