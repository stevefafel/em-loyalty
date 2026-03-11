import { createClient } from "./client";
import { generateStoragePath } from "../utils";
import { STORAGE_BUCKETS } from "../constants";

export async function uploadInvoice(
  shopId: string,
  file: File
): Promise<{ path: string; error: Error | null }> {
  const supabase = createClient();
  const storagePath = generateStoragePath(shopId, file.name);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.INVOICES)
    .upload(storagePath, file);

  if (error) return { path: "", error };
  return { path: storagePath, error: null };
}

export function getInvoiceUrl(filePath: string): string {
  const supabase = createClient();
  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.INVOICES)
    .getPublicUrl(filePath);
  return data.publicUrl;
}

export async function getSignedInvoiceUrl(
  filePath: string,
  expiresIn = 300
): Promise<{ url: string; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.INVOICES)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) return { url: "", error: error || new Error("Failed to create signed URL") };
  return { url: data.signedUrl, error: null };
}

export async function uploadTrainingPdf(
  file: File
): Promise<{ path: string; error: Error | null }> {
  const supabase = createClient();
  const timestamp = Date.now();
  const storagePath = `modules/${timestamp}_${file.name}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.TRAINING_PDFS)
    .upload(storagePath, file);

  if (error) return { path: "", error };
  return { path: storagePath, error: null };
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
  const supabase = createClient();
  const timestamp = Date.now();
  const storagePath = `admin/${timestamp}_${file.name}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.COLLATERAL_PDFS)
    .upload(storagePath, file);

  if (error) return { path: "", error };
  return { path: storagePath, error: null };
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
  const supabase = createClient();
  const timestamp = Date.now();
  const storagePath = `packages/${timestamp}_${file.name}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.SCORM_PACKAGES)
    .upload(storagePath, file);

  if (error) return { path: "", error };
  return { path: storagePath, error: null };
}

export async function getScormPackageUrl(
  filePath: string,
  expiresIn = 3600
): Promise<{ url: string; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.SCORM_PACKAGES)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) return { url: "", error: error || new Error("Failed to create signed URL") };
  return { url: data.signedUrl, error: null };
}
