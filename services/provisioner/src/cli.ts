/**
 * Operator commands (P1.4.10):
 *   tsx services/provisioner/src/cli.ts list
 *   tsx services/provisioner/src/cli.ts retry <id|slug>     re-queue a failed sign-up
 */
import { platformConfig } from "./config.js";
import { SignupStore } from "./signups.js";

const store = new SignupStore(platformConfig().signupsDir);
const [cmd, ref] = process.argv.slice(2);
if (cmd === "list") {
  for (const s of store.list())
    console.log(`${s.id}  ${s.slug.padEnd(14)} ${s.status.padEnd(12)} ${s.email}  ${s.error ?? s.url ?? ""}`);
} else if (cmd === "retry" && ref) {
  const s = store.list().find((x) => x.id === ref || x.slug === ref);
  if (!s || s.status !== "failed") throw new Error("no failed sign-up with that id or slug");
  if (!s.passwordSealed) throw new Error("password no longer stored; ask the customer to sign up again");
  store.update(s.id, { status: "queued" });
  console.log(`re-queued ${s.slug}`);
} else {
  console.error("usage: cli.ts list | retry <id|slug>");
  process.exit(2);
}
