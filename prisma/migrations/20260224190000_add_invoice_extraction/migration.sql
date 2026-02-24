-- CreateEnum
CREATE TYPE "extraction_status" AS ENUM ('processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "invoice_extractions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "status" "extraction_status" NOT NULL DEFAULT 'processing',
    "vendor_name" TEXT,
    "invoice_number" TEXT,
    "invoice_date" DATE,
    "subtotal" DECIMAL(10,2),
    "tax_amount" DECIMAL(10,2),
    "total_amount" DECIMAL(10,2),
    "currency" TEXT DEFAULT 'USD',
    "raw_response" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extraction_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit_price" DECIMAL(10,2),
    "amount" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_extractions_invoice_id_key" ON "invoice_extractions"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_extraction_id_idx" ON "invoice_line_items"("extraction_id");

-- AddForeignKey
ALTER TABLE "invoice_extractions" ADD CONSTRAINT "invoice_extractions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "invoice_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
