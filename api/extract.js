import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const FETCH_DEADLINE_MS = 8_000;
const ALLOWED_CONTENT_TYPES = new Set(["text/html", "text/plain", "application/xhtml+xml"]);
const rateBuckets = new Map();

const blockedIpv4 = new net.BlockList();
const blockedIpv6 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blockedIpv4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:2::", 48], ["2001:db8::", 32], ["2002::", 16],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) blockedIpv6.addSubnet(network, prefix, "ipv6");

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const numeric = code[1].toLowerCase() === "x"
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) return entity;
    return String.fromCodePoint(numeric);
  });
}

function normalizedLines(value, limit) {
  return decodeEntities(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, limit);
}

function findTagEnd(markup, start) {
  let quote = "";
  for (let index = start; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function tagNameFrom(rawTag) {
  let index = rawTag[0] === "/" ? 1 : 0;
  while (/\s/.test(rawTag[index] || "")) index += 1;
  const start = index;
  while (/[a-z0-9:-]/i.test(rawTag[index] || "")) index += 1;
  return rawTag.slice(start, index).toLowerCase();
}

function tagIsHidden(rawTag) {
  return /\shidden(?:\s|=|\/|$)/i.test(rawTag)
    || /\saria-hidden\s*=\s*["']?true(?:["'\s/]|$)/i.test(rawTag)
    || /\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(rawTag);
}

export function extractReadableText(input) {
  const markup = String(input).slice(0, MAX_RESPONSE_BYTES);
  const excludedTags = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "embed"]);
  const blockTags = new Set(["p", "div", "section", "article", "main", "header", "footer", "nav", "aside", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "td", "th"]);
  let output = "";
  let title = "";
  let index = 0;
  let excludedTag = "";
  let excludedDepth = 0;
  let inTitle = false;

  while (index < markup.length) {
    if (markup[index] !== "<") {
      const nextTag = markup.indexOf("<", index);
      const end = nextTag === -1 ? markup.length : nextTag;
      const segment = markup.slice(index, end);
      if (!excludedTag) {
        if (inTitle) title += segment;
        else output += segment;
      }
      index = end;
      continue;
    }
    if (markup.startsWith("<!--", index)) {
      const commentEnd = markup.indexOf("-->", index + 4);
      index = commentEnd === -1 ? markup.length : commentEnd + 3;
      continue;
    }
    const tagEnd = findTagEnd(markup, index + 1);
    if (tagEnd === -1) break;
    const rawTag = markup.slice(index + 1, tagEnd).trim();
    const closing = rawTag.startsWith("/");
    const selfClosing = rawTag.endsWith("/");
    const tagName = tagNameFrom(rawTag);

    if (excludedTag) {
      if (tagName === excludedTag && !selfClosing) {
        if (!closing) excludedDepth += 1;
        else if (excludedDepth > 0) excludedDepth -= 1;
        else excludedTag = "";
      }
      index = tagEnd + 1;
      continue;
    }
    if (!closing && !selfClosing && (excludedTags.has(tagName) || tagIsHidden(rawTag))) {
      excludedTag = tagName;
      excludedDepth = 0;
      index = tagEnd + 1;
      continue;
    }
    if (tagName === "title") inTitle = !closing;
    else if (blockTags.has(tagName) && !inTitle) output += "\n";
    else if (tagName && !inTitle) output += " ";
    index = tagEnd + 1;
  }
  return { title: normalizedLines(title, 500), text: normalizedLines(output, 50_000) };
}

export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blockedIpv4.check(address, "ipv4");
  if (family === 6) return blockedIpv6.check(address, "ipv6");
  return true;
}

function withDeadline(promise, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("The page took too long to respond."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The page took too long to respond.")), remaining);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function validatePublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an http or https URL.");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed.");
  if (url.href.length > 2_048) throw new Error("The URL is too long.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard web ports are allowed.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Private network addresses are not allowed.");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The URL must resolve only to a public internet address.");
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}

function requestPinnedPage(target, deadline) {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { reject(new Error("The page took too long to respond.")); return; }
    const transport = target.url.protocol === "https:" ? https : http;
    let settled = false;
    let responseStarted = false;
    let request;
    const timer = setTimeout(() => request?.destroy(new Error("The page took too long to respond.")), remaining);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };

    request = transport.request(target.url, {
      method: "GET",
      servername: target.url.hostname,
      headers: {
        "user-agent": "MarketingChangeReadiness/0.2 (+evidence preview)",
        accept: "text/html,text/plain,application/xhtml+xml",
        "accept-encoding": "identity",
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, (incoming) => {
      responseStarted = true;
      const status = incoming.statusCode || 500;
      const headers = incoming.headers;
      if ((status >= 300 && status < 400) || status < 200 || status >= 300) {
        finish(null, { status, headers, bytes: Buffer.alloc(0), mediaType: "" });
        incoming.destroy();
        return;
      }

      const mediaType = String(headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(mediaType)) {
        finish(new Error("That URL does not return a readable HTML or text page."));
        incoming.destroy();
        return;
      }
      const contentEncoding = String(headers["content-encoding"] || "identity").trim().toLowerCase();
      if (contentEncoding !== "identity") {
        finish(new Error("The page returned an unsupported compressed response."));
        incoming.destroy();
        return;
      }
      const declaredLength = Number(headers["content-length"] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        finish(new Error("The page is too large for this demo."));
        incoming.destroy();
        return;
      }

      const chunks = [];
      let received = 0;
      incoming.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_RESPONSE_BYTES) {
          finish(new Error("The page is too large for this demo."));
          incoming.destroy();
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("aborted", () => finish(new Error("The page ended before the response was complete.")));
      incoming.on("error", (error) => finish(error));
      incoming.on("end", () => {
        if (!incoming.complete) finish(new Error("The page ended before the response was complete."));
        else finish(null, { status, headers, bytes: Buffer.concat(chunks), mediaType });
      });
      incoming.on("close", () => {
        if (!incoming.complete) finish(new Error("The page ended before the response was complete."));
      });
    });
    request.on("error", (error) => finish(error));
    request.on("close", () => {
      if (!settled && !responseStarted) finish(new Error("The page connection closed before a response was received."));
    });
    request.end();
  });
}

async function fetchPublicPage(rawUrl) {
  const deadline = Date.now() + FETCH_DEADLINE_MS;
  let target = await withDeadline(validatePublicUrl(rawUrl), deadline);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestPinnedPage(target, deadline);
    if (response.status >= 300 && response.status < 400) {
      const rawLocation = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (!rawLocation || redirect === MAX_REDIRECTS) throw new Error("The page redirected too many times.");
      target = await withDeadline(validatePublicUrl(new URL(rawLocation, target.url).href), deadline);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`The page returned HTTP ${response.status}.`);
    const markup = new TextDecoder().decode(response.bytes);
    const extracted = response.mediaType.includes("html")
      ? extractReadableText(markup)
      : { title: "", text: normalizedLines(markup, 50_000) };
    if (extracted.text.length < 20) throw new Error("No useful visible text was found on that page.");
    return { ...extracted, finalUrl: target.url.href };
  }
  throw new Error("The page could not be retrieved.");
}

function sameOriginRequest(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  const fetchSite = request.headers["sec-fetch-site"];
  if (!origin || !host || (fetchSite && fetchSite !== "same-origin")) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function clientKey(request) {
  const forwarded = request.headers["x-vercel-forwarded-for"] || request.headers["x-forwarded-for"] || "";
  const value = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded.split(",").at(-1);
  return String(value || request.socket?.remoteAddress || "unknown").trim();
}

function rateLimitAllows(request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  if (rateBuckets.size > 1_000) {
    for (const [candidate, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(candidate);
    while (rateBuckets.size > 1_000) rateBuckets.delete(rateBuckets.keys().next().value);
  }
  return current.count <= 8;
}

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  if (!sameOriginRequest(request)) return response.status(403).json({ error: "This endpoint only accepts requests from the demo." });
  if (!rateLimitAllows(request)) {
    response.setHeader("retry-after", "60");
    return response.status(429).json({ error: "Too many webpage imports. Try again in one minute." });
  }
  const requestLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(requestLength) && requestLength > 4_096) return response.status(413).json({ error: "Request is too large." });
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const rawUrl = String(body?.url || "").trim();
    if (!rawUrl) return response.status(400).json({ error: "Enter a public webpage URL." });
    if (rawUrl.length > 2_048) return response.status(400).json({ error: "The URL is too long." });
    const page = await fetchPublicPage(rawUrl);
    return response.status(200).json({ ...page, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return response.status(422).json({ error: error.message || "The page could not be retrieved." });
  }
}
