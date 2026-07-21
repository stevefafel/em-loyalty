-- AlterTable
ALTER TABLE "users" ADD COLUMN     "keycloak_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "users_keycloak_id_key" ON "users"("keycloak_id");

