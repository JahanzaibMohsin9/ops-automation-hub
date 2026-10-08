import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  LOCAL_QA_AUTH_COOKIE,
  LOCAL_QA_AUTH_HEADER,
  LOCAL_QA_AUTH_QUERY,
  normalizeQaWorkspaceSlug,
} from "@/lib/local-qa-auth";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/leads(.*)",
  "/documents(.*)",
  "/review-queue(.*)",
  "/settings(.*)",
  "/setup(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const isLocalQaBypassEnabled = process.env.NODE_ENV === "development";
  const queryWorkspaceSlug = normalizeQaWorkspaceSlug(
    request.nextUrl.searchParams.get(LOCAL_QA_AUTH_QUERY)
  );
  const cookieWorkspaceSlug = normalizeQaWorkspaceSlug(
    request.cookies.get(LOCAL_QA_AUTH_COOKIE)?.value
  );
  const qaWorkspaceSlug =
    isLocalQaBypassEnabled && queryWorkspaceSlug
      ? queryWorkspaceSlug
      : isLocalQaBypassEnabled
        ? cookieWorkspaceSlug
        : null;

  if (isProtectedRoute(request) && !qaWorkspaceSlug) {
    await auth.protect();
  }

  const authState = await auth();
  const requestHeaders = new Headers(request.headers);

  if (qaWorkspaceSlug) {
    requestHeaders.set(LOCAL_QA_AUTH_HEADER, qaWorkspaceSlug);
  }

  if (authState.orgId) {
    requestHeaders.set("x-active-org-id", authState.orgId);
  }

  if (authState.userId) {
    requestHeaders.set("x-active-user-id", authState.userId);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (queryWorkspaceSlug && isLocalQaBypassEnabled) {
    response.cookies.set({
      name: LOCAL_QA_AUTH_COOKIE,
      value: queryWorkspaceSlug,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  }

  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
