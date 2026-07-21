-- CreateTable
CREATE TABLE "pegasus_awards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pegasus_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pegasus_awards_shop_id_month_key" ON "pegasus_awards"("shop_id", "month");

-- AddForeignKey
ALTER TABLE "pegasus_awards" ADD CONSTRAINT "pegasus_awards_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
