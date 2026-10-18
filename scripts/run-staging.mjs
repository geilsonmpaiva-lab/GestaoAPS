import { spawnSync } from "node:child_process";
import { loadStagingConfig } from "./staging-config.mjs";
const { env } = loadStagingConfig();
const [command, ...args] = process.argv.slice(2);
if (!["build", "start"].includes(command)) throw new Error("Use build ou start.");
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", command, ...args], { env: { ...process.env, ...env }, stdio: "inherit" });
process.exit(result.status ?? 1);
