import { createCipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const destination = process.env.SGC_BACKUP_DIR;
const secret = process.env.SGC_BACKUP_KEY;
if (!destination) throw new Error("Defina SGC_BACKUP_DIR para um destino externo controlado.");
if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error("SGC_BACKUP_KEY deve conter 64 caracteres hexadecimais.");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const tar = process.platform === "win32" ? "tar.exe" : "tar";
const temporary = mkdtempSync(join(tmpdir(), "sgc-ubs-backup-"));
const payload = join(temporary, "payload");
mkdirSync(payload);

try {
  execFileSync(npx, ["supabase", "db", "dump", "--linked", "--file", join(payload, "database.sql")], { stdio: "inherit" });
  mkdirSync(join(payload, "storage"));
  execFileSync(npx, ["supabase", "storage", "cp", "-r", "ss://evidence", join(payload, "storage"), "--experimental"], { stdio: "inherit" });
  writeFileSync(join(payload, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), includes: ["database", "evidence-storage"], format: 1 }, null, 2));

  const archive = join(temporary, "backup.tar.gz");
  execFileSync(tar, ["-czf", archive, "-C", temporary, "payload"], { stdio: "inherit" });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(readFileSync(archive)), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([Buffer.from("SGCUBS01"), iv, tag, ciphertext]);

  const targetDir = resolve(destination);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const target = join(targetDir, `sgc-ubs-${stamp}.backup.enc`);
  writeFileSync(target, envelope);
  process.stdout.write(`${target}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
