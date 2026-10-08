import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/ops_automation";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const workspaceSeed = {
  clerkOrgId: process.env.DEMO_WORKSPACE_CLERK_ORG_ID ?? "demo-org",
  slug: process.env.DEMO_WORKSPACE_SLUG ?? "demo-workspace",
  name: process.env.DEMO_WORKSPACE_NAME ?? "Demo Workspace",
};

const demoLeads = [
  {
    fullName: "Avery Stone",
    email: "avery@northstarops.com",
    companyName: "Northstar Ops",
    companyDomain: "northstarops.com",
    jobTitle: "Revenue Operations Lead",
    industry: "Technology",
  },
  {
    fullName: "Maya Chen",
    email: "maya@blueharborhealth.com",
    companyName: "Blue Harbor Health",
    companyDomain: "blueharborhealth.com",
    jobTitle: "Director of Operations",
    industry: "Healthcare",
  },
  {
    fullName: "Jonas Reed",
    email: "jonas@cinderfinance.com",
    companyName: "Cinder Finance",
    companyDomain: "cinderfinance.com",
    jobTitle: "VP Finance Systems",
    industry: "Financial Services",
  },
  {
    fullName: "Lina Patel",
    email: "lina@atlaslegal.co",
    companyName: "Atlas Legal",
    companyDomain: "atlaslegal.co",
    jobTitle: "COO",
    industry: "Professional Services",
  },
  {
    fullName: "Oscar Bell",
    email: "oscar@fieldroute.io",
    companyName: "FieldRoute",
    companyDomain: "fieldroute.io",
    jobTitle: "Head of Sales Ops",
    industry: "Technology",
  },
  {
    fullName: "Nina Flores",
    email: "nina@maplefreight.com",
    companyName: "Maple Freight",
    companyDomain: "maplefreight.com",
    jobTitle: "Operations Manager",
    industry: "Logistics",
  },
  {
    fullName: "Darius King",
    email: "darius@signalworks.ai",
    companyName: "Signal Works AI",
    companyDomain: "signalworks.ai",
    jobTitle: "Founder",
    industry: "Technology",
  },
  {
    fullName: "Priya Shah",
    email: "priya@harborledger.com",
    companyName: "Harbor Ledger",
    companyDomain: "harborledger.com",
    jobTitle: "RevOps Manager",
    industry: "Financial Services",
  },
  {
    fullName: "Ethan Cole",
    email: "ethan@meridianstaffing.com",
    companyName: "Meridian Staffing",
    companyDomain: "meridianstaffing.com",
    jobTitle: "Director of Growth",
    industry: "Staffing",
  },
  {
    fullName: "Hana Yusuf",
    email: "hana@clearpathcare.com",
    companyName: "ClearPath Care",
    companyDomain: "clearpathcare.com",
    jobTitle: "Chief of Staff",
    industry: "Healthcare",
  },
  {
    fullName: "Mateo Ruiz",
    email: "mateo@bricklaneadvisors.com",
    companyName: "Bricklane Advisors",
    companyDomain: "bricklaneadvisors.com",
    jobTitle: "Managing Partner",
    industry: "Professional Services",
  },
  {
    fullName: "Zoe Carter",
    email: "zoe@pulsecommerce.io",
    companyName: "Pulse Commerce",
    companyDomain: "pulsecommerce.io",
    jobTitle: "Lifecycle Marketing Lead",
    industry: "Ecommerce",
  },
];

async function main() {
  const seededAt = new Date().toISOString();

  const workspace = await prisma.workspace.upsert({
    where: {
      clerkOrgId: workspaceSeed.clerkOrgId,
    },
    update: {
      name: workspaceSeed.name,
      slug: workspaceSeed.slug,
    },
    create: {
      clerkOrgId: workspaceSeed.clerkOrgId,
      slug: workspaceSeed.slug,
      name: workspaceSeed.name,
      plan: "pro",
    },
  });

  const leadSource = await prisma.leadSource.upsert({
    where: {
      workspaceId_type_name: {
        workspaceId: workspace.id,
        type: "form",
        name: "Demo seeded form",
      },
    },
    update: {
      config: {
        kind: "demo-seed",
        seededAt,
      },
    },
    create: {
      workspaceId: workspace.id,
      type: "form",
      name: "Demo seeded form",
      config: {
        kind: "demo-seed",
        seededAt,
      },
    },
  });

  for (const lead of demoLeads) {
    const createdLead = await prisma.lead.upsert({
      where: {
        id: `${workspace.id}:${lead.email}`,
      },
      update: {
        workspaceId: workspace.id,
        leadSourceId: leadSource.id,
        fullName: lead.fullName,
        email: lead.email,
        companyName: lead.companyName,
        companyDomain: lead.companyDomain,
        jobTitle: lead.jobTitle,
        industry: lead.industry,
        rawPayloadJson: {
          submittedVia: "demo-seed",
          seededAt,
        },
      },
      create: {
        id: `${workspace.id}:${lead.email}`,
        workspaceId: workspace.id,
        leadSourceId: leadSource.id,
        fullName: lead.fullName,
        email: lead.email,
        companyName: lead.companyName,
        companyDomain: lead.companyDomain,
        jobTitle: lead.jobTitle,
        industry: lead.industry,
        rawPayloadJson: {
          submittedVia: "demo-seed",
          seededAt,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        eventType: "lead.created",
        entityType: "lead",
        entityId: createdLead.id,
        metadataJson: {
          sourceId: leadSource.id,
          sourceType: leadSource.type,
          email: createdLead.email,
          companyName: createdLead.companyName,
          seeded: true,
        },
      },
    });
  }

  console.log(
    `Seeded ${demoLeads.length} demo leads into workspace "${workspace.name}" (${workspace.id}).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
