import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { seedDemoData } from "./demo-workflow";

async function main() {
  const manifest = await seedDemoData();
  console.log(
    JSON.stringify(
      {
        ok: true,
        fleetId: manifest.fleet.id,
        fleetName: manifest.fleet.name,
        ownerId: manifest.users.ownerId,
        managerId: manifest.users.managerId,
        driverId: manifest.users.driverId,
        output: "exports/demo-assets/demo-manifest.json",
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
