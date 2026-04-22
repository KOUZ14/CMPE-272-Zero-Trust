import "dotenv/config";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env or export it before running.");
  process.exit(1);
}

const requiredTables = ["Resources", "AccessPolicies", "AccessEvents", "Incidents"];
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL });

try {
  for (const table of requiredTables) {
    const [rows] = await connection.query("SHOW TABLES LIKE ?", [table]);
    console.log(`${table}: ${rows.length > 0 ? "present" : "missing"}`);
  }
} finally {
  await connection.end();
}
