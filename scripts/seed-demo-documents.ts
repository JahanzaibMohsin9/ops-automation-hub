import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { DocumentType, Prisma } from "../src/generated/prisma/client";
import { PrismaClient } from "../src/generated/prisma/client";
import { extractStructuredDocumentData, toPrismaJson } from "../src/features/documents/structured-extraction-client";
import { DOCUMENT_FIELD_REVIEW_THRESHOLD } from "../src/features/documents/structured-extraction";

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

type DocumentFixture = {
  id: string;
  documentType: DocumentType;
  fileName: string;
  fixturePath: string;
  mimeType: string;
  markExported?: boolean;
};

const demoDocuments: DocumentFixture[] = [
  {
    id: "invoice-clean",
    documentType: "invoice",
    fileName: "northbeam-invoice-clean.pdf",
    fixturePath: "docs/demo-documents/invoice/clean-invoice.txt",
    mimeType: "application/pdf",
    markExported: true,
  },
  {
    id: "invoice-multi-page",
    documentType: "invoice",
    fileName: "northbeam-invoice-multi-page.pdf",
    fixturePath: "docs/demo-documents/invoice/multi-page-invoice.txt",
    mimeType: "application/pdf",
  },
  {
    id: "invoice-scanned-receipt",
    documentType: "invoice",
    fileName: "northbeam-scanned-receipt.png",
    fixturePath: "docs/demo-documents/invoice/scanned-receipt.txt",
    mimeType: "image/png",
  },
  {
    id: "onboarding-clean",
    documentType: "onboarding_form",
    fileName: "northbeam-onboarding-clean.pdf",
    fixturePath: "docs/demo-documents/onboarding_form/clean-onboarding.txt",
    mimeType: "application/pdf",
  },
  {
    id: "onboarding-partial",
    documentType: "onboarding_form",
    fileName: "northbeam-onboarding-partial.pdf",
    fixturePath: "docs/demo-documents/onboarding_form/partial-onboarding.txt",
    mimeType: "application/pdf",
  },
  {
    id: "onboarding-multi-page",
    documentType: "onboarding_form",
    fileName: "northbeam-onboarding-multi-page.pdf",
    fixturePath: "docs/demo-documents/onboarding_form/multi-page-onboarding.txt",
    mimeType: "application/pdf",
    markExported: true,
  },
  {
    id: "agreement-clean",
    documentType: "agreement",
    fileName: "northbeam-msa-clean.pdf",
    fixturePath: "docs/demo-documents/agreement/clean-agreement.txt",
    mimeType: "application/pdf",
  },
  {
    id: "agreement-table",
    documentType: "agreement",
    fileName: "northbeam-sow-table.pdf",
    fixturePath: "docs/demo-documents/agreement/table-agreement.txt",
    mimeType: "application/pdf",
  },
  {
    id: "agreement-illegible",
    documentType: "agreement",
    fileName: "northbeam-msa-illegible.jpg",
    fixturePath: "docs/demo-documents/agreement/illegible-agreement.txt",
    mimeType: "image/jpeg",
  },
];

function splitPages(rawText: string) {
  return rawText
    .split(/\n===PAGE===\n/g)
    .map((page) => page.trim())
    .filter((page) => page.length > 0);
}

function isScannedMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

function getMinimumFieldConfidence(fields: Array<{ confidenceScore: number }>) {
  return fields.reduce(
    (minimum, field) => Math.min(minimum, field.confidenceScore),
    1
  );
}

async function seedDocument(
  workspaceId: string,
  fixture: DocumentFixture,
  seededAt: string
) {
  const fixtureAbsolutePath = path.join(process.cwd(), fixture.fixturePath);
  const rawText = await readFile(fixtureAbsolutePath, "utf8");
  const pageBodies = splitPages(rawText);
  const pages = pageBodies.map((pageText, index) => ({
    pageNumber: index + 1,
    rawText: pageText,
    ocrUsed: isScannedMimeType(fixture.mimeType),
  }));

  const extraction = await extractStructuredDocumentData({
    documentType: fixture.documentType,
    fileName: fixture.fileName,
    pages,
  });
  const minimumFieldConfidence = getMinimumFieldConfidence(extraction.result.fields);
  const requiresReview =
    extraction.result.confidenceScore < DOCUMENT_FIELD_REVIEW_THRESHOLD ||
    minimumFieldConfidence < DOCUMENT_FIELD_REVIEW_THRESHOLD;

  const processingStatus = fixture.markExported
    ? "exported"
    : requiresReview
      ? "review_needed"
      : "approved";

  const storageKey = `demo/${fixture.documentType}/${fixture.id}`;

  await prisma.$transaction(async (tx) => {
    const document = await tx.document.upsert({
      where: {
        workspaceId_storageKey: {
          workspaceId,
          storageKey,
        },
      },
      update: {
        fileName: fixture.fileName,
        mimeType: fixture.mimeType,
        fileSize: Buffer.byteLength(rawText, "utf8"),
        documentType: fixture.documentType,
        uploadStatus: "uploaded",
        processingStatus,
        processingError: null,
      },
      create: {
        workspaceId,
        fileName: fixture.fileName,
        mimeType: fixture.mimeType,
        fileSize: Buffer.byteLength(rawText, "utf8"),
        storageKey,
        documentType: fixture.documentType,
        uploadStatus: "uploaded",
        processingStatus,
        processingError: null,
      },
    });

    await tx.documentPage.deleteMany({
      where: {
        workspaceId,
        documentId: document.id,
      },
    });

    await tx.reviewTask.deleteMany({
      where: {
        workspaceId,
        entityType: "document",
        entityId: document.id,
      },
    });

    await (
      tx as typeof tx & {
        extractedRecord: {
          deleteMany(args: Prisma.ExtractedRecordDeleteManyArgs): Promise<unknown>;
          create(args: Prisma.ExtractedRecordCreateArgs): Promise<{ id: string }>;
        };
      }
    ).extractedRecord.deleteMany({
      where: {
        workspaceId,
        documentId: document.id,
      },
    });

    await tx.documentPage.createMany({
      data: pages.map((page) => ({
        workspaceId,
        documentId: document.id,
        pageNumber: page.pageNumber,
        rawText: page.rawText,
        ocrUsed: page.ocrUsed,
        metadata: {
          source: page.ocrUsed ? "demo-ocr-fixture" : "demo-text-fixture",
          char_count: page.rawText.length,
          seededAt,
        },
      })),
    });

    await (
      tx as typeof tx & {
        extractedRecord: {
          create(args: Prisma.ExtractedRecordCreateArgs): Promise<{ id: string }>;
        };
      }
    ).extractedRecord.create({
      data: {
        workspaceId,
        documentId: document.id,
        schemaType: extraction.result.schemaType,
        extractionJson: toPrismaJson(extraction.result.extraction),
        confidenceScore: extraction.result.confidenceScore,
        requiresReview,
        modelUsed: extraction.modelUsed,
        promptVersion: extraction.promptVersion,
        tokenUsage:
          typeof extraction.tokenUsage === "number"
            ? Math.round(extraction.tokenUsage)
            : null,
        latencyMs: extraction.latencyMs,
        fields: {
          create: extraction.result.fields.map((field) => ({
            workspaceId,
            fieldName: field.fieldName,
            fieldValue: field.fieldValue,
            confidenceScore: field.confidenceScore,
            sourceSnippet: field.sourceSnippet,
          })),
        },
      },
    });

    if (requiresReview) {
      await tx.reviewTask.create({
        data: {
          workspaceId,
          entityType: "document",
          entityId: document.id,
          status: "pending",
        },
      });
    }

    await tx.auditLog.createMany({
      data: [
        {
          workspaceId,
          eventType: "document.upload.completed",
          entityType: "document",
          entityId: document.id,
          metadataJson: {
            seeded: true,
            source: "demo-documents-seed",
            fixtureId: fixture.id,
            fileName: fixture.fileName,
          },
        },
        {
          workspaceId,
          eventType: "document.extract_text.completed",
          entityType: "document",
          entityId: document.id,
          metadataJson: {
            seeded: true,
            fixtureId: fixture.id,
            totalPages: pages.length,
            ocrUsed: pages.some((page) => page.ocrUsed),
          },
        },
        {
          workspaceId,
          eventType: requiresReview
            ? "document.extract_structured.review_needed"
            : "document.extract_structured.completed",
          entityType: "document",
          entityId: document.id,
          metadataJson: {
            seeded: true,
            fixtureId: fixture.id,
            confidenceScore: extraction.result.confidenceScore,
            fieldCount: extraction.result.fields.length,
            requiresReview,
          },
        },
      ],
    });
  });

  return {
    id: fixture.id,
    processingStatus,
    requiresReview,
  };
}

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

  const results = [];

  for (const fixture of demoDocuments) {
    results.push(await seedDocument(workspace.id, fixture, seededAt));
  }

  const summary = results.reduce(
    (accumulator, item) => {
      accumulator.total += 1;
      if (item.requiresReview) {
        accumulator.reviewNeeded += 1;
      }
      if (item.processingStatus === "exported") {
        accumulator.exported += 1;
      }
      return accumulator;
    },
    { total: 0, reviewNeeded: 0, exported: 0 }
  );

  console.log(
    `Seeded ${summary.total} demo documents into workspace "${workspace.name}" (${workspace.id}). ` +
      `${summary.reviewNeeded} need review and ${summary.exported} are marked exported.`
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
