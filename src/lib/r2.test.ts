import { createDocumentPresignedUpload, validateDocumentFile } from "@/lib/r2";

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class PutObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteObjectCommand: class DeleteObjectCommand {},
  S3Client: class S3Client {},
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.example.com/upload"),
}));

describe("R2 document upload security", () => {
  const env = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  };

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = "acct_123";
    process.env.R2_ACCESS_KEY_ID = "key_123";
    process.env.R2_SECRET_ACCESS_KEY = "secret_123";
    process.env.R2_BUCKET_NAME = "documents";
  });

  afterAll(() => {
    process.env.R2_ACCOUNT_ID = env.R2_ACCOUNT_ID;
    process.env.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
    process.env.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
    process.env.R2_BUCKET_NAME = env.R2_BUCKET_NAME;
  });

  it("rejects disallowed mime types and oversized files", () => {
    expect(() =>
      validateDocumentFile({
        fileName: "payload.exe",
        mimeType: "application/octet-stream",
        fileSize: 1024,
      })
    ).toThrow("Allowed file types are PDF, PNG, JPG, and TIFF.");

    expect(() =>
      validateDocumentFile({
        fileName: "invoice.pdf",
        mimeType: "application/pdf",
        fileSize: 25 * 1024 * 1024,
      })
    ).toThrow("Files must be 20MB or smaller.");
  });

  it("returns presigned uploads with a short expiry", async () => {
    const upload = await createDocumentPresignedUpload({
      workspaceId: "ws_123",
      fileName: "April Invoice.PDF",
      mimeType: "application/pdf",
      fileSize: 1024,
    });

    expect(upload.uploadUrl).toBe("https://r2.example.com/upload");
    expect(upload.storageKey).toContain("workspaces/ws_123/documents/");
    expect(upload.storageKey).toContain(".pdf");
    expect(upload.expiresIn).toBe(600);
  });
});
