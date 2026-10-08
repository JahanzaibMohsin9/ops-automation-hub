import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export type EnrichmentNormalizedData = {
  companyDescription?: string;
  industry?: string;
  employeeRange?: string;
  website?: string;
  linkedInUrl?: string;
  technologies: string[];
  foundedYear?: number;
};

export type EnrichmentResult = {
  provider: string;
  status: "success" | "failed" | "partial";
  rawPayload: Prisma.InputJsonValue;
  normalizedData: EnrichmentNormalizedData;
};

export type EnrichmentLead = {
  id: string;
  companyName: string;
  companyDomain: string | null;
  industry: string | null;
  employeeRange: string | null;
};

export interface EnrichmentProvider {
  enrich(lead: EnrichmentLead): Promise<EnrichmentResult>;
}

const EMPLOYEE_RANGES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
] as const;

const INDUSTRY_PROFILES = [
  {
    key: "technology",
    label: "Technology",
    description:
      "Builds software and automation tooling for operations-heavy teams.",
    technologies: ["Next.js", "TypeScript", "PostgreSQL", "HubSpot", "Slack"],
  },
  {
    key: "healthcare",
    label: "Healthcare",
    description:
      "Supports healthcare operations with workflow, intake, and compliance software.",
    technologies: ["React", "Node.js", "FHIR APIs", "Snowflake", "Zendesk"],
  },
  {
    key: "finance",
    label: "Financial services",
    description:
      "Delivers finance operations, reporting, and risk automation for modern teams.",
    technologies: ["Python", "dbt", "Stripe", "Looker", "Salesforce"],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    description:
      "Runs supply-chain and operations workflows across distributed manufacturing teams.",
    technologies: ["NetSuite", "Power BI", "Azure", "EDI", "Power Automate"],
  },
  {
    key: "professional-services",
    label: "Professional services",
    description:
      "Helps service businesses streamline delivery, finance, and client operations.",
    technologies: ["Notion", "HubSpot", "QuickBooks", "Zapier", "Google Workspace"],
  },
] as const;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDeterministicNumber(seed: string) {
  const digest = createHash("sha256").update(seed).digest("hex");
  return Number.parseInt(digest.slice(0, 12), 16);
}

function pickProfile(seed: string) {
  return INDUSTRY_PROFILES[createDeterministicNumber(seed) % INDUSTRY_PROFILES.length];
}

function buildCompanySlug(lead: EnrichmentLead) {
  if (lead.companyDomain) {
    return lead.companyDomain.replace(/\.[^.]+$/, "");
  }

  return lead.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildWebsite(lead: EnrichmentLead, slug: string) {
  return lead.companyDomain ? `https://${lead.companyDomain}` : `https://${slug}.com`;
}

function buildLinkedInUrl(slug: string) {
  return `https://www.linkedin.com/company/${slug}`;
}

function maybeOmit<T>(value: T, hashValue: number, divisor: number) {
  return hashValue % divisor === 0 ? undefined : value;
}

export class MockEnrichmentProvider implements EnrichmentProvider {
  readonly name = "mock";

  async enrich(lead: EnrichmentLead): Promise<EnrichmentResult> {
    const seed = `${lead.companyDomain ?? lead.companyName}:${lead.id}`;
    const hashValue = createDeterministicNumber(seed);
    const profile = pickProfile(seed);
    const slug = buildCompanySlug(lead);
    const website = buildWebsite(lead, slug);
    const linkedInUrl = buildLinkedInUrl(slug);
    const foundedYear = 1998 + (hashValue % 24);
    const employeeRange =
      lead.employeeRange ??
      EMPLOYEE_RANGES[hashValue % EMPLOYEE_RANGES.length];
    const industry = lead.industry ?? profile.label;
    const technologies = profile.technologies.slice(0, 3 + (hashValue % 3));
    const companyDescription = `${lead.companyName} ${profile.description}`;
    const processingDelayMs = 1_000 + (hashValue % 1_001);

    await delay(processingDelayMs);

    const normalizedData: EnrichmentNormalizedData = {
      companyDescription: maybeOmit(companyDescription, hashValue, 7),
      industry: maybeOmit(industry, hashValue, 6),
      employeeRange: maybeOmit(employeeRange, hashValue, 5),
      website: maybeOmit(website, hashValue, 9),
      linkedInUrl: maybeOmit(linkedInUrl, hashValue, 11),
      technologies: hashValue % 8 === 0 ? technologies.slice(0, 2) : technologies,
      foundedYear: maybeOmit(foundedYear, hashValue, 10),
    };

    const missingFieldCount = Object.values(normalizedData).filter((value) => {
      if (Array.isArray(value)) {
        return value.length === 0;
      }

      return value === undefined;
    }).length;

    return {
      provider: this.name,
      status: missingFieldCount > 0 ? "partial" : "success",
      rawPayload: {
        provider: this.name,
        seed,
        processingDelayMs,
        profile: profile.key,
        matchedOn: lead.companyDomain ? "companyDomain" : "companyName",
        missingFieldCount,
      },
      normalizedData,
    };
  }
}

export const mockEnrichmentProvider = new MockEnrichmentProvider();
