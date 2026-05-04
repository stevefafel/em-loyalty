-- CreateTable
CREATE TABLE "oil_change_counts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oil_change_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oil_change_counts_shop_id_date_key" ON "oil_change_counts"("shop_id", "date");

-- CreateIndex
CREATE INDEX "oil_change_counts_shop_id_date_idx" ON "oil_change_counts"("shop_id", "date");

-- AddForeignKey
ALTER TABLE "oil_change_counts" ADD CONSTRAINT "oil_change_counts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
