import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { extractInvoiceData } from "@/lib/ai/extract-invoice";
import { invoiceExtractionResponseSchema } from "@/lib/validators/invoice-extraction";
import { STORAGE_BUCKETS } from "@/lib/constants";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Create or reset extraction record to "processing"
  const extraction = await prisma.invoiceExtraction.upsert({
    where: { invoice_id: id },
    create: {
      invoice_id: id,
      status: "processing",
    },
    update: {
      status: "processing",
      error_message: null,
      vendor_name: null,
      invoice_number: null,
      invoice_date: null,
      subtotal: null,
      tax_amount: null,
      total_amount: null,
      currency: null,
      raw_response: undefined,
      updated_at: new Date(),
    },
  });

  // Delete existing line items on retry
  await prisma.invoiceLineItem.deleteMany({
    where: { extraction_id: extraction.id },
  });

  try {
    // Download file from Supabase storage
    const supabase = createAdminClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKETS.INVOICES)
      .download(invoice.file_path);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download invoice file: ${downloadError?.message}`
      );
    }

    // Determine MIME type from file extension
    const ext = invoice.file_path.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    const mimeType = mimeMap[ext || ""] || "application/octet-stream";

    // Convert Blob to Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Call AI extraction
    const rawResult = await extractInvoiceData(buffer, mimeType);

    // Validate with Zod
    const result = invoiceExtractionResponseSchema.parse(rawResult);

    // Persist extraction data and line items in a transaction
    await prisma.$transaction([
      prisma.invoiceExtraction.update({
        where: { id: extraction.id },
        data: {
          status: "completed",
          vendor_name: result.vendor_name,
          invoice_number: result.invoice_number,
          invoice_date: result.invoice_date
            ? new Date(result.invoice_date)
            : null,
          subtotal: result.subtotal,
          tax_amount: result.tax_amount,
          total_amount: result.total_amount,
          currency: result.currency || "USD",
          raw_response: rawResult as object,
          updated_at: new Date(),
        },
      }),
      ...result.line_items.map((item, index) =>
        prisma.invoiceLineItem.create({
          data: {
            extraction_id: extraction.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.amount,
            sort_order: index,
          },
        })
      ),
    ]);

    // Return the complete extraction with line items
    const complete = await prisma.invoiceExtraction.findUnique({
      where: { id: extraction.id },
      include: { line_items: { orderBy: { sort_order: "asc" } } },
    });

    return NextResponse.json({ data: complete });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown extraction error";
    await prisma.invoiceExtraction.update({
      where: { id: extraction.id },
      data: {
        status: "failed",
        error_message: message,
        updated_at: new Date(),
      },
    });

    return NextResponse.json(
      {
        data: {
          id: extraction.id,
          status: "failed",
          error_message: message,
        },
      },
      { status: 200 }
    );
  }
}
