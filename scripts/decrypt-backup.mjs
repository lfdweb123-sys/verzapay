#!/usr/bin/env node
// Déchiffre une sauvegarde Verzapay (.vpzb) en fichier NDJSON lisible (une ligne = un document).
// Usage : BACKUP_ENCRYPTION_KEY=<64 car. hex> node scripts/decrypt-backup.mjs backup.vpzb sortie.ndjson
import fs from "fs";
import crypto from "crypto";
import zlib from "zlib";

const [, , input, output] = process.argv;
const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
if (!input || !output || !keyHex) {
  console.error("Usage : BACKUP_ENCRYPTION_KEY=... node scripts/decrypt-backup.mjs <fichier.vpzb> <sortie.ndjson>");
  process.exit(1);
}
const blob = fs.readFileSync(input);
if (blob.subarray(0, 5).toString() !== "VPZB1") { console.error("Format inconnu"); process.exit(1); }
const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), blob.subarray(5, 17));
decipher.setAuthTag(blob.subarray(17, 33));
const plain = zlib.gunzipSync(Buffer.concat([decipher.update(blob.subarray(33)), decipher.final()]));
fs.writeFileSync(output, plain);
console.log(`OK : ${plain.toString("utf8").split("\n").length} documents écrits dans ${output}`);
