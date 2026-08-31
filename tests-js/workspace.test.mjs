import test from "node:test";
import assert from "node:assert/strict";

import { parseCookies, sameOriginRequest } from "../server/supabase.js";
import { decodeUpload, validateChange, validateSource } from "../server/workspace.js";

const userId = "11111111-1111-4111-8111-111111111111";
const rowId = "22222222-2222-4222-8222-222222222222";

test("cookie parsing preserves encoded session tokens", () => {
  assert.deepEqual(parseCookies("mcr_access=abc%2E123; theme=dark"), { mcr_access: "abc.123", theme: "dark" });
});

test("state-changing browser requests are same-origin", () => {
  assert.equal(sameOriginRequest({ headers: { origin: "https://app.test", host: "app.test", "x-forwarded-proto": "https" } }), true);
  assert.equal(sameOriginRequest({ headers: { origin: "https://evil.test", host: "app.test", "x-forwarded-proto": "https" } }), false);
});

test("source validation binds data to the authenticated user", () => {
  const source = validateSource({
    id: rowId, product: "Chase", plan: "Freedom Flex", title: "Offer page",
    sourceType: "webpage", mode: "Webpage", url: "https://example.com/offer",
    text: "0% intro APR for 15 months.",
  }, userId);
  assert.equal(source.user_id, userId);
  assert.equal(source.company, "Chase");
  assert.equal(source.url, "https://example.com/offer");
});

test("source validation rejects non-web URLs", () => {
  const source = validateSource({
    id: rowId, product: "Example", plan: "Starter", title: "Claim",
    sourceType: "paste", mode: "Pasted copy", url: "javascript:alert(1)",
    text: "A sufficiently long marketing claim.",
  }, userId);
  assert.equal(source.url, null);
});

test("change validation keeps only supported deterministic kinds", () => {
  const row = validateChange({
    id: rowId,
    change: { company: "FitLife", product: "Starter", kind: "unknown", oldValue: "$79", newValue: "$99", status: "approved" },
    result: { candidateCount: 2 }, corpusSize: 9,
  }, userId);
  assert.equal(row.kind, "promotion");
  assert.equal(row.user_id, userId);
  assert.equal(row.result.candidateCount, 2);
});

test("uploads enforce supported types and the 2 MB boundary", () => {
  const upload = decodeUpload({ fileName: "offer.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF small file").toString("base64") });
  assert.equal(upload.fileName, "offer.pdf");
  assert.throws(() => decodeUpload({ fileName: "offer.exe", base64: "YQ==" }), /Use a TXT/);
  assert.throws(() => decodeUpload({ fileName: "offer.docx", base64: Buffer.from("PK fake").toString("base64") }), /not a readable DOCX/);
  assert.throws(() => decodeUpload({ fileName: "offer.txt", base64: Buffer.alloc(2_000_001).toString("base64") }), /no larger than 2 MB/);
});
