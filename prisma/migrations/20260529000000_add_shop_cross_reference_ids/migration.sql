-- AlterTable
ALTER TABLE "shops" ADD COLUMN "steer_shop_id" UUID,
ADD COLUMN "autoops_shop_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "shops_steer_shop_id_key" ON "shops"("steer_shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_autoops_shop_id_key" ON "shops"("autoops_shop_id");
