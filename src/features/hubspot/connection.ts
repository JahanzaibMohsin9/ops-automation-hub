import { prisma } from "@/lib/prisma";

export const HUBSPOT_PROVIDER = "hubspot";
export const HUBSPOT_CONNECTION_MODE = "private_app_env";

type HubSpotAccountDetails = {
  portalId: number | null;
  accountName: string | null;
};

type HubSpotFetchOptions = RequestInit & {
  searchParams?: Record<string, string | undefined>;
};

function getHubSpotToken() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

export function isHubSpotPrivateAppConfigured() {
  return Boolean(getHubSpotToken());
}

export async function getHubSpotConnectionRecord(workspaceId: string) {
  return prismaIntegrationConnection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: HUBSPOT_PROVIDER,
      },
    },
  });
}

export async function getHubSpotConnectionState(workspaceId: string) {
  const [record] = await Promise.all([getHubSpotConnectionRecord(workspaceId)]);
  const envConfigured = isHubSpotPrivateAppConfigured();
  const isConnected = envConfigured && record?.status === "connected";

  return {
    envConfigured,
    isConnected,
    record,
  };
}

async function hubSpotFetch<T>(
  path: string,
  options: HubSpotFetchOptions = {}
): Promise<T> {
  const token = getHubSpotToken();

  if (!token) {
    throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not configured.");
  }

  const url = new URL(`https://api.hubapi.com${path}`);

  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let details = "";

    try {
      const body = (await response.json()) as { message?: string; category?: string };
      details = body.message ?? body.category ?? "";
    } catch {
      details = await response.text();
    }

    throw new Error(
      `HubSpot API request failed (${response.status} ${response.statusText})${details ? `: ${details}` : "."}`
    );
  }

  return (await response.json()) as T;
}

export async function fetchHubSpotAccountDetails(): Promise<HubSpotAccountDetails> {
  if (!isHubSpotPrivateAppConfigured()) {
    return {
      portalId: null,
      accountName: null,
    };
  }

  try {
    const response = await hubSpotFetch<{
      portalId?: number;
      hubId?: number;
      accountName?: string;
      hubDomain?: string;
    }>("/integrations/v1/me");

    return {
      portalId:
        typeof response.portalId === "number"
          ? response.portalId
          : typeof response.hubId === "number"
            ? response.hubId
            : null,
      accountName:
        typeof response.accountName === "string"
          ? response.accountName
          : typeof response.hubDomain === "string"
            ? response.hubDomain
            : null,
    };
  } catch {
    return {
      portalId: null,
      accountName: null,
    };
  }
}

function splitFullName(fullName: string) {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

type HubSpotContactProperties = Record<string, string>;

export function buildHubSpotContactProperties(lead: {
  fullName: string;
  email: string;
  phone?: string | null;
  companyName: string;
  companyDomain?: string | null;
  jobTitle?: string | null;
}) {
  const { firstName, lastName } = splitFullName(lead.fullName);
  const properties: HubSpotContactProperties = {
    email: lead.email,
    firstname: firstName,
    lastname: lastName,
    company: lead.companyName,
  };

  if (lead.phone) {
    properties.phone = lead.phone;
  }

  if (lead.companyDomain) {
    properties.website = /^https?:\/\//i.test(lead.companyDomain)
      ? lead.companyDomain
      : `https://${lead.companyDomain}`;
  }

  if (lead.jobTitle) {
    properties.jobtitle = lead.jobTitle;
  }

  return properties;
}

export async function findHubSpotContactByEmail(email: string) {
  const response = await hubSpotFetch<{
    results?: Array<{ id: string }>;
  }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: email,
            },
          ],
        },
      ],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    }),
  });

  return response.results?.[0] ?? null;
}

export async function createHubSpotContact(properties: HubSpotContactProperties) {
  return hubSpotFetch<{ id: string }>("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties,
    }),
  });
}

export async function updateHubSpotContact(
  contactId: string,
  properties: HubSpotContactProperties
) {
  return hubSpotFetch<{ id: string }>(`/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties,
    }),
  });
}

export function buildHubSpotContactUrl(portalId: number | null, contactId: string) {
  if (!portalId) {
    return null;
  }

  return `https://app.hubspot.com/contacts/${portalId}/record/0-1/${contactId}`;
}
const prismaIntegrationConnection = (prisma as typeof prisma & {
  integrationConnection: {
    findUnique: (args: {
      where: {
        workspaceId_provider: {
          workspaceId: string;
          provider: "hubspot";
        };
      };
    }) => Promise<{
      id: string;
      workspaceId: string;
      provider: "hubspot" | "slack";
      accessToken: string | null;
      refreshToken: string | null;
      metadata: unknown;
      status: "disconnected" | "connected";
      connectedAt: Date | null;
      disconnectedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null>;
  };
}).integrationConnection;
