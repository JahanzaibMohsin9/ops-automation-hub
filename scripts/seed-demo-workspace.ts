import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma, DocumentType } from "../src/generated/prisma/client";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  extractStructuredDocumentData,
  toPrismaJson,
} from "../src/features/documents/structured-extraction-client";
import {
  DOCUMENT_FIELD_REVIEW_THRESHOLD,
  DOCUMENT_OVERALL_REVIEW_THRESHOLD,
} from "../src/features/documents/structured-extraction";
import {
  DEFAULT_LEAD_SCORING_CRITERIA,
  LEAD_SCORING_MODEL,
  LEAD_SCORING_PROMPT_VERSION,
} from "../src/features/leads/scoring";
import {
  SALES_ASSIST_MODEL,
  SALES_ASSIST_PROMPT_VERSION,
} from "../src/features/leads/sales-assist";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/ops_automation";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const workspaceSeed = {
  clerkOrgId:
    process.env.DEMO_WORKSPACE_CLERK_ORG_ID ?? "demo-northbeam-ops-org",
  slug: process.env.DEMO_WORKSPACE_SLUG ?? "northbeam-ops",
  name: process.env.DEMO_WORKSPACE_NAME ?? "Northbeam Ops",
};

const demoReviewerUserId =
  process.env.DEMO_REVIEWER_USER_ID ?? "demo-reviewer@northbeamops.test";
const demoHubSpotPortalId =
  process.env.DEMO_HUBSPOT_PORTAL_ID ?? "24170001";
const demoHubSpotAccountName =
  process.env.DEMO_HUBSPOT_ACCOUNT_NAME ?? "Northbeam Ops Demo";

type LeadStatus =
  | "new"
  | "scored"
  | "review_needed"
  | "qualified"
  | "low_priority";

type LeadSeed = {
  id: string;
  sourceType: "form" | "csv" | "webhook";
  sourceName: string;
  createdHoursAgo: number;
  updatedHoursAgo: number;
  fullName: string;
  email: string;
  phone: string | null;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string | null;
  industry: string | null;
  employeeRange: string | null;
  rawMessage: string;
  status: LeadStatus;
  enrichment: {
    provider: string;
    status: "success" | "partial";
    industry: string;
    employeeRange: string;
    companyDescription: string;
    website: string;
    linkedInUrl: string;
    technologies: string[];
    foundedYear: number;
  } | null;
  score: {
    numericScore: number;
    fitLabel: "high_fit" | "medium_fit" | "low_fit";
    reasoning: string;
    missingFields: string[];
    confidenceScore: number;
    modelUsed?: string;
  } | null;
  createReviewTask?: boolean;
  sync?: {
    externalContactId: string;
    contactUrl: string;
    retryCount?: number;
  };
  salesAssist?: {
    summary: string;
    followup: string;
    brief: string;
  };
};

type DocumentSeedStatus =
  | "approved"
  | "review_needed"
  | "extracting_structured"
  | "failed"
  | "pending";

type DocumentSeed = {
  id: string;
  documentType: DocumentType;
  fileName: string;
  fixturePath: string | null;
  mimeType: string;
  createdHoursAgo: number;
  updatedHoursAgo: number;
  status: DocumentSeedStatus;
  reviewerAction?: "approve" | "edit_approve";
  reviewerOverrides?: Record<string, string>;
  processingError?: string;
};

const leadSeeds: LeadSeed[] = [
  {
    id: "lead-riverstone",
    sourceType: "form",
    sourceName: "Executive brief request",
    createdHoursAgo: 6,
    updatedHoursAgo: 2,
    fullName: "Avery Stone",
    email: "avery.stone@riverstone-health.com",
    phone: "+1 312 555 0189",
    companyName: "Riverstone Health Partners",
    companyDomain: "riverstone-health.com",
    jobTitle: "Vice President of Revenue Operations",
    industry: "Healthcare services",
    employeeRange: "201-500",
    rawMessage:
      "We need cleaner handoffs between marketing, sales, and implementation across HubSpot and Slack.",
    status: "qualified",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Healthcare services",
      employeeRange: "201-500",
      companyDescription:
        "Multi-state healthcare services group modernizing intake, renewals, and post-sale handoffs.",
      website: "https://www.riverstone-health.com",
      linkedInUrl:
        "https://www.linkedin.com/company/riverstone-health-partners",
      technologies: ["HubSpot", "Slack", "Aircall", "Notion"],
      foundedYear: 2015,
    },
    score: {
      numericScore: 94,
      fitLabel: "high_fit",
      reasoning:
        "Senior RevOps ownership, clear CRM workflow pain, and a 200+ employee operating model make this a strong automation fit.",
      missingFields: [],
      confidenceScore: 0.96,
    },
    sync: {
      externalContactId: "301001",
      contactUrl:
        "https://app.hubspot.com/contacts/24170001/record/0-1/301001",
    },
    salesAssist: {
      summary:
        "Riverstone Health Partners is a strong-fit enterprise-style prospect with an explicit need to tighten revenue-to-operations handoffs. Avery owns RevOps and described friction across HubSpot, Slack, and downstream implementation, which maps directly to Northbeam Ops' core positioning.\n\nThe opportunity looks compelling because the company has enough scale to feel handoff complexity, while the buying signal is concrete rather than inferred. The next conversation should confirm which workflows break most often, who owns post-sale onboarding, and whether the team is already considering AI-assisted routing or document review.",
      followup:
        "Subject: A clean handoff layer for Riverstone's HubSpot workflow\n\nAvery,\n\nYour note about lead-to-implementation handoffs stood out. Teams at Riverstone's stage usually do not need more activity in HubSpot, they need tighter routing, review, and context transfer between commercial and ops teams.\n\nNorthbeam Ops helps teams connect lead qualification, document review, and downstream handoff without creating more manual queue work. If it would be useful, I can show you a short working example built around the kind of Slack and HubSpot flow you described.\n\nOpen to a 20-minute walkthrough next week?",
      brief:
        "Snapshot\n- Avery leads revenue operations for a 200+ employee healthcare services company.\n- Current pain is fragmented handoff between marketing, sales, and implementation.\n\nWhy They May Care\n- HubSpot plus Slack signal an operations-heavy environment with coordination risk.\n- The company is large enough that manual routing and exception handling likely create real drag.\n\nTalking Points\n- Show how qualification confidence can route leads to human review instead of creating silent failure.\n- Show document intake to approval and export in the same workspace.\n- Emphasize audit visibility for cross-functional handoffs.\n\nDiscovery Questions\n- Which transition breaks most often today: MQL to sales, sales to onboarding, or onboarding to delivery?\n- Who currently owns exception handling when intake data is incomplete?\n- Which documents create the most manual cleanup?\n\nRisks\n- Need to confirm buying committee beyond Avery.\n- Validate whether implementation handoff is standardized across regions.",
    },
  },
  {
    id: "lead-archway",
    sourceType: "csv",
    sourceName: "Q2 summit leads",
    createdHoursAgo: 16,
    updatedHoursAgo: 9,
    fullName: "Maya Chen",
    email: "maya.chen@archwayfreight.com",
    phone: "+1 646 555 0118",
    companyName: "Archway Freight",
    companyDomain: "archwayfreight.com",
    jobTitle: "Director of Operations",
    industry: "Logistics",
    employeeRange: "501-1000",
    rawMessage:
      "Interested in reducing the back-and-forth between sales intake and carrier onboarding.",
    status: "qualified",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Logistics",
      employeeRange: "501-1000",
      companyDescription:
        "Regional logistics network coordinating brokerage intake, carrier paperwork, and onboarding approvals.",
      website: "https://www.archwayfreight.com",
      linkedInUrl: "https://www.linkedin.com/company/archway-freight",
      technologies: ["HubSpot", "Slack", "NetSuite", "Google Drive"],
      foundedYear: 2011,
    },
    score: {
      numericScore: 91,
      fitLabel: "high_fit",
      reasoning:
        "The lead owns operational throughput, the company has scale, and the stated pain connects directly to document-heavy onboarding and workflow automation.",
      missingFields: [],
      confidenceScore: 0.94,
    },
    sync: {
      externalContactId: "301002",
      contactUrl:
        "https://app.hubspot.com/contacts/24170001/record/0-1/301002",
    },
    salesAssist: {
      summary:
        "Archway Freight sits squarely in Northbeam Ops' target profile: a scaled operations-heavy business with document intake and handoff friction. Maya's role and message suggest the team is already feeling the cost of manual coordination between commercial intake and carrier onboarding.\n\nThis is a strong demo lead because the operational problem is easy to visualize and likely tied to measurable delays. The follow-up should confirm whether the pain lives more in form intake, approval review, or CRM-to-ops handoff.",
      followup:
        "Subject: Reducing Archway's sales-to-onboarding handoff drag\n\nMaya,\n\nYou mentioned friction between sales intake and carrier onboarding. That usually shows up as incomplete records, manual follow-up, and slow approval loops across ops teams.\n\nNorthbeam Ops helps teams automate the steps between intake, qualification, document review, and downstream handoff without losing auditability. If helpful, I can share a short example of how teams are using this kind of workflow to cut the back-and-forth.\n\nWould a brief walkthrough next week be useful?",
      brief:
        "Snapshot\n- Maya runs operations at a 500+ employee logistics business.\n- Pain point centers on sales intake to carrier onboarding.\n\nWhy They May Care\n- Logistics onboarding is document-heavy and time-sensitive.\n- Coordinating revenue and ops teams across Slack, CRM, and shared files is a strong use case.\n\nTalking Points\n- Lead qualification to ops routing with visible confidence.\n- Review queue for onboarding documents and exception handling.\n- Audit log for approvals and sync events.\n\nDiscovery Questions\n- Which documents block onboarding most often?\n- Does sales own data completeness before ops receives the handoff?\n- How are sync failures or missing fields surfaced today?\n\nRisks\n- Need to learn whether existing TMS tooling constrains workflow changes.\n- Confirm whether Maya owns software buying or process design only.",
    },
  },
  {
    id: "lead-lattice",
    sourceType: "form",
    sourceName: "Strategic ops consult",
    createdHoursAgo: 28,
    updatedHoursAgo: 24,
    fullName: "Jonas Reed",
    email: "jonas.reed@latticefinance.com",
    phone: "+1 415 555 0140",
    companyName: "Lattice Finance",
    companyDomain: "latticefinance.com",
    jobTitle: "VP, Finance Systems",
    industry: "Financial services",
    employeeRange: "201-500",
    rawMessage:
      "We have too much manual work between document intake, approvals, and customer onboarding.",
    status: "qualified",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Financial services",
      employeeRange: "201-500",
      companyDescription:
        "B2B finance platform streamlining approvals and onboarding for operations and compliance teams.",
      website: "https://www.latticefinance.com",
      linkedInUrl: "https://www.linkedin.com/company/lattice-finance",
      technologies: ["HubSpot", "Salesforce", "Slack", "DocuSign"],
      foundedYear: 2018,
    },
    score: {
      numericScore: 89,
      fitLabel: "high_fit",
      reasoning:
        "Document-heavy workflows, cross-functional approvals, and a systems leader sponsor create a strong automation case with clear business relevance.",
      missingFields: [],
      confidenceScore: 0.92,
    },
    sync: {
      externalContactId: "301003",
      contactUrl:
        "https://app.hubspot.com/contacts/24170001/record/0-1/301003",
    },
    salesAssist: {
      summary:
        "Lattice Finance is a high-signal target because Jonas is already framing the problem as manual effort between intake, approvals, and onboarding. The combination of finance workflows and document handling points to a valuable automation use case rather than a generic interest in AI.\n\nThe next step should validate whether Jonas wants a narrow workflow fix or a broader ops architecture partner. Either way, the lead has enough specificity and authority to prioritize.",
      followup:
        "Subject: A cleaner approval path for Lattice Finance\n\nJonas,\n\nYour note on manual work between intake, approvals, and onboarding is exactly the kind of bottleneck Northbeam Ops is built to address. The biggest wins usually come from making incomplete submissions visible early, routing low-confidence cases to review, and keeping downstream systems in sync.\n\nIf useful, I can show a concise example of that workflow using real-world finance and onboarding patterns.\n\nWould a short session next week make sense?",
      brief:
        "Snapshot\n- Jonas owns finance systems at a mid-market financial services company.\n- Clear pain around document intake and approvals.\n\nWhy They May Care\n- This is a document-centric workflow problem with direct operational cost.\n- Cross-functional approvals make auditability and exception routing important.\n\nTalking Points\n- Show document extraction with confidence and human review.\n- Show approved output flowing into downstream systems.\n- Position Northbeam as a partner for operational handoff design, not just a single automation.\n\nDiscovery Questions\n- Which approval steps cause the most rework?\n- Are onboarding documents reviewed by ops, compliance, or both?\n- What does a failed handoff cost the team today?\n\nRisks\n- Need clarity on existing platform ownership and procurement process.\n- Could already have internal automation capacity if the pain is narrow.",
    },
  },
  {
    id: "lead-atlas",
    sourceType: "csv",
    sourceName: "Ops roundtable CSV",
    createdHoursAgo: 42,
    updatedHoursAgo: 34,
    fullName: "Lina Patel",
    email: "lina.patel@atlaslegal.co",
    phone: "+1 202 555 0171",
    companyName: "Atlas Legal Advisory",
    companyDomain: "atlaslegal.co",
    jobTitle: "Chief Operating Officer",
    industry: "Professional services",
    employeeRange: "51-200",
    rawMessage:
      "Our intake, document review, and partner handoff process is still far too manual.",
    status: "qualified",
    enrichment: {
      provider: "mock-enrichment",
      status: "partial",
      industry: "Professional services",
      employeeRange: "51-200",
      companyDescription:
        "Legal and advisory firm coordinating intake, engagement documentation, and delivery handoffs across multiple practice groups.",
      website: "https://www.atlaslegal.co",
      linkedInUrl: "https://www.linkedin.com/company/atlas-legal-advisory",
      technologies: ["HubSpot", "Slack", "DocuSign"],
      foundedYear: 2013,
    },
    score: {
      numericScore: 86,
      fitLabel: "high_fit",
      reasoning:
        "The COO role plus explicit process pain across intake and document review make this a strong fit, even with slightly partial enrichment.",
      missingFields: ["technology depth"],
      confidenceScore: 0.87,
    },
    sync: {
      externalContactId: "301004",
      contactUrl:
        "https://app.hubspot.com/contacts/24170001/record/0-1/301004",
    },
    salesAssist: {
      summary:
        "Atlas Legal Advisory is a strong-fit professional services prospect with direct operational pain around intake and document review. Lina's role as COO is a positive buying signal, and the team size is large enough that manual partner handoffs likely create measurable drag.\n\nThe fit is strong even though the enrichment profile is slightly partial. A first call should clarify current tooling depth, approval ownership, and whether legal intake variation is the main blocker.",
      followup:
        "Subject: A better intake-to-delivery workflow for Atlas Legal\n\nLina,\n\nYou described a familiar pattern: intake and document review stay manual for too long, which creates friction before work even reaches delivery teams.\n\nNorthbeam Ops helps firms automate those transitions while keeping low-confidence cases visible for human review. If you are open to it, I can share a short example tailored to professional-services intake and engagement workflows.\n\nWould next week be a reasonable time to connect?",
      brief:
        "Snapshot\n- COO at a 50-200 employee advisory firm.\n- Pain point spans intake, document review, and partner handoff.\n\nWhy They May Care\n- Professional services workflows often fail at the transition between intake and staffed delivery.\n- Document review plus approvals is a natural fit for Northbeam's operating model.\n\nTalking Points\n- Show review queue for low-confidence intake artifacts.\n- Show audit visibility for approvals and sync actions.\n- Position faster partner handoff as the measurable outcome.\n\nDiscovery Questions\n- Where do intake packages usually arrive incomplete?\n- Who decides that an engagement is ready for delivery handoff?\n- Which documents create rework today?\n\nRisks\n- Need to confirm budget authority and timeline.\n- Partial enrichment means some tooling assumptions still need validation.",
    },
  },
  {
    id: "lead-orbit",
    sourceType: "form",
    sourceName: "Demo request",
    createdHoursAgo: 70,
    updatedHoursAgo: 65,
    fullName: "Oscar Bell",
    email: "oscar.bell@orbitfield.io",
    phone: "+1 303 555 0107",
    companyName: "OrbitField",
    companyDomain: "orbitfield.io",
    jobTitle: "Head of Sales Operations",
    industry: "Field services software",
    employeeRange: "51-200",
    rawMessage:
      "We need cleaner lead qualification and better handoff quality before implementation starts work.",
    status: "qualified",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Field services software",
      employeeRange: "51-200",
      companyDescription:
        "Vertical SaaS company coordinating lead qualification, sales execution, and customer onboarding.",
      website: "https://www.orbitfield.io",
      linkedInUrl: "https://www.linkedin.com/company/orbitfield",
      technologies: ["HubSpot", "Slack", "Apollo", "Notion"],
      foundedYear: 2019,
    },
    score: {
      numericScore: 90,
      fitLabel: "high_fit",
      reasoning:
        "The lead owns sales operations, highlighted handoff quality directly, and works in an operations-heavy SaaS context that aligns well with automation services.",
      missingFields: [],
      confidenceScore: 0.93,
    },
    sync: {
      externalContactId: "301005",
      contactUrl:
        "https://app.hubspot.com/contacts/24170001/record/0-1/301005",
    },
    salesAssist: {
      summary:
        "OrbitField is a strong-fit SaaS lead because Oscar directly tied the problem to qualification quality and implementation handoff. That combination makes the opportunity concrete and highly demoable for Northbeam Ops.\n\nThe conversation should focus on where qualification confidence breaks down today, what implementation teams receive, and whether handoff quality is impacting speed to value or forecast accuracy.",
      followup:
        "Subject: Improving OrbitField's qualification-to-implementation handoff\n\nOscar,\n\nThe challenge you described is exactly where automation tends to matter most: qualification quality looks acceptable in isolation, but the downstream handoff still creates work for implementation teams.\n\nNorthbeam Ops helps teams make those transitions more explicit with confidence scoring, review routing, and clearer sync into downstream systems. I can show a short example if that would help you evaluate the fit.\n\nWould you be open to a brief conversation next week?",
      brief:
        "Snapshot\n- Oscar leads sales operations at a field-services SaaS company.\n- Pain point is lead qualification quality before implementation handoff.\n\nWhy They May Care\n- The workflow spans revenue and post-sale teams, which is Northbeam's sweet spot.\n- There is a clear downstream consequence when the handoff is incomplete.\n\nTalking Points\n- Show confidence-based routing and review-needed queueing.\n- Show CRM sync and audit visibility for handoffs.\n- Emphasize operational consistency over generic AI output.\n\nDiscovery Questions\n- What gets lost between qualification and implementation today?\n- How do teams currently know when a lead record is ready for downstream use?\n- Are there document or form steps tied to that handoff?\n\nRisks\n- Need to confirm implementation is part of Oscar's remit.\n- Could prioritize broader RevOps cleanup before workflow-specific work.",
    },
  },
  {
    id: "lead-clover",
    sourceType: "csv",
    sourceName: "Partner referrals CSV",
    createdHoursAgo: 92,
    updatedHoursAgo: 84,
    fullName: "Nina Flores",
    email: "nina.flores@cloverfreight.com",
    phone: "+1 917 555 0132",
    companyName: "Clover Freight Systems",
    companyDomain: "cloverfreight.com",
    jobTitle: "Operations Excellence Manager",
    industry: "Logistics",
    employeeRange: "201-500",
    rawMessage:
      "Looking at workflow automation options for carrier ops and finance handoffs.",
    status: "scored",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Logistics",
      employeeRange: "201-500",
      companyDescription:
        "Freight operations group coordinating intake, dispatch, finance approvals, and partner documentation.",
      website: "https://www.cloverfreight.com",
      linkedInUrl: "https://www.linkedin.com/company/clover-freight-systems",
      technologies: ["Slack", "QuickBooks", "Google Workspace"],
      foundedYear: 2010,
    },
    score: {
      numericScore: 71,
      fitLabel: "medium_fit",
      reasoning:
        "There is credible workflow complexity and enough company scale, but the buyer role and tooling picture are still moderate rather than definitive.",
      missingFields: ["crm stack", "buying owner"],
      confidenceScore: 0.85,
    },
  },
  {
    id: "lead-polaris",
    sourceType: "form",
    sourceName: "Inbound consult",
    createdHoursAgo: 108,
    updatedHoursAgo: 100,
    fullName: "Darius King",
    email: "darius.king@polarisops.ai",
    phone: "+1 408 555 0195",
    companyName: "Polaris Ops AI",
    companyDomain: "polarisops.ai",
    jobTitle: "Founder",
    industry: "AI operations software",
    employeeRange: "11-50",
    rawMessage:
      "Exploring automation support as we scale from founder-led process to repeatable revenue ops.",
    status: "scored",
    enrichment: {
      provider: "mock-enrichment",
      status: "partial",
      industry: "AI operations software",
      employeeRange: "11-50",
      companyDescription:
        "Early-stage software company building workflow tooling for internal ops teams.",
      website: "https://www.polarisops.ai",
      linkedInUrl: "https://www.linkedin.com/company/polaris-ops-ai",
      technologies: ["HubSpot", "Linear", "Slack"],
      foundedYear: 2023,
    },
    score: {
      numericScore: 67,
      fitLabel: "medium_fit",
      reasoning:
        "The workflow theme is relevant, but company maturity and limited operating scale make this more of a plausible fit than an immediate high-value target.",
      missingFields: ["team size detail", "document workflow volume"],
      confidenceScore: 0.84,
    },
  },
  {
    id: "lead-meridian",
    sourceType: "csv",
    sourceName: "Operations breakfast list",
    createdHoursAgo: 150,
    updatedHoursAgo: 144,
    fullName: "Priya Shah",
    email: "priya.shah@meridianledger.com",
    phone: "+1 646 555 0190",
    companyName: "Meridian Ledger",
    companyDomain: "meridianledger.com",
    jobTitle: "RevOps Manager",
    industry: "Financial services",
    employeeRange: "51-200",
    rawMessage:
      "Interested in connecting qualification, approvals, and finance ops more cleanly.",
    status: "scored",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Financial services",
      employeeRange: "51-200",
      companyDescription:
        "Finance operations provider coordinating intake, approvals, and downstream account onboarding.",
      website: "https://www.meridianledger.com",
      linkedInUrl: "https://www.linkedin.com/company/meridian-ledger",
      technologies: ["HubSpot", "Slack", "DocuSign"],
      foundedYear: 2017,
    },
    score: {
      numericScore: 74,
      fitLabel: "medium_fit",
      reasoning:
        "Relevant operating signals and a credible RevOps owner make this worth pursuing, though the pain is still framed at a moderate level rather than urgent transformation.",
      missingFields: ["current process failure rate"],
      confidenceScore: 0.88,
    },
  },
  {
    id: "lead-terrace",
    sourceType: "webhook",
    sourceName: "Partner webhook demo",
    createdHoursAgo: 52,
    updatedHoursAgo: 50,
    fullName: "Ethan Cole",
    email: "ethan.cole@terracecommerce.io",
    phone: "+1 512 555 0108",
    companyName: "Terrace Commerce",
    companyDomain: "terracecommerce.io",
    jobTitle: "Lifecycle Marketing Lead",
    industry: "Ecommerce",
    employeeRange: "11-50",
    rawMessage:
      "We are curious about AI operations, but mostly for campaign reporting and email summarization.",
    status: "low_priority",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Ecommerce",
      employeeRange: "11-50",
      companyDescription:
        "Smaller ecommerce team focused on campaign operations and reporting.",
      website: "https://www.terracecommerce.io",
      linkedInUrl: "https://www.linkedin.com/company/terrace-commerce",
      technologies: ["Klaviyo", "Shopify", "Google Sheets"],
      foundedYear: 2021,
    },
    score: {
      numericScore: 39,
      fitLabel: "low_fit",
      reasoning:
        "The team is small and the use case is oriented toward marketing reporting rather than revenue-to-operations handoff or document workflows.",
      missingFields: [],
      confidenceScore: 0.9,
    },
  },
  {
    id: "lead-harbor",
    sourceType: "form",
    sourceName: "Website contact form",
    createdHoursAgo: 172,
    updatedHoursAgo: 170,
    fullName: "Hana Yusuf",
    email: "hana.yusuf@harborcare.co",
    phone: "+1 713 555 0162",
    companyName: "HarborCare Collective",
    companyDomain: "harborcare.co",
    jobTitle: "Chief of Staff",
    industry: "Healthcare",
    employeeRange: "11-50",
    rawMessage:
      "We have a lot of admin work, but are still figuring out our priorities.",
    status: "low_priority",
    enrichment: {
      provider: "mock-enrichment",
      status: "partial",
      industry: "Healthcare",
      employeeRange: "11-50",
      companyDescription:
        "Small care coordination business with light operations tooling and limited process complexity.",
      website: "https://www.harborcare.co",
      linkedInUrl: "https://www.linkedin.com/company/harborcare-collective",
      technologies: ["Google Workspace", "Airtable"],
      foundedYear: 2022,
    },
    score: {
      numericScore: 33,
      fitLabel: "low_fit",
      reasoning:
        "The business is still early and the automation need is broad but not clearly tied to high-friction revenue or document workflows.",
      missingFields: ["workflow owner"],
      confidenceScore: 0.83,
    },
  },
  {
    id: "lead-bricklane",
    sourceType: "csv",
    sourceName: "Referral network CSV",
    createdHoursAgo: 240,
    updatedHoursAgo: 238,
    fullName: "Mateo Ruiz",
    email: "mateo.ruiz@bricklaneadvisors.com",
    phone: "+1 917 555 0122",
    companyName: "Bricklane Advisors",
    companyDomain: "bricklaneadvisors.com",
    jobTitle: "Managing Partner",
    industry: "Professional services",
    employeeRange: "1-10",
    rawMessage:
      "Looking for AI help across the business, but there is no clear operational initiative yet.",
    status: "low_priority",
    enrichment: {
      provider: "mock-enrichment",
      status: "success",
      industry: "Professional services",
      employeeRange: "1-10",
      companyDescription:
        "Small advisory practice with limited process volume and a broad, exploratory interest in AI.",
      website: "https://www.bricklaneadvisors.com",
      linkedInUrl: "https://www.linkedin.com/company/bricklane-advisors",
      technologies: ["Google Workspace"],
      foundedYear: 2020,
    },
    score: {
      numericScore: 24,
      fitLabel: "low_fit",
      reasoning:
        "The company is very small and the request is generic, with no strong signal around workflow automation or document-heavy operations.",
      missingFields: [],
      confidenceScore: 0.91,
    },
  },
  {
    id: "lead-summit",
    sourceType: "form",
    sourceName: "Ops assessment form",
    createdHoursAgo: 14,
    updatedHoursAgo: 11,
    fullName: "Zoe Carter",
    email: "zoe.carter@summitstaffing.io",
    phone: "+1 404 555 0110",
    companyName: "Summit Staffing",
    companyDomain: "summitstaffing.io",
    jobTitle: "Director of Growth Operations",
    industry: "Staffing",
    employeeRange: "51-200",
    rawMessage:
      "We are juggling intake quality, document collection, and recruiter handoffs across multiple teams.",
    status: "review_needed",
    enrichment: {
      provider: "mock-enrichment",
      status: "partial",
      industry: "Staffing",
      employeeRange: "51-200",
      companyDescription:
        "Staffing team coordinating lead intake, recruiter ops, and onboarding document collection.",
      website: "https://www.summitstaffing.io",
      linkedInUrl: "https://www.linkedin.com/company/summit-staffing-io",
      technologies: ["HubSpot", "Slack"],
      foundedYear: 2016,
    },
    score: {
      numericScore: 78,
      fitLabel: "medium_fit",
      reasoning:
        "There are meaningful workflow signals here, but the available context leaves open questions about scale, tooling depth, and where the highest-value bottleneck sits.",
      missingFields: ["document volume", "implementation owner"],
      confidenceScore: 0.74,
    },
    createReviewTask: true,
  },
  {
    id: "lead-clearline",
    sourceType: "csv",
    sourceName: "Partner leads CSV",
    createdHoursAgo: 34,
    updatedHoursAgo: 28,
    fullName: "Leo Martinez",
    email: "leo.martinez@clearlineenergy.com",
    phone: "+1 602 555 0180",
    companyName: "Clearline Energy Services",
    companyDomain: "clearlineenergy.com",
    jobTitle: "Operations Program Manager",
    industry: "Energy services",
    employeeRange: "201-500",
    rawMessage:
      "There may be a fit around approvals and field ops paperwork, but we need to sort through the edge cases first.",
    status: "review_needed",
    enrichment: {
      provider: "mock-enrichment",
      status: "partial",
      industry: "Energy services",
      employeeRange: "201-500",
      companyDescription:
        "Distributed services business managing field intake, approvals, and compliance paperwork.",
      website: "https://www.clearlineenergy.com",
      linkedInUrl: "https://www.linkedin.com/company/clearline-energy-services",
      technologies: ["Salesforce", "Slack", "SharePoint"],
      foundedYear: 2012,
    },
    score: {
      numericScore: 81,
      fitLabel: "medium_fit",
      reasoning:
        "The company profile is promising, but the operational story is still incomplete and the workflow complexity is inferred more than directly evidenced.",
      missingFields: ["crm workflow ownership", "doc approval SLA"],
      confidenceScore: 0.76,
    },
    createReviewTask: true,
  },
  {
    id: "lead-hinterland",
    sourceType: "form",
    sourceName: "Website intake",
    createdHoursAgo: 1,
    updatedHoursAgo: 1,
    fullName: "Sara Malik",
    email: "sara.malik@hinterlandbio.com",
    phone: "+1 617 555 0128",
    companyName: "Hinterland Bio",
    companyDomain: "hinterlandbio.com",
    jobTitle: "Revenue Strategy Manager",
    industry: "Biotech",
    employeeRange: null,
    rawMessage:
      "Curious whether you support qualification and onboarding workflow design.",
    status: "new",
    enrichment: null,
    score: null,
  },
  {
    id: "lead-westpeak",
    sourceType: "form",
    sourceName: "Website intake",
    createdHoursAgo: 5,
    updatedHoursAgo: 5,
    fullName: "Imran Ali",
    email: "imran.ali@westpeakindustrial.com",
    phone: "+1 206 555 0146",
    companyName: "Westpeak Industrial",
    companyDomain: "westpeakindustrial.com",
    jobTitle: "Operations Director",
    industry: "Industrial services",
    employeeRange: null,
    rawMessage:
      "We are evaluating process automation support for intake and approvals.",
    status: "new",
    enrichment: null,
    score: null,
  },
];

const documentSeeds: DocumentSeed[] = [
  {
    id: "document-invoice-approved",
    documentType: "invoice",
    fileName: "northbeam-invoice-q2-services.pdf",
    fixturePath: "docs/demo-documents/invoice/clean-invoice.txt",
    mimeType: "application/pdf",
    createdHoursAgo: 8,
    updatedHoursAgo: 6,
    status: "approved",
  },
  {
    id: "document-invoice-review",
    documentType: "invoice",
    fileName: "northbeam-scanned-receipt-review.png",
    fixturePath: "docs/demo-documents/invoice/scanned-receipt.txt",
    mimeType: "image/png",
    createdHoursAgo: 18,
    updatedHoursAgo: 14,
    status: "review_needed",
  },
  {
    id: "document-invoice-processing",
    documentType: "invoice",
    fileName: "northbeam-invoice-processing.pdf",
    fixturePath: "docs/demo-documents/invoice/multi-page-invoice.txt",
    mimeType: "application/pdf",
    createdHoursAgo: 3,
    updatedHoursAgo: 2,
    status: "extracting_structured",
  },
  {
    id: "document-onboarding-approved",
    documentType: "onboarding_form",
    fileName: "northbeam-onboarding-approved.pdf",
    fixturePath: "docs/demo-documents/onboarding_form/clean-onboarding.txt",
    mimeType: "application/pdf",
    createdHoursAgo: 72,
    updatedHoursAgo: 50,
    status: "approved",
    reviewerAction: "edit_approve",
    reviewerOverrides: {
      notes: "Start date verified by onboarding coordinator on final review.",
    },
  },
  {
    id: "document-onboarding-review",
    documentType: "onboarding_form",
    fileName: "northbeam-onboarding-review.pdf",
    fixturePath: "docs/demo-documents/onboarding_form/partial-onboarding.txt",
    mimeType: "application/pdf",
    createdHoursAgo: 30,
    updatedHoursAgo: 26,
    status: "review_needed",
  },
  {
    id: "document-agreement-approved",
    documentType: "agreement",
    fileName: "northbeam-master-services-agreement.pdf",
    fixturePath: "docs/demo-documents/agreement/clean-agreement.txt",
    mimeType: "application/pdf",
    createdHoursAgo: 196,
    updatedHoursAgo: 192,
    status: "approved",
  },
  {
    id: "document-agreement-failed",
    documentType: "agreement",
    fileName: "northbeam-agreement-failed.pdf",
    fixturePath: "docs/demo-documents/agreement/table-agreement.txt",
    mimeType: "application/pdf",
    createdHoursAgo: 12,
    updatedHoursAgo: 9,
    status: "failed",
    processingError:
      "Structured extraction hit a deterministic validation failure while parsing conflicting agreement dates.",
  },
  {
    id: "document-pending-upload",
    documentType: "agreement",
    fileName: "northbeam-newly-uploaded-agreement.pdf",
    fixturePath: null,
    mimeType: "application/pdf",
    createdHoursAgo: 0.5,
    updatedHoursAgo: 0.5,
    status: "pending",
  },
];

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function splitPages(rawText: string) {
  return rawText
    .split(/\n===PAGE===\n/g)
    .map((page) => page.trim())
    .filter((page) => page.length > 0);
}

function isScannedMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

function buildLeadRawPayload(seed: LeadSeed, seededAt: string) {
  return {
    submittedVia: "day26-demo-seed",
    message: seed.rawMessage,
    seededAt,
  } satisfies Prisma.InputJsonValue;
}

function buildLeadEnrichmentPayload(seed: LeadSeed, seededAt: string) {
  if (!seed.enrichment) {
    return null;
  }

  return {
    rawPayload: {
      provider: seed.enrichment.provider,
      seededAt,
      domain: seed.companyDomain,
    } satisfies Prisma.InputJsonValue,
    normalizedData: {
      companyDescription: seed.enrichment.companyDescription,
      industry: seed.enrichment.industry,
      employeeRange: seed.enrichment.employeeRange,
      website: seed.enrichment.website,
      linkedInUrl: seed.enrichment.linkedInUrl,
      technologies: seed.enrichment.technologies,
      foundedYear: seed.enrichment.foundedYear,
    } satisfies Prisma.InputJsonValue,
  };
}

function buildSalesAssistRecords(seed: LeadSeed) {
  if (!seed.salesAssist) {
    return [];
  }

  return [
    {
      type: "summary" as const,
      content: seed.salesAssist.summary,
    },
    {
      type: "followup" as const,
      content: seed.salesAssist.followup,
    },
    {
      type: "brief" as const,
      content: seed.salesAssist.brief,
    },
  ];
}

async function clearWorkspaceData(workspaceId: string) {
  await prisma.$transaction([
    prisma.approvalAction.deleteMany({ where: { workspaceId } }),
    prisma.reviewTask.deleteMany({ where: { workspaceId } }),
    prisma.auditLog.deleteMany({ where: { workspaceId } }),
    prisma.salesAssistArtifact.deleteMany({ where: { workspaceId } }),
    prisma.leadScore.deleteMany({ where: { workspaceId } }),
    prisma.leadEnrichment.deleteMany({ where: { workspaceId } }),
    prisma.cRMContactSync.deleteMany({ where: { workspaceId } }),
    prisma.extractedField.deleteMany({ where: { workspaceId } }),
    prisma.extractedRecord.deleteMany({ where: { workspaceId } }),
    prisma.documentPage.deleteMany({ where: { workspaceId } }),
    prisma.document.deleteMany({ where: { workspaceId } }),
    prisma.leadSubmissionAttempt.deleteMany({ where: { workspaceId } }),
    prisma.lead.deleteMany({ where: { workspaceId } }),
    prisma.leadSource.deleteMany({ where: { workspaceId } }),
    prisma.integrationConnection.deleteMany({ where: { workspaceId } }),
  ]);
}

async function upsertWorkspace() {
  return prisma.workspace.upsert({
    where: {
      clerkOrgId: workspaceSeed.clerkOrgId,
    },
    update: {
      name: workspaceSeed.name,
      slug: workspaceSeed.slug,
      plan: "pro",
      leadScoringCriteria: DEFAULT_LEAD_SCORING_CRITERIA,
    },
    create: {
      clerkOrgId: workspaceSeed.clerkOrgId,
      slug: workspaceSeed.slug,
      name: workspaceSeed.name,
      plan: "pro",
      leadScoringCriteria: DEFAULT_LEAD_SCORING_CRITERIA,
    },
  });
}

async function createIntegrationConnections(workspaceId: string, seededAt: string) {
  await prisma.integrationConnection.createMany({
    data: [
      {
        workspaceId,
        provider: "hubspot",
        status: "connected",
        accessToken: null,
        refreshToken: null,
        connectedAt: hoursAgo(200),
        metadata: {
          mode: "demo-seed",
          portalId: demoHubSpotPortalId,
          accountName: demoHubSpotAccountName,
          seededAt,
        },
      },
      {
        workspaceId,
        provider: "slack",
        status: "connected",
        accessToken: null,
        refreshToken: null,
        connectedAt: hoursAgo(200),
        metadata: {
          mode: "demo-seed",
          channel: "#northbeam-demo",
          seededAt,
        },
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId,
        eventType: "workspace.created",
        entityType: "workspace",
        entityId: workspaceId,
        metadataJson: {
          seeded: true,
          seededAt,
        },
        createdAt: hoursAgo(200),
      },
      {
        workspaceId,
        eventType: "integration.hubspot.connected",
        entityType: "workspace",
        entityId: workspaceId,
        metadataJson: {
          provider: "hubspot",
          portalId: demoHubSpotPortalId,
          seeded: true,
        },
        createdAt: hoursAgo(199),
      },
      {
        workspaceId,
        eventType: "integration.slack.updated",
        entityType: "workspace",
        entityId: workspaceId,
        metadataJson: {
          provider: "slack",
          seeded: true,
        },
        createdAt: hoursAgo(199),
      },
    ],
  });
}

async function createLeadSources(
  workspaceId: string
): Promise<Record<string, { id: string }>> {
  const uniqueSources = Array.from(
    new Map(
      leadSeeds.map((seed) => [
        `${seed.sourceType}:${seed.sourceName}`,
        { type: seed.sourceType, name: seed.sourceName },
      ])
    ).values()
  );

  const created = await Promise.all(
    uniqueSources.map((source) =>
      prisma.leadSource.create({
        data: {
          workspaceId,
          type: source.type,
          name: source.name,
          config: {
            seeded: true,
            source: "day26-demo-seed",
          },
        },
        select: {
          id: true,
          type: true,
          name: true,
        },
      })
    )
  );

  return Object.fromEntries(
    created.map((source) => [`${source.type}:${source.name}`, { id: source.id }])
  );
}

function scopedSeedId(workspaceId: string, seedId: string) {
  return `${workspaceId}--${seedId}`;
}

async function seedLead(workspaceId: string, sourceId: string, seed: LeadSeed, seededAt: string) {
  const createdAt = hoursAgo(seed.createdHoursAgo);
  const updatedAt = hoursAgo(seed.updatedHoursAgo);
  const enrichmentPayload = buildLeadEnrichmentPayload(seed, seededAt);
  const leadId = scopedSeedId(workspaceId, seed.id);

  await prisma.lead.create({
    data: {
      id: leadId,
      workspaceId,
      leadSourceId: sourceId,
      fullName: seed.fullName,
      email: seed.email,
      phone: seed.phone,
      companyName: seed.companyName,
      companyDomain: seed.companyDomain,
      jobTitle: seed.jobTitle,
      industry: seed.enrichment?.industry ?? seed.industry,
      employeeRange: seed.enrichment?.employeeRange ?? seed.employeeRange,
      rawPayloadJson: buildLeadRawPayload(seed, seededAt),
      status: seed.status,
      processingStatus: seed.score ? "completed" : null,
      processingRunId: seed.score ? `seed-lead-run-${seed.id}` : null,
      processingError: null,
      processedAt: seed.score ? updatedAt : null,
      createdAt,
      updatedAt,
    },
  });

  if (seed.enrichment && enrichmentPayload) {
    await prisma.leadEnrichment.create({
      data: {
        workspaceId,
        leadId,
        provider: seed.enrichment.provider,
        status: seed.enrichment.status,
        rawPayloadJson: enrichmentPayload.rawPayload,
        normalizedData: enrichmentPayload.normalizedData,
        enrichedAt: new Date(createdAt.getTime() + 45 * 60 * 1000),
      },
    });
  }

  if (seed.score) {
    await prisma.leadScore.create({
      data: {
        workspaceId,
        leadId,
        numericScore: seed.score.numericScore,
        fitLabel: seed.score.fitLabel,
        reasoning: seed.score.reasoning,
        missingDataJson: seed.score.missingFields,
        confidenceScore: seed.score.confidenceScore,
        modelUsed: seed.score.modelUsed ?? LEAD_SCORING_MODEL,
        promptVersion: LEAD_SCORING_PROMPT_VERSION,
        tokenUsage: 450 + seed.score.numericScore,
        latencyMs: 1200 + seed.score.numericScore,
        scoredAt: new Date(createdAt.getTime() + 90 * 60 * 1000),
      },
    });
  }

  if (seed.sync) {
    await prisma.cRMContactSync.create({
      data: {
        workspaceId,
        leadId,
        provider: "hubspot",
        externalContactId: seed.sync.externalContactId,
        syncStatus: "synced",
        errorMessage: null,
        contactUrl: seed.sync.contactUrl,
        lastSyncedAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        retryCount: seed.sync.retryCount ?? 0,
        createdAt: new Date(createdAt.getTime() + 110 * 60 * 1000),
        updatedAt,
      },
    });
  }

  const salesAssistRecords = buildSalesAssistRecords(seed);
  if (salesAssistRecords.length > 0) {
    await prisma.salesAssistArtifact.createMany({
      data: salesAssistRecords.map((artifact, index) => ({
        workspaceId,
        leadId,
        type: artifact.type,
        content: artifact.content,
        modelUsed: SALES_ASSIST_MODEL,
        promptVersion: SALES_ASSIST_PROMPT_VERSION,
        tokenUsage: 600 + index * 75,
        latencyMs: 900 + index * 120,
        generatedAt: new Date(createdAt.getTime() + (3 + index) * 60 * 60 * 1000),
      })),
    });
  }

  if (seed.createReviewTask) {
    await prisma.reviewTask.create({
      data: {
        id: scopedSeedId(workspaceId, `review-${seed.id}`),
        workspaceId,
        entityType: "lead",
        entityId: leadId,
        status: "pending",
        createdAt: new Date(createdAt.getTime() + 105 * 60 * 1000),
      },
    });
  }

  const auditEntries: Prisma.AuditLogCreateManyInput[] = [
    {
      workspaceId,
      eventType: "lead.created",
      entityType: "lead",
      entityId: leadId,
      metadataJson: {
        seeded: true,
        sourceType: seed.sourceType,
        sourceName: seed.sourceName,
        email: seed.email,
        companyName: seed.companyName,
      },
      createdAt,
    },
  ];

  if (seed.score) {
    auditEntries.push(
      {
        workspaceId,
        eventType: "lead.process.enqueued",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          triggerRunId: `seed-lead-run-${seed.id}`,
        },
        createdAt: new Date(createdAt.getTime() + 5 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "lead.process.started",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          triggerRunId: `seed-lead-run-${seed.id}`,
          attempt: 1,
        },
        createdAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
      }
    );
  }

  if (seed.enrichment) {
    auditEntries.push(
      {
        workspaceId,
        eventType: "lead.enrich.started",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          provider: seed.enrichment.provider,
          attempt: 1,
        },
        createdAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
      },
      {
        workspaceId,
        eventType:
          seed.enrichment.status === "partial"
            ? "lead.enrich.partial"
            : "lead.enrich.completed",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          provider: seed.enrichment.provider,
          enrichmentStatus: seed.enrichment.status,
        },
        createdAt: new Date(createdAt.getTime() + 45 * 60 * 1000),
      }
    );
  }

  if (seed.score) {
    auditEntries.push(
      {
        workspaceId,
        eventType: "lead.score.started",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          attempt: 1,
        },
        createdAt: new Date(createdAt.getTime() + 70 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "lead.score.completed",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          fitLabel: seed.score.fitLabel,
          finalStatus: seed.status,
          numericScore: seed.score.numericScore,
          confidenceScore: seed.score.confidenceScore,
        },
        createdAt: new Date(createdAt.getTime() + 90 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "lead.process.completed",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          result: `Lead processing completed with status ${seed.status}.`,
          fitLabel: seed.score.fitLabel,
          finalStatus: seed.status,
        },
        createdAt: new Date(createdAt.getTime() + 95 * 60 * 1000),
      }
    );
  }

  if (seed.sync) {
    auditEntries.push(
      {
        workspaceId,
        eventType: "lead.hubspot_sync.enqueued",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          provider: "hubspot",
        },
        createdAt: new Date(createdAt.getTime() + 100 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "lead.hubspot_sync.started",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          provider: "hubspot",
          attempt: 1,
        },
        createdAt: new Date(createdAt.getTime() + 110 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "lead.hubspot_sync.completed",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          provider: "hubspot",
          syncStatus: "synced",
          externalContactId: seed.sync.externalContactId,
          contactUrl: seed.sync.contactUrl,
        },
        createdAt: new Date(createdAt.getTime() + 120 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "notification.slack.sent",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          seeded: true,
          notificationType: "qualified_lead",
        },
        createdAt: new Date(createdAt.getTime() + 125 * 60 * 1000),
      }
    );
  }

  if (seed.createReviewTask) {
    auditEntries.push({
      workspaceId,
      eventType: "notification.slack.sent",
      entityType: "lead",
      entityId: leadId,
      metadataJson: {
        seeded: true,
        notificationType: "review_needed",
      },
      createdAt: new Date(createdAt.getTime() + 106 * 60 * 1000),
    });
  }

  salesAssistRecords.forEach((artifact, index) => {
    auditEntries.push({
      workspaceId,
      eventType: "lead.sales_assist.generated",
      entityType: "lead",
      entityId: leadId,
      metadataJson: {
        seeded: true,
        artifactType: artifact.type,
      },
      createdAt: new Date(createdAt.getTime() + (3 + index) * 60 * 60 * 1000),
    });
  });

  await prisma.auditLog.createMany({
    data: auditEntries,
  });
}

function getMinimumFieldConfidence(fields: Array<{ confidenceScore: number }>) {
  return fields.reduce(
    (minimum, field) => Math.min(minimum, field.confidenceScore),
    1
  );
}

function normalizeDocumentExtractionForStatus(
  extraction: Awaited<ReturnType<typeof extractStructuredDocumentData>>,
  status: DocumentSeedStatus
) {
  if (status === "approved") {
    const fields = extraction.result.fields.map((field) => ({
      ...field,
      confidenceScore: Math.max(field.confidenceScore, 0.9),
    }));

    return {
      ...extraction,
      result: {
        ...extraction.result,
        confidenceScore: Math.max(extraction.result.confidenceScore, 0.91),
        fields,
      },
    };
  }

  if (status === "review_needed") {
    const fields = extraction.result.fields.map((field, index) => ({
      ...field,
      confidenceScore:
        index % 3 === 0
          ? Math.min(field.confidenceScore, 0.71)
          : Math.min(field.confidenceScore, 0.8),
    }));

    return {
      ...extraction,
      result: {
        ...extraction.result,
        confidenceScore: Math.min(extraction.result.confidenceScore, 0.79),
        fields,
      },
    };
  }

  return extraction;
}

async function seedDocument(workspaceId: string, seed: DocumentSeed, seededAt: string) {
  const createdAt = hoursAgo(seed.createdHoursAgo);
  const updatedAt = hoursAgo(seed.updatedHoursAgo);
  const storageKey = `demo-assets/${seed.documentType}/${seed.fileName}`;
  const documentId = scopedSeedId(workspaceId, seed.id);

  await prisma.document.create({
    data: {
      id: documentId,
      workspaceId,
      fileName: seed.fileName,
      mimeType: seed.mimeType,
      documentType: seed.documentType,
      storageKey,
      fileSize: seed.fixturePath ? 2048 : 1024,
      uploadStatus: "uploaded",
      processingStatus:
        seed.status === "extracting_structured"
          ? "extracting_structured"
          : seed.status === "failed"
            ? "failed"
            : seed.status === "review_needed"
              ? "review_needed"
              : seed.status === "approved"
                ? "approved"
                : "pending",
      processingRunId:
        seed.status === "pending" ? null : `seed-document-run-${seed.id}`,
      processingError: seed.processingError ?? null,
      createdAt,
      updatedAt,
    },
  });

  const auditEntries: Prisma.AuditLogCreateManyInput[] = [
    {
      workspaceId,
      eventType: "document.upload.completed",
      entityType: "document",
      entityId: documentId,
      metadataJson: {
        seeded: true,
        source: "day26-demo-seed",
        fileName: seed.fileName,
      },
      createdAt,
    },
  ];

  if (!seed.fixturePath) {
    await prisma.auditLog.createMany({ data: auditEntries });
    return;
  }

  const rawText = await readFile(path.join(process.cwd(), seed.fixturePath), "utf8");
  const pages = splitPages(rawText).map((pageText, index) => ({
    pageNumber: index + 1,
    rawText: pageText,
    ocrUsed: isScannedMimeType(seed.mimeType),
  }));

  await prisma.documentPage.createMany({
    data: pages.map((page) => ({
      workspaceId,
      documentId,
      pageNumber: page.pageNumber,
      rawText: page.rawText,
      ocrUsed: page.ocrUsed,
      metadata: {
        source: page.ocrUsed ? "demo-ocr-fixture" : "demo-text-fixture",
        seededAt,
        char_count: page.rawText.length,
      },
      createdAt: new Date(createdAt.getTime() + page.pageNumber * 5 * 60 * 1000),
    })),
  });

  auditEntries.push(
    {
      workspaceId,
      eventType: "document.extract_text.completed",
      entityType: "document",
      entityId: documentId,
      metadataJson: {
        seeded: true,
        totalPages: pages.length,
        ocrUsed: pages.some((page) => page.ocrUsed),
      },
      createdAt: new Date(createdAt.getTime() + 20 * 60 * 1000),
    }
  );

  if (seed.status === "extracting_structured") {
    auditEntries.push({
      workspaceId,
      eventType: "document.extract_structured.started",
      entityType: "document",
      entityId: documentId,
      metadataJson: {
        seeded: true,
        attempt: 1,
        triggerRunId: `seed-document-run-${seed.id}`,
      },
      createdAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
    });

    await prisma.auditLog.createMany({ data: auditEntries });
    return;
  }

  if (seed.status === "failed") {
    auditEntries.push(
      {
        workspaceId,
        eventType: "document.extract_structured.started",
        entityType: "document",
        entityId: documentId,
        metadataJson: {
          seeded: true,
          attempt: 1,
          triggerRunId: `seed-document-run-${seed.id}`,
        },
        createdAt: new Date(createdAt.getTime() + 25 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "document.extract_structured.failed",
        entityType: "document",
        entityId: documentId,
        metadataJson: {
          seeded: true,
          error: seed.processingError,
          attempt: 3,
        },
        createdAt: new Date(createdAt.getTime() + 40 * 60 * 1000),
      },
      {
        workspaceId,
        eventType: "notification.slack.sent",
        entityType: "document",
        entityId: documentId,
        metadataJson: {
          seeded: true,
          notificationType: "document_processing_failure",
        },
        createdAt: new Date(createdAt.getTime() + 42 * 60 * 1000),
      }
    );

    await prisma.auditLog.createMany({ data: auditEntries });
    return;
  }

  const extractionResult = normalizeDocumentExtractionForStatus(
    await extractStructuredDocumentData({
      documentType: seed.documentType,
      fileName: seed.fileName,
      pages,
    }),
    seed.status
  );
  const requiresReview =
    seed.status === "review_needed" ||
    getMinimumFieldConfidence(extractionResult.result.fields) <
      DOCUMENT_FIELD_REVIEW_THRESHOLD ||
    extractionResult.result.confidenceScore < DOCUMENT_OVERALL_REVIEW_THRESHOLD;

  await prisma.extractedRecord.create({
    data: {
      id: scopedSeedId(workspaceId, `record-${seed.id}`),
      workspaceId,
      documentId,
      schemaType: extractionResult.result.schemaType,
      extractionJson: toPrismaJson(extractionResult.result.extraction),
      confidenceScore: extractionResult.result.confidenceScore,
      requiresReview,
      modelUsed: extractionResult.modelUsed,
      promptVersion: extractionResult.promptVersion,
      tokenUsage:
        typeof extractionResult.tokenUsage === "number"
          ? Math.round(extractionResult.tokenUsage)
          : 640,
      latencyMs: extractionResult.latencyMs,
      extractedAt: new Date(createdAt.getTime() + 35 * 60 * 1000),
      fields: {
        create: extractionResult.result.fields.map((field) => ({
          workspaceId,
          fieldName: field.fieldName,
          fieldValue: field.fieldValue,
          confidenceScore: field.confidenceScore,
          sourceSnippet: field.sourceSnippet,
          reviewerOverrideValue: seed.reviewerOverrides?.[field.fieldName] ?? null,
          isOverridden: Boolean(seed.reviewerOverrides?.[field.fieldName]),
        })),
      },
    },
  });

  auditEntries.push({
    workspaceId,
    eventType:
      seed.status === "review_needed"
        ? "document.extract_structured.review_needed"
        : "document.extract_structured.completed",
    entityType: "document",
    entityId: documentId,
    metadataJson: {
      seeded: true,
      confidenceScore: extractionResult.result.confidenceScore,
      fieldCount: extractionResult.result.fields.length,
      requiresReview,
    },
    createdAt: new Date(createdAt.getTime() + 35 * 60 * 1000),
  });

  if (seed.status === "review_needed") {
    await prisma.reviewTask.create({
      data: {
        id: scopedSeedId(workspaceId, `review-${seed.id}`),
        workspaceId,
        entityType: "document",
        entityId: documentId,
        status: "pending",
        createdAt: new Date(createdAt.getTime() + 36 * 60 * 1000),
      },
    });
  }

  if (seed.reviewerAction) {
    await prisma.reviewTask.create({
      data: {
        id: scopedSeedId(workspaceId, `review-${seed.id}`),
        workspaceId,
        entityType: "document",
        entityId: documentId,
        status: "approved",
        createdAt: new Date(createdAt.getTime() + 36 * 60 * 1000),
        resolvedAt: new Date(createdAt.getTime() + 42 * 60 * 1000),
        resolvedByUserId: demoReviewerUserId,
        approvalActions: {
          create: {
            workspaceId,
            action: seed.reviewerAction,
            actorUserId: demoReviewerUserId,
            changesJson: seed.reviewerOverrides ?? {},
            createdAt: new Date(createdAt.getTime() + 42 * 60 * 1000),
          },
        },
      },
    });

    auditEntries.push({
      workspaceId,
      eventType:
        seed.reviewerAction === "edit_approve"
          ? "document.review.edit_approved"
          : "document.review.approved",
      entityType: "document",
      entityId: documentId,
      metadataJson: {
        seeded: true,
        actorUserId: demoReviewerUserId,
      },
      createdAt: new Date(createdAt.getTime() + 42 * 60 * 1000),
    });
  }

  await prisma.auditLog.createMany({
    data: auditEntries,
  });
}

async function main() {
  const seededAt = new Date().toISOString();
  const workspace = await upsertWorkspace();
  await clearWorkspaceData(workspace.id);
  await createIntegrationConnections(workspace.id, seededAt);
  const sources = await createLeadSources(workspace.id);

  for (const lead of leadSeeds) {
    const source = sources[`${lead.sourceType}:${lead.sourceName}`];
    if (!source) {
      throw new Error(`Missing lead source for ${lead.sourceType}:${lead.sourceName}`);
    }

    await seedLead(workspace.id, source.id, lead, seededAt);
  }

  for (const document of documentSeeds) {
    await seedDocument(workspace.id, document, seededAt);
  }

  console.log(
    `Seeded demo workspace "${workspace.name}" (${workspace.id}) with ${leadSeeds.length} leads and ${documentSeeds.length} documents.`
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
