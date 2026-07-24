-- AlterTable: free-form printer answer captured during self-registration.
ALTER TABLE "shops" ADD COLUMN     "printer" TEXT;

-- AlterTable: self-registered users await admin approval (gate 1) before the
-- Keycloak invite is sent. Existing and admin-created users are not pending.
ALTER TABLE "users" ADD COLUMN     "registration_pending" BOOLEAN NOT NULL DEFAULT false;
