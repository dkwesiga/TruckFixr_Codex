#!/usr/bin/env tsx
/**
 * UTM link generator for TruckFixr marketing outreach.
 *
 * Usage:
 *   pnpm utm --channel <channel> --campaign <name> [--content <c>] [--path </p>]
 *   pnpm utm --help
 *   pnpm utm --list
 *
 * Examples:
 *   pnpm utm --channel linkedin_post --campaign post_downtime
 *   pnpm utm --channel linkedin_dm  --campaign dm_fleet_manager --path /fleet-review
 *   pnpm utm --channel email        --campaign outreach_q3 --content variant_a
 *
 * Values are normalized to lowercase snake_case. The tool refuses to embed
 * personal information (emails, phone numbers) in tracking parameters.
 */
import { buildUtmUrl, CHANNELS } from "../../shared/marketing/utm";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function printChannels(): void {
  console.log("\nAvailable channels:\n");
  for (const c of Object.values(CHANNELS)) {
    console.log(`  ${c.key.padEnd(16)} ${c.description}`);
    console.log(`  ${" ".repeat(16)} source=${c.source} medium=${c.medium}`);
    console.log(
      `  ${" ".repeat(16)} e.g. --campaign ${c.examples.join(" | ")}\n`
    );
  }
}

function printHelp(): void {
  console.log(`
TruckFixr UTM link generator

  pnpm utm --channel <channel> --campaign <name> [--content <content>] [--path </path>]

Options:
  --channel   One of the predefined channels (see --list)
  --campaign  Campaign label, e.g. post_downtime (normalized to snake_case)
  --content   Optional non-identifying variant label, e.g. variant_a
  --path      Optional destination path on truckfixr.com (default "/")
  --list      Show available channels and example labels
  --help      Show this help

Naming: use short, descriptive, non-identifying labels. Never use a recipient's
name, email, company, or phone number in a campaign or content value.

Git Bash (Windows) note: it rewrites a leading-slash argument into a Windows
path, so pass --path without the leading slash (--path fleet-review) or prefix
the command with MSYS_NO_PATHCONV=1. PowerShell and Linux are unaffected.
`);
  printChannels();
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || Object.keys(args).length === 0) {
    printHelp();
    process.exit(0);
  }
  if (args.list) {
    printChannels();
    process.exit(0);
  }

  const result = buildUtmUrl({
    channel: String(args.channel ?? ""),
    campaign: String(args.campaign ?? ""),
    content: args.content ? String(args.content) : undefined,
    path: args.path ? String(args.path) : undefined,
  });

  for (const w of result.warnings) console.warn(`⚠ ${w}`);

  if (!result.ok) {
    for (const e of result.errors) console.error(`✖ ${e}`);
    console.error('\nRun "pnpm utm --help" for usage and valid channels.');
    process.exit(1);
  }

  console.log(`\n✔ ${result.url}\n`);
  process.exit(0);
}

main();
