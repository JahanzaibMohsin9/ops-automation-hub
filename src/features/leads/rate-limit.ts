import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const LEAD_FORM_RATE_LIMIT_PER_MINUTE = 10;
const LEAD_FORM_RATE_LIMIT_WINDOW_MS = 60_000;

function normalizeIpAddress(value: string) {
  return value.trim().toLowerCase();
}

export function extractClientIpAddress(headerValues: Headers) {
  const forwardedFor = headerValues.get("x-forwarded-for");

  if (forwardedFor) {
    const firstAddress = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);

    if (firstAddress) {
      return normalizeIpAddress(firstAddress);
    }
  }

  const realIp = headerValues.get("x-real-ip");
  if (realIp?.trim()) {
    return normalizeIpAddress(realIp);
  }

  const cfConnectingIp = headerValues.get("cf-connecting-ip");
  if (cfConnectingIp?.trim()) {
    return normalizeIpAddress(cfConnectingIp);
  }

  return null;
}

export async function consumeLeadSubmissionRateLimit(workspaceId: string) {
  let requestHeaders: Headers | null = null;

  try {
    requestHeaders = await headers();
  } catch {
    requestHeaders = null;
  }

  const ipAddress = requestHeaders ? extractClientIpAddress(requestHeaders) : null;

  if (!ipAddress) {
    return {
      allowed: true as const,
      ipAddress: null,
      retryAfterSeconds: 0,
      remaining: LEAD_FORM_RATE_LIMIT_PER_MINUTE,
    };
  }

  const windowStart = new Date(Date.now() - LEAD_FORM_RATE_LIMIT_WINDOW_MS);
  const recentAttemptCount = await prisma.leadSubmissionAttempt.count({
    where: {
      workspaceId,
      ipAddress,
      createdAt: {
        gte: windowStart,
      },
    },
  });

  if (recentAttemptCount >= LEAD_FORM_RATE_LIMIT_PER_MINUTE) {
    return {
      allowed: false as const,
      ipAddress,
      retryAfterSeconds: Math.ceil(LEAD_FORM_RATE_LIMIT_WINDOW_MS / 1000),
      remaining: 0,
    };
  }

  await prisma.leadSubmissionAttempt.create({
    data: {
      workspaceId,
      ipAddress,
    },
  });

  return {
    allowed: true as const,
    ipAddress,
    retryAfterSeconds: 0,
    remaining: Math.max(0, LEAD_FORM_RATE_LIMIT_PER_MINUTE - recentAttemptCount - 1),
  };
}
