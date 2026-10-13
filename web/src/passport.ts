import type { Game, Pick } from "./core";

// Sorphera Passport: every 12 paid tickets earns 1 free ticket.
// One stamp = one eligible paid ticket. Pure accounting lives here; the UI
// only renders what these functions return. DEMO / SIMULATED: records are
// kept in this browser's local storage per demo identity. Contracts will
// later establish authoritative paid-ticket counts, finality and refunds.

export const CARD = 12;
/** The common standard ticket price shared by both demo games (wei). */
export const STANDARD_PRICE = 5000000000000000n;

export type PurchaseState = "pending" | "finalized" | "refunded" | "failed";

export interface PassportPurchase {
  /** Idempotency key: one purchase counts once despite retries or reloads. */
  id: string;
  game: Game;
  round: string;
  /** Ticket price of the round, in wei (as a decimal string for storage). */
  price: string;
  /** Fully paid tickets in the purchase. Reward tickets are never counted. */
  paid: number;
  state: PurchaseState;
  at: number;
  /** True for labelled demo fixtures, false for the customer's own confirmations. */
  sample?: boolean;
}

export interface PassportRedemption {
  id: string;
  game: Game;
  round: string;
  pick: Pick;
  at: number;
}

export interface PassportRecord {
  purchases: PassportPurchase[];
  redemptions: PassportRedemption[];
}

export interface PassportView {
  /** Finalized eligible paid tickets, lifetime. */
  finalized: number;
  /** Eligible paid tickets still pending finality (refundable). */
  pending: number;
  /** Rewards earned from finalized tickets, lifetime. */
  earned: number;
  /** Rewards already consumed by a successful redemption. */
  used: number;
  /** Free tickets available right now. */
  available: number;
  /** Finalized stamps on the current card, 0–11. */
  stamps: number;
  /** Pending stamps shown separately on top of the finalized ones (0–12). */
  pendingStamps: number;
  /** Tickets still needed for the next reward, from finalized stamps. */
  remaining: number;
}

export const eligiblePrice = (price: bigint) => price === STANDARD_PRICE;

export function emptyRecord(): PassportRecord {
  return { purchases: [], redemptions: [] };
}

/** Rewards and leftover stamps for a count of eligible paid tickets. */
export function earn(count: number) {
  const safe = Math.max(0, Math.floor(count));
  return { rewards: Math.floor(safe / CARD), stamps: safe % CARD };
}

export function passportView(record: PassportRecord): PassportView {
  let finalized = 0,
    pending = 0;
  for (const p of record.purchases) {
    if (!eligiblePrice(BigInt(p.price))) continue;
    if (p.state === "finalized") finalized += p.paid;
    else if (p.state === "pending") pending += p.paid;
  }
  const { rewards: earned, stamps } = earn(finalized);
  const used = record.redemptions.length;
  const available = Math.max(0, earned - used);
  const pendingStamps = Math.min(CARD - stamps, pending);
  return {
    finalized,
    pending,
    earned,
    used,
    available,
    stamps,
    pendingStamps,
    remaining: CARD - stamps,
  };
}

/** Progress after a hypothetical purchase of `paid` tickets at `price`. */
export function projectPurchase(
  record: PassportRecord,
  paid: number,
  price: bigint,
): { eligible: boolean; stamps: number; rewards: number } {
  const now = passportView(record);
  if (!eligiblePrice(price) || paid <= 0)
    return { eligible: eligiblePrice(price), stamps: now.stamps, rewards: 0 };
  const after = earn(now.finalized + paid);
  return {
    eligible: true,
    stamps: after.stamps,
    rewards: after.rewards - now.earned,
  };
}

/** Record a purchase once. The same id never counts twice. */
export function recordPurchase(
  record: PassportRecord,
  purchase: PassportPurchase,
): PassportRecord {
  if (record.purchases.some((p) => p.id === purchase.id)) return record;
  if (!Number.isInteger(purchase.paid) || purchase.paid < 0)
    throw new Error("Paid ticket counts must be whole numbers.");
  return { ...record, purchases: [...record.purchases, purchase] };
}

export function setPurchaseState(
  record: PassportRecord,
  id: string,
  state: PurchaseState,
): PassportRecord {
  return {
    ...record,
    purchases: record.purchases.map((p) => (p.id === id ? { ...p, state } : p)),
  };
}

/**
 * Consume one reward after a successful demo confirmation. Throws when no
 * reward is available, when the redemption id was already used, or when the
 * round price is not the standard price.
 */
export function redeemReward(
  record: PassportRecord,
  redemption: PassportRedemption,
  price: bigint,
): PassportRecord {
  if (record.redemptions.some((r) => r.id === redemption.id)) return record;
  if (!eligiblePrice(price))
    throw new Error(
      "Reward tickets can only enter rounds at the standard ticket price.",
    );
  if (passportView(record).available < 1)
    throw new Error("No free ticket is available on this passport.");
  return { ...record, redemptions: [...record.redemptions, redemption] };
}

/** How many free tickets a basket may spend: never more than earned. */
export function spendableRewards(record: PassportRecord, requested: number) {
  const view = passportView(record);
  return Math.max(0, Math.min(view.available, Math.floor(requested)));
}

// ----- Demo persistence, isolated per demo identity -----------------------

export const IDENTITIES = [
  { id: "demo-a", label: "Demo wallet A" },
  { id: "demo-b", label: "Demo wallet B" },
] as const;
export type IdentityId = (typeof IDENTITIES)[number]["id"];
const KEY = "sorphera.demo.passport.v1";
const IDENTITY_KEY = "sorphera.demo.identity.v1";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadIdentity(): IdentityId {
  const saved = store()?.getItem(IDENTITY_KEY);
  return IDENTITIES.some((i) => i.id === saved)
    ? (saved as IdentityId)
    : IDENTITIES[0].id;
}
export function saveIdentity(id: IdentityId) {
  store()?.setItem(IDENTITY_KEY, id);
}

function isRecord(value: unknown): value is PassportRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PassportRecord>;
  return Array.isArray(v.purchases) && Array.isArray(v.redemptions);
}

export function loadRecord(identity: IdentityId): PassportRecord {
  try {
    const raw = store()?.getItem(`${KEY}:${identity}`);
    if (!raw) return emptyRecord();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyRecord();
    return {
      purchases: parsed.purchases.filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          Number.isInteger(p.paid) &&
          typeof p.price === "string" &&
          /^\d+$/.test(p.price),
      ),
      redemptions: parsed.redemptions.filter(
        (r) => r && typeof r.id === "string",
      ),
    };
  } catch {
    return emptyRecord();
  }
}
export function saveRecord(identity: IdentityId, record: PassportRecord) {
  try {
    store()?.setItem(`${KEY}:${identity}`, JSON.stringify(record));
  } catch {
    // Storage may be unavailable (private mode, quota); the demo still runs.
  }
}

/**
 * Labelled sample history so the passport is not empty on first visit:
 * 8 finalized eligible paid tickets, 3 pending ones, and one refunded and one
 * free-ticket purchase that correctly earn nothing. Both fixtures exist so
 * pending versus finalized progress is visible before any purchase.
 */
export function sampleRecord(): PassportRecord {
  return {
    purchases: [
      {
        id: "sample-p1",
        game: 0,
        round: "40",
        price: String(STANDARD_PRICE),
        paid: 5,
        state: "finalized",
        at: 0,
        sample: true,
      },
      {
        id: "sample-p2",
        game: 1,
        round: "41",
        price: String(STANDARD_PRICE),
        paid: 3,
        state: "finalized",
        at: 0,
        sample: true,
      },
      {
        id: "sample-p3",
        game: 0,
        round: "42",
        price: String(STANDARD_PRICE),
        paid: 3,
        state: "pending",
        at: 0,
        sample: true,
      },
      {
        id: "sample-p4",
        game: 1,
        round: "38",
        price: String(STANDARD_PRICE),
        paid: 2,
        state: "refunded",
        at: 0,
        sample: true,
      },
    ],
    redemptions: [],
  };
}
