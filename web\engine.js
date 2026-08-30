const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, fourteen: 14, thirty: 30,
};

const patterns = {
  price: [/\$\s*(\d+(?:\.\d{1,2})?)/gi, /\b(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b/gi],
  promotion: [/\b(\d+(?:\.\d+)?)\s*%/gi, /\b(\d+(?:\.\d+)?)\s*percent\b/gi],
  trial: [
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty)\s*[- ]?days?\b/gi,
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty)\s*[- ]?weeks?\b/gi,
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty)\s*[- ]?months?\b/gi,
  ],
};

const numberValue = (raw) => Number(NUMBER_WORDS[raw.toLowerCase()] ?? raw);

export function extractValues(text, kind) {
  const units = kind === "trial" ? [1, 7, 30] : patterns[kind].map(() => 1);
  return patterns[kind].flatMap((pattern, index) => {
    pattern.lastIndex = 0;
    return [...text.matchAll(pattern)].map((match) => ({
      amount: numberValue(match[1]) * units[index],
      evidence: match[0],
    }));
  });
}

export function parseAssets(raw) {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [product = "", plan = "", title = "", ...text] = line.split("|").map((part) => part.trim());
    if (!product || !title || !text.length) throw new Error(`Asset ${index + 1} needs product | plan | title | text`);
    return { id: `custom-${index + 1}`, product, plan: plan || null, title, text: text.join(" | ") };
  });
}

export function scanAssets({ assets, product, plan, kind, oldValue }) {
  const expected = extractValues(oldValue, kind);
  if (expected.length !== 1) throw new Error(`Enter one recognizable old ${kind} value.`);
  const target = expected[0].amount;
  const candidates = assets.flatMap((asset) => {
    const sameProduct = asset.product.toLowerCase() === product.trim().toLowerCase();
    const samePlan = !plan.trim() || !asset.plan || asset.plan.toLowerCase() === plan.trim().toLowerCase();
    if (!sameProduct || !samePlan) return [];
    const hit = extractValues(asset.text, kind).find((value) => value.amount === target);
    return hit ? [{ ...asset, evidence: hit.evidence }] : [];
  });
  return {
    candidates,
    candidateCount: candidates.length,
    reviewReduction: assets.length ? 1 - candidates.length / assets.length : 0,
  };
}

