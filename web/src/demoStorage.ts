import { validatePick, type Game } from "./core";
import { initialTickets, type DemoTicket } from "./fixtures";
import type { Baskets } from "./budget";

// New namespace: do not rewrite earlier Passport ledgers or infer missing picks.
const key = (identity: string) => `sorphera.demo.entries.v2:${identity}`;
export function loadEntries(identity: string): {
  tickets: DemoTicket[];
  baskets: Baskets;
} {
  try {
    const raw = JSON.parse(localStorage.getItem(key(identity)) ?? "{}");
    const tickets: DemoTicket[] = (
      Array.isArray(raw.tickets) ? raw.tickets : []
    )
      .filter(
        (t: DemoTicket) =>
          t.source === "mine" &&
          typeof t.id === "string" &&
          [0, 1].includes(t.game) &&
          /^\d+$/.test(String(t.round)) &&
          validatePick(t.pick),
      )
      .map((t: DemoTicket) => ({ ...t, round: BigInt(t.round) }));
    const baskets: Baskets = {};
    for (const [id, value] of Object.entries(raw.baskets ?? {})) {
      const b = value as Baskets[string];
      if (
        ![0, 1].includes(b.game) ||
        !/^\d+$/.test(String(b.round)) ||
        !Array.isArray(b.lines)
      )
        continue;
      const valid = (line: (typeof b.lines)[number]) =>
        validatePick(line) &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        line.quantity <= 100;
      if (!b.lines.every(valid) || !(b.rewards ?? []).every(valid)) continue;
      if (id !== `${b.game}:${b.round}`) continue;
      baskets[id] = { ...b, game: b.game as Game, round: BigInt(b.round) };
    }
    return { tickets: [...tickets, ...initialTickets], baskets };
  } catch {
    return { tickets: initialTickets, baskets: {} };
  }
}
export function saveEntries(
  identity: string,
  tickets: DemoTicket[],
  baskets: Baskets,
) {
  try {
    localStorage.setItem(
      key(identity),
      JSON.stringify(
        { tickets: tickets.filter((t) => t.source === "mine"), baskets },
        (_, value) => (typeof value === "bigint" ? String(value) : value),
      ),
    );
  } catch {
    /* Browser storage may be unavailable; current-session state remains. */
  }
}
