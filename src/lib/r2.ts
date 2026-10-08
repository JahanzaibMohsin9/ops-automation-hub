import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DOCUMENT_MAX_SIZE_BYTES,
  allowedDocumentExtensions,
  isAllowedDocumentMimeType,
} from "@/features/documents/config";

const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 60 * 10;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required for Cloudflare R2 uploads.`);
  }

  return value;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function validateDocumentFile(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim().toLowerCase();

  if (!fileName) {
    throw new Error("A file name is required.");
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    throw new Error("File size must be greater than zero.");
  }

  if (input.fileSize > DOCUMENT_MAX_SIZE_BYTES) {
    throw new Error("Files must be 20MB or smaller.");
  }

  if (!isAllowedDocumentMimeType(mimeType)) {
    throw new Error("Allowed file types are PDF, PNG, JPG, and TIFF.");
  }

  const normalizedFileName = fileName.toLowerCase();
  if (!allowedDocumentExtensions.some((extension) => normalizedFileName.endsWith(extension))) {
    throw new Error("The selected file extension is not allowed.");
  }

  return {
    fileName,
    mimeType,
    fileSize: Math.round(input.fileSize),
  };
}

function getR2Client() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function buildDocumentStorageKey(workspaceId: string, fileName: string) {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFileName(fileName) || "document";
  return ["workspaces", workspaceId, "documents", datePrefix, `${crypto.randomUUID()}-${safeName}`].join("/");
}

export async function createDocumentPresignedUpload(input: {
  workspaceId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  const validated = validateDocumentFile(input);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2Client();
  const storageKey = buildDocumentStorageKey(input.workspaceId, validated.fileName);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: validated.mimeType,
    ContentLength: validated.fileSize,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  });

  return {
    uploadUrl,
    storageKey,
    expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  };
}

export async function uploadDocumentToR2(input: {
  workspaceId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  body: ArrayBuffer;
  storageKey?: string;
}) {
  const validated = validateDocumentFile(input);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2Client();
  const storageKey =
    input.storageKey?.trim() || buildDocumentStorageKey(input.workspaceId, validated.fileName);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: Buffer.from(input.body),
      ContentType: validated.mimeType,
      ContentLength: validated.fileSize,
    })
  );

  return { storageKey };
}

export async function deleteDocumentFromR2(storageKey: string) {
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
  );
}
