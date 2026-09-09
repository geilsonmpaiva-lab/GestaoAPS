import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = process.argv[2];
const secret = process.env.SGC_BACKUP_KEY;
if (!file) throw new Error("Uso: npm run backup:verify -- <arquivo.backup.enc>");
if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error("SGC_BACKUP_KEY deve conter 64 caracteres hexadecimais.");

const envelope = readFileSync(resolve(file));
if (envelope.subarray(0, 8).toString() !== "SGCUBS01") throw new Error("Cabeçalho do backup inválido.");
const iv = envelope.subarray(8, 20);
const tag = envelope.subarray(20, 36);
const ciphertext = envelope.subarray(36);
const decipher = createDecipheriv("aes-256-gcm", Buffer.from(secret, "hex"), iv);
decipher.setAuthTag(tag);
const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
if (plain.subarray(0, 2).toString("hex") !== "1f8b") throw new Error("Conteúdo descriptografado não é um arquivo gzip válido.");
process.stdout.write(`Backup íntegro: ${file} (${plain.byteLength} bytes descriptografados)\n`);
