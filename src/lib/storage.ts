import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireEnv } from "@/lib/env";

let s3: S3Client | null = null;

function client(): S3Client {
  if (s3) return s3;
  s3 = new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return s3;
}

/** Uploads bytes to R2 and returns a public URL (R2_PUBLIC_URL/key). */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${requireEnv("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}
