/**
 * Applies supabase/migrations/00013_lock_down_storage.sql to the database in
 * DIRECT_URL, then prints the resulting bucket/policy state.
 *
 * ⚠ Run only AFTER deploying the app version that uploads via
 * /api/storage/upload-url — the older client uploads directly with the anon
 * key and breaks once the policies are dropped.
 *
 * Usage: npx tsx scripts/apply-storage-lockdown.mts
 */
import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });
import { readFileSync } from "node:fs";
import pg from "pg";

const sql = readFileSync("supabase/migrations/00013_lock_down_storage.sql", "utf8");
const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
await client.connect();
await client.query(sql);

const buckets = await client.query("select id, public from storage.buckets order by id");
const policies = await client.query(
  "select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'"
);
console.log("Buckets:", buckets.rows);
console.log("Remaining storage.objects policies:", policies.rows);
await client.end();
