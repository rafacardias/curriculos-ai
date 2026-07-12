import { getDb, DB_PATH } from "../db/client.js";

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r: any) => r.name);

console.log(`db: ${DB_PATH}`);
console.log(`tabelas (${tables.length}): ${tables.join(", ")}`);
