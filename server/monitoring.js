import { createHash } from "node:crypto";

export function normalizeSnapshotText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function snapshotHash(value) {
  return createHash("sha256").update(normalizeSnapshotText(value)).digest("hex");
}

export function compareSnapshot(previousText, nextText, previousHash = "") {
  const currentHash = snapshotHash(nextText);
  const baselineHash = previousHash || snapshotHash(previousText);
  return {
    changed: Boolean(baselineHash && baselineHash !== currentHash),
    previousHash: baselineHash,
    currentHash,
  };
}

export function cronRequestAuthorized(authorization, secret = process.env.CRON_SECRET) {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
