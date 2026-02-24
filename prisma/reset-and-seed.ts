import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Clear existing data in reverse dependency order
  await pool.query(`
    DELETE FROM collateral_log;
    DELETE FROM loyalty_ledger;
    DELETE FROM training_log;
    DELETE FROM invoices;
    DELETE FROM user_shops;
    DELETE FROM collateral;
    DELETE FROM training_modules;
    DELETE FROM users;
    DELETE FROM shops;
  `);
  console.log("Existing data cleared.");

  // Insert fresh seed data
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
