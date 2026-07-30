import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_URL_TTL_SECONDS = 300;

export class B2ConfigurationError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "B2ConfigurationError";
    this.cause = cause;
  }
}

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
    // B2 validates SigV4 but does not need the AWS SDK's optional automatic
    // CRC32 query parameters on presigned PUT requests.
    requestChecksumCalculation: "WHEN_REQUIRED",
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

let accessCheck: Promise<void> | undefined;

function configurationMessage(error: unknown): string {
  const details = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (details.name === "InvalidAccessKeyId") {
    return "Backblaze B2 rejected B2_KEY_ID. Copy the application key ID (not the bucket ID) from a standard B2 application key.";
  }
  if (details.name === "SignatureDoesNotMatch") {
    return "Backblaze B2 rejected the configured key pair. Verify B2_KEY_ID and B2_APPLICATION_KEY were copied from the same application key.";
  }
  if (details.$metadata?.httpStatusCode === 403) {
    return "Backblaze B2 denied access. Verify the application key is active and has listFiles access to the configured bucket.";
  }
  if (details.$metadata?.httpStatusCode === 404) {
    return "The configured Backblaze B2 bucket was not found in this region.";
  }
  return "Backblaze B2 storage is unavailable. Verify the bucket, region, endpoint, and application key.";
}

/**
 * Validate the runtime credential once per warm server process before creating
 * Vault state. Failed checks are not cached so a corrected development
 * configuration can be retried without another code change.
 */
export async function verifyB2Access(): Promise<void> {
  if (!accessCheck) {
    accessCheck = (async () => {
      try {
        await client().send(
          new ListObjectVersionsCommand({
            Bucket: bucket(),
            Prefix: "artifact-uploads/",
            MaxKeys: 1,
          })
        );
      } catch (error) {
        throw new B2ConfigurationError(configurationMessage(error), error);
      }
    })();
  }

  const pending = accessCheck;
  try {
    await pending;
  } catch (error) {
    if (accessCheck === pending) accessCheck = undefined;
    throw error;
  }
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

/** Promote a verified temporary upload into the durable artifact namespace. */
export async function promoteB2Upload(objectKey: string): Promise<string> {
  const temporaryPrefix = "artifact-uploads/";
  if (!objectKey.startsWith(temporaryPrefix)) {
    throw new Error("B2 upload object is not in the temporary namespace");
  }

  const destinationKey = `artifacts/${objectKey.slice(temporaryPrefix.length)}`;
  const bucketName = bucket();
  const copySource = `${encodeURIComponent(bucketName)}/${objectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  await client().send(
    new CopyObjectCommand({
      Bucket: bucketName,
      Key: destinationKey,
      CopySource: copySource,
    })
  );
  return destinationKey;
}

/** Permanently remove every B2 version and delete marker for one exact key. */
export async function purgeB2Object(objectKey: string): Promise<void> {
  const s3 = client();
  const bucketName = bucket();
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let pages = 0;

  do {
    pages += 1;
    if (pages > 100) {
      throw new Error("B2 object version listing exceeded the safety limit");
    }

    const listed = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucketName,
        Prefix: objectKey,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
        MaxKeys: 1_000,
      })
    );
    const objects = [
      ...(listed.Versions ?? []),
      ...(listed.DeleteMarkers ?? []),
    ]
      .filter(
        (item): item is typeof item & { Key: string; VersionId: string } =>
          item.Key === objectKey &&
          typeof item.VersionId === "string" &&
          item.VersionId.length > 0
      )
      .map((item) => ({ Key: item.Key, VersionId: item.VersionId }));

    for (let offset = 0; offset < objects.length; offset += 1_000) {
      const batch = objects.slice(offset, offset + 1_000);
      const deleted = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: batch, Quiet: true },
        })
      );
      if (deleted.Errors?.length) {
        throw new Error(
          `B2 failed to purge ${deleted.Errors.length} object version(s)`
        );
      }
    }

    if (!listed.IsTruncated) break;
    keyMarker = listed.NextKeyMarker;
    versionIdMarker = listed.NextVersionIdMarker;
    if (!keyMarker) {
      throw new Error("B2 returned an invalid object-version cursor");
    }
  } while (true);
}
