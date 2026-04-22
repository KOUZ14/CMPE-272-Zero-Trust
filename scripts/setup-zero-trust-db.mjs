import "dotenv/config";
import fs from "node:fs/promises";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env or export it before running.");
  process.exit(1);
}

const sql = await fs.readFile(new URL("../sql/zero-trust-demo.sql", import.meta.url), "utf8");
const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  multipleStatements: true,
});

try {
  await connection.query(sql);
  console.log("Zero Trust demo schema and seed data applied.");
} finally {
  await connection.end();
}
