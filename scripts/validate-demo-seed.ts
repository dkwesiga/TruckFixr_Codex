import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateDemoSeed } from "./demo/demoSeedWorkflow";
import { resetDb } from "../server/db";

function isLikelyTransientDbDisconnect(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.message}\n${(error as any).cause?.message ?? ""}`
      : String(error);
  return message.toLowerCase().includes("connection terminated unexpectedly");
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await validateDemoSeed();
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
      return;
    } catch (error) {
      if (!isLikelyTransientDbDisconnect(error) || attempt === maxAttempts) {
        throw error;
      }

      console.warn(`[validate-demo-seed] transient DB disconnect; retrying (${attempt}/${maxAttempts})...`);
      await resetDb();
      await sleep(500 * attempt);
    }
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
