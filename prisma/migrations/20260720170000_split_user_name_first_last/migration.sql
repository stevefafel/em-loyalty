-- Split users.name into first_name / last_name, backfilling from the existing value.
ALTER TABLE "users" ADD COLUMN "first_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN "last_name" TEXT NOT NULL DEFAULT '';

UPDATE "users" SET
  "first_name" = split_part(btrim("name"), ' ', 1),
  "last_name"  = btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 2));

ALTER TABLE "users" ALTER COLUMN "first_name" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "last_name" DROP DEFAULT;

ALTER TABLE "users" DROP COLUMN "name";
