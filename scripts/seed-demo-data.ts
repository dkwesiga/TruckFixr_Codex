import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { seedDemoData } from "./demo/demoSeedWorkflow";

async function main() {
  const summary = await seedDemoData();
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
