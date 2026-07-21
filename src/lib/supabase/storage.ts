import { createClient } from "./client";
import { STORAGE_BUCKETS } from "../constants";

/**
 * All uploads go through server-issued signed upload tokens
 * (POST /api/storage/upload-url) — the anon key has no read or write policies
 * on any bucket. The server authorizes the caller and picks the object path;
 * the browser then uploads the bytes directly to Storage with the one-time
 * token, so large files never pass through our API routes.
 */
async function uploadViaSignedUrl(
  bucket: string,
  file: File,
  shopId?: string
): Promise<{ path: string; error: Error | null }> {
  const res = await fetch("/api/storage/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, fileName: file.name, shopId }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) {
    return { path: "", error: new Error(json?.error || "Failed to authorize upload") };
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(json.data.path, json.data.token, file);

  if (error) return { path: "", error };
  return { path: json.data.path, error: null };
}

export async function uploadInvoice(
  shopId: string,
  file: File
): Promise<{ path: string; error: Error | null }> {
  return uploadViaSignedUrl(STORAGE_BUCKETS.INVOICES, file, shopId);
}

export async function getSignedInvoiceUrl(
  filePath: string
): Promise<{ url: string; error: Error | null }> {
  const res = await fetch(
    `/api/storage/invoice-url?path=${encodeURIComponent(filePath)}`
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.url) {
    return { url: "", error: new Error(json?.error || "Failed to create signed URL") };
  }
  return { url: json.data.url, error: null };
}

export async function uploadTrainingPdf(
  file: File
): Promise<{ path: string; error: Error | null }> {
  return uploadViaSignedUrl(STORAGE_BUCKETS.TRAINING_PDFS, file);
}

export function getTrainingPdfUrl(filePath: string): string {
  const supabase = createClient();
  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.TRAINING_PDFS)
    .getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadCollateral(
  file: File
): Promise<{ path: string; error: Error | null }> {
  return uploadViaSignedUrl(STORAGE_BUCKETS.COLLATERAL_PDFS, file);
}

export function getCollateralUrl(filePath: string): string {
  const supabase = createClient();
  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.COLLATERAL_PDFS)
    .getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadScormPackage(
  file: File
): Promise<{ path: string; error: Error | null }> {
  return uploadViaSignedUrl(STORAGE_BUCKETS.SCORM_PACKAGES, file);
}
