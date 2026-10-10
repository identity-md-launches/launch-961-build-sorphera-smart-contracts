import {
  expandLines,
  quickPick,
  type Game,
  type Line,
  type Pick,
} from "./core";

// Illustrative demo conversion, not a live quote. Exact wei arithmetic is
// preserved; budget affordability and displayed USD share this fixed rate.
export const demoQuote = {
  usdPerEth: 2500,
  // Estimated network fee for one purchase transaction in the demo, in wei.
  // One transaction can hold up to 100 tickets, so the fee is per basket.
  feeWei: 400000000000000n, // 0.0004 ETH ≈ US$1.00
  label: "Illustrative demo rate · not a live quote",
} as const;

// Cents from wei, rounded half up, using integer bigint arithmetic only.
export function usdCents(wei: bigint, usdPerEth = demoQuote.usdPerEth): bigint {
  const scaledRate = BigInt(Math.round(usdPerEth * 100)); // cents per ETH
  const num = wei * scaledRate;
  const den = 1000000000000000000n;
  return (num + den / 2n) / den;
}
export function usd(wei: bigint, usdPerEth = demoQuote.usdPerEth): string {
  const c = usdCents(wei, usdPerEth);
  const dollars = c / 100n;
  const cents = c % 100n;
  return `US$${dollars.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}

export interface BudgetPlan {
  limitCents: number;
  valid: boolean;
  priceWei: bigint;
  feeWei: bigint;
  affordable: number;
  count: number;
  subtotalWei: bigint;
  allInWei: bigint;
  subtotalCents: bigint;
  feeCents: bigint;
  allInCents: bigint;
  remainingCents: bigint;
  overBudget: boolean;
  canPurchase: boolean;
  reason: string;
  blockReason: string;
}

/** Keep incomplete edits as text. Only positive, exact USD cents are valid. */
export function budgetCents(value: string | number): number | null {
  const text = String(value).trim();
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return result > 0n && result <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(result)
    : null;
}

export function planBudget(
  limitUsd: string | number,
  priceWei: bigint,
  count: number,
  feeWei: bigint = demoQuote.feeWei,
  usdPerEth = demoQuote.usdPerEth,
): BudgetPlan {
  const parsed = budgetCents(limitUsd);
  const valid = parsed !== null;
  const limitCents = parsed ?? 0;
  const limit = BigInt(limitCents);
  // Round the exact all-in wei once, identically for suggestions and checkout.
  const cost = (n: number) =>
    n > 0 ? usdCents(BigInt(n) * priceWei + feeWei, usdPerEth) : 0n;
  let affordable = 0;
  if (valid) {
    for (let n = 1; n <= 100 && cost(n) <= limit; n++) affordable = n;
  }
  const subtotalWei = BigInt(count) * priceWei;
  const allInWei = count > 0 ? subtotalWei + feeWei : 0n;
  const allInCents = cost(count);
  const subtotalCents = usdCents(subtotalWei, usdPerEth);
  const remainingCents = limit - allInCents;
  const overBudget = allInCents > limit;
  const reason = !valid
    ? "Enter a budget greater than US$0.00, using at most two decimal places."
    : affordable > 0
      ? ""
      : limit < usdCents(feeWei, usdPerEth)
        ? `Your budget does not cover the illustrative network fee of ${usd(feeWei, usdPerEth)}.`
        : `One ticket costs ${usd(priceWei, usdPerEth)} plus ${usd(feeWei, usdPerEth)} in illustrative fees, more than your budget.`;
  const blockReason = !valid
    ? reason
    : overBudget
      ? `This purchase is ${cents(-remainingCents)} over your ${cents(limit)} budget. Remove an entry or change your budget.`
      : count < 1
        ? "Add an entry to review this purchase."
        : count > 100
          ? "Each purchase is limited to 100 tickets."
          : "";
  return {
    limitCents,
    valid,
    priceWei,
    feeWei,
    affordable,
    count,
    subtotalWei,
    allInWei,
    subtotalCents,
    // Reconcile displayed cents to the single rounded total.
    feeCents: count > 0 ? allInCents - subtotalCents : 0n,
    allInCents,
    remainingCents,
    overBudget,
    canPurchase: blockReason === "",
    reason,
    blockReason,
  };
}

export function requireAffordable(plan: BudgetPlan): void {
  if (!plan.canPurchase) throw new Error(plan.blockReason);
}
export const cents = (c: bigint) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "−" : ""}US$${(a / 100n).toLocaleString("en-US")}.${String(a % 100n).padStart(2, "0")}`;
};

export const pickKey = (p: Pick) =>
  `${[...p.main].sort((a, b) => a - b).join("-")}+${p.bonus}`;

/** N different combinations. Selection only: never purchases or signs. */
export function generateDistinct(n: number, existing: Pick[] = []): Pick[] {
  if (!Number.isInteger(n) || n < 1 || n > 100)
    throw new Error("Generate between 1 and 100 entries.");
  const seen = new Set(existing.map(pickKey));
  const out: Pick[] = [];
  let guard = 0;
  while (out.length < n && guard < 100000) {
    guard++;
    const p = quickPick();
    const k = pickKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  if (out.length < n) throw new Error("Not enough distinct combinations left.");
  return out;
}

export interface Basket {
  game: Game;
  round: bigint;
  lines: Line[];
}
export const basketKey = (game: Game, round: bigint) => `${game}:${round}`;
export type Baskets = Record<string, Basket>;
export function setBasketLines(
  baskets: Baskets,
  game: Game,
  round: bigint,
  lines: Line[],
): Baskets {
  const key = basketKey(game, round);
  const next = { ...baskets };
  if (!lines.length) delete next[key];
  else next[key] = { game, round, lines };
  return next;
}
export const basketCount = (b?: Basket) =>
  b ? b.lines.reduce((n, l) => n + l.quantity, 0) : 0;
export const basketEntries = (b?: Basket) => (b ? expandLines(b.lines) : []);

/** iCalendar text for the closing time. Pure data; download is a user action. */
export function calendarEvent(
  title: string,
  cutoff: number,
  url: string,
  uid: string,
): string {
  const stamp = (t: number) =>
    new Date(t * 1000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sorphera demo//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(Math.floor(Date.now() / 1000))}`,
    `DTSTART:${stamp(cutoff)}`,
    `DTEND:${stamp(cutoff + 900)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:Entries close. Results follow once the draw is confirmed; no fixed result time is promised. Demo - no real tickets or prizes.`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
export const localTime = (unix: number) =>
  new Date(unix * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
