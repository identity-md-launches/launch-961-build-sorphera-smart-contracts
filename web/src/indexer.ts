import {
  decodeEventLog,
  type PublicClient,
  type Log,
  type Address,
  type Hex,
} from "viem";
import { sorpheraAbi } from "./Sorphera.abi";
import { type Game, dataKey } from "./core";
export interface IndexedLog {
  key: string;
  log: Log;
  event: ReturnType<typeof decodeEventLog>;
}
// One instance per chain + lottery. Bounded page work, confirmed-only cache and checkpoint rollback.
export class ConfirmedIndexer {
  private logs = new Map<string, IndexedLog>();
  private cursor: bigint;
  private checkpoint: { number: bigint; hash: Hex } | null = null;
  private inflight: Promise<{
    events: IndexedLog[];
    caughtUp: boolean;
  }> | null = null;
  constructor(
    private client: PublicClient,
    readonly chain: number,
    readonly lottery: Address,
    readonly deploymentBlock: bigint,
    readonly confirmations = 12,
  ) {
    this.cursor = deploymentBlock;
  }
  sync() {
    if (!this.inflight)
      this.inflight = this.scan().finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }
  clear() {
    this.logs.clear();
    this.cursor = this.deploymentBlock;
    this.checkpoint = null;
  }
  private async scan() {
    if ((await this.client.getChainId()) !== this.chain) {
      this.clear();
      throw new Error("RPC chain changed. Cached results cleared.");
    }
    const tip = await this.client.getBlockNumber({ cacheTime: 0 });
    if (this.checkpoint) {
      const b = await this.client
        .getBlock({ blockNumber: this.checkpoint.number })
        .catch(() => null);
      if (!b || b.hash !== this.checkpoint.hash) this.clear();
    }
    const confirmed = tip - BigInt(this.confirmations - 1);
    let pages = 0;
    while (this.cursor <= confirmed && pages++ < 5) {
      const to =
        this.cursor + 999n < confirmed ? this.cursor + 999n : confirmed;
      const before = await this.client.getBlock({ blockNumber: to });
      const raw = await this.client.getLogs({
        address: this.lottery,
        fromBlock: this.cursor,
        toBlock: to,
      });
      const after = await this.client.getBlock({ blockNumber: to });
      if (before.hash !== after.hash) {
        this.clear();
        throw new Error(
          "Chain reorganized during sync. Retry to rebuild confirmed history.",
        );
      }
      for (const log of raw) {
        if (log.removed) continue;
        try {
          const event = decodeEventLog({
            abi: sorpheraAbi,
            data: log.data,
            topics: log.topics,
          });
          const args = event.args as Record<string, unknown>;
          const game = args.game as Game | undefined;
          const round = args.round as bigint | undefined;
          if (game === undefined || round === undefined) continue;
          const request =
            "requestId" in args ? String(args.requestId) : "round";
          const key = `${dataKey(this.chain, this.lottery, game, round, request)}:${log.blockHash}:${log.logIndex}`;
          this.logs.set(key, { key, log, event });
        } catch {
          /* unknown logs do not enter trusted replay */
        }
      }
      this.cursor = to + 1n;
      this.checkpoint = { number: to, hash: after.hash! };
    }
    return {
      events: [...this.logs.values()].sort(
        (a, b) =>
          Number(a.log.blockNumber! - b.log.blockNumber!) ||
          a.log.logIndex! - b.log.logIndex!,
      ),
      caughtUp: this.cursor > confirmed,
    };
  }
  tickets(owner: Address, offset = 0, limit = 20) {
    if (offset < 0 || !Number.isInteger(offset) || limit < 1 || limit > 50)
      throw new Error("Invalid ticket page.");
    const all = [...this.logs.values()].filter((e) => {
      const a = e.event.args as Record<string, unknown>;
      return (
        e.event.eventName === "TicketBought" &&
        String(a.player).toLowerCase() === owner.toLowerCase()
      );
    });
    return { items: all.slice(offset, offset + limit), total: all.length };
  }
}
