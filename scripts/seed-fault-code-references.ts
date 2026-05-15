import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  flattenStarterFaultCodeReferenceSeed,
  seedStarterFaultCodeReferences,
} from "../server/services/faultCodeReferenceSeed";

async function main() {
  const result = await seedStarterFaultCodeReferences();
  const categories = Array.from(
    new Set(flattenStarterFaultCodeReferenceSeed().map((entry) => entry.category))
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
        categories,
        reviewPath: "/admin/fault-codes",
        nextStep:
          "Sign in as an owner or manager, open /admin/fault-codes, review seeded records, and approve only the records you validate.",
      },
      null,
      2
    )
  );
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
