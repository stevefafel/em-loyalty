-- AlterTable
-- AutoOps IDs are free-form strings (e.g. "cl_..."), not UUIDs.
ALTER TABLE "shops" ALTER COLUMN "autoops_shop_id" SET DATA TYPE TEXT USING "autoops_shop_id"::text;
