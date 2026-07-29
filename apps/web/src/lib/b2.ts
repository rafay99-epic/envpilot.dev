import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_URL_TTL_SECONDS = 300;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function client(): S3Client {
  return new S3Client({
    region: requiredEnv("B2_REGION"),
    endpoint: requiredEnv("B2_ENDPOINT_URL"),
    credentials: {
      accessKeyId: requiredEnv("B2_KEY_ID"),
      secretAccessKey: requiredEnv("B2_APPLICATION_KEY"),
    },
  });
}

function bucket(): string {
  return requiredEnv("B2_BUCKET");
}

function ttl(): number {
  const configured = Number(process.env.B2_SIGNED_URL_TTL_SECONDS);
  if (!Number.isFinite(configured) || configured < 60 || configured > 900) {
    return DEFAULT_URL_TTL_SECONDS;
  }
  return Math.floor(configured);
}

export async function createB2UploadUrl(args: {
  objectKey: string;
  contentType: string;
}): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: args.objectKey,
      ContentType: args.contentType,
    }),
    { expiresIn: ttl() }
  );
}

export async function createB2DownloadUrl(objectKey: string): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: objectKey }),
    { expiresIn: ttl() }
  );
}

export async function headB2Object(objectKey: string): Promise<{
  contentLength: number;
}> {
  const result = await client().send(
    new HeadObjectCommand({ Bucket: bucket(), Key: objectKey })
  );
  if (result.ContentLength === undefined) {
    throw new Error("B2 object has no content length");
  }
  return { contentLength: result.ContentLength };
}

export async function deleteB2Object(objectKey: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: objectKey })
  );
}
