import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const seedPath = path.resolve(__dirname, "../supabase/seed.sql");
  const sql = fs.readFileSync(seedPath, "utf-8");

  await pool.query(sql);
  console.log("Seed data inserted successfully.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
