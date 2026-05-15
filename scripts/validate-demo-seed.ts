import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateDemoSeed } from "./demo/demoSeedWorkflow";

async function main() {
  const result = await validateDemoSeed();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
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
