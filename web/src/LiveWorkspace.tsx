import { useEffect, useMemo, useState } from "react";
import {
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider,
  type Hash,
  type WalletClient,
} from "viem";
import { mainnet } from "viem/chains";
import deployment from "./deployment.json";
import {
  ContractAdapter,
  activationError,
  explorerTx,
  type Deployment,
} from "./contract";
import { ConfirmedIndexer } from "./indexer";
import {
  type Game,
  type Round,
  type Line,
  type TxState,
  eth,
  quickPick,
  statusLabel,
  type Pick,
  decodeCombination,
  applyDraw,
  emptyDraw,
  type DrawState,
  type DrawEvent,
  transactionErrorState,
} from "./core";
import { PageHead, Balls, Modal } from "./components";
type Provider = EIP1193Provider & {
  on?: (name: string, cb: () => void) => void;
  removeListener?: (name: string, cb: () => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
interface OwnedTicket {
  game: Game;
  round: bigint;
  id: bigint;
  combination: number;
}
export default function LiveWorkspace() {
  const c = deployment as Deployment;
  const unavailable = activationError(c);
  const adapter = useMemo(
    () => (unavailable ? null : new ContractAdapter(c)),
    [unavailable],
  );
  const [rounds, setRounds] = useState<Round[]>([]);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [owner, setOwner] = useState<Address | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tx, setTx] = useState<TxState>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [game, setGame] = useState<Game>(0);
  const [picks, setPicks] = useState<Pick>(quickPick);
  const [quantity, setQuantity] = useState(1);
  const [review, setReview] = useState<Round | null>(null);
  const [draws, setDraws] = useState<Record<string, DrawState>>({});
  const [owned, setOwned] = useState<OwnedTicket[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [claim, setClaim] = useState<(OwnedTicket & { origin: bigint }) | null>(
    null,
  );
  const [origins, setOrigins] = useState<{ game: Game; round: bigint }[]>([]);
  const [proofs, setProofs] = useState<Record<string, Hash>>({});
  const [recipient, setRecipient] = useState("");
  const [right, setRight] = useState("");
  const [compatible, setCompatible] = useState(false);
  const [inventory, setInventory] = useState<Awaited<
    ReturnType<ContractAdapter["inventory"]>
  > | null>(null);
  const [indices, setIndices] = useState<bigint[]>([]);
  const [nftMessage, setNftMessage] = useState("");
  const writable = !activationError(c, true);
  const indexer = useMemo(
    () =>
      adapter
        ? new ConfirmedIndexer(
            adapter.client,
            c.chainId,
            c.lottery!,
            BigInt(c.deploymentBlock!),
            c.confirmations,
          )
        : null,
    [adapter],
  );
  useEffect(() => {
    if (!adapter) return;
    let active = true;
    async function refresh() {
      try {
        await adapter!.verify();
        const next = await Promise.all(
          ([0, 1] as Game[]).map((g) => adapter!.round(g)),
        );
        const logs = await indexer!.sync();
        if (!active) return;
        setRounds(next);
        setOrigins(
          logs.events
            .filter((e) => e.event.eventName === "RoundOpened")
            .map((e) => e.event.args as { game: Game; round: bigint }),
        );
        const nextProofs: Record<string, Hash> = {};
        const drawStates: Record<string, DrawState> = {};
        for (const item of logs.events) {
          const a = item.event.args as Record<string, unknown>;
          const k = `${a.game}:${a.round}`;
          if (item.log.transactionHash)
            nextProofs[k] = item.log.transactionHash;
          const event = {
            name: item.event.eventName,
            requestId: a.requestId?.toString(),
            main: a.ordered,
            bonus: a.bonus,
            matches: a.matches === undefined ? undefined : Number(a.matches),
            winningTicket: a.winningTicket?.toString(),
          } as DrawEvent;
          if (
            [
              "DrawRequested",
              "RandomnessStored",
              "Result",
              "TieBreakRequired",
              "TieBreakRequested",
              "TieBreakRandomnessStored",
              "TieBreakResult",
              "Rollover",
              "Cancelled",
            ].includes(event.name)
          )
            drawStates[k] = applyDraw(
              drawStates[k] ?? { ...emptyDraw },
              event,
              a.game as Game,
            );
        }
        setDraws(drawStates);
        setProofs(nextProofs);
        setMessage(
          logs.caughtUp
            ? "Confirmed history synchronized."
            : "Loading confirmed history in bounded pages…",
        );
        if (owner) {
          const t = indexer!.tickets(owner, page * 20, 20);
          setHasMore(t.total > (page + 1) * 20);
          setOwned(
            t.items.map((e) => {
              const a = e.event.args as {
                game: Game;
                round: bigint;
                ticket: bigint;
                combination: number;
              };
              return {
                game: a.game,
                round: a.round,
                id: a.ticket,
                combination: a.combination,
              };
            }),
          );
        }
        setError("");
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setRounds([]);
          setOwned([]);
          setDraws({});
        }
      }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [adapter, owner, page, indexer]);
  useEffect(() => {
    const provider = window.ethereum;
    const reset = () => {
      setWallet(null);
      setOwner(null);
      setOwned([]);
      setClaim(null);
      setReview(null);
      setInventory(null);
      setHash(null);
      setTx("idle");
      setError(
        "Wallet or network changed. Connect again and review the action.",
      );
    };
    provider?.on?.("accountsChanged", reset);
    provider?.on?.("chainChanged", reset);
    return () => {
      provider?.removeListener?.("accountsChanged", reset);
      provider?.removeListener?.("chainChanged", reset);
    };
  }, []);
  async function connect() {
    try {
      if (!window.ethereum)
        throw new Error("Install or open an Ethereum wallet to connect.");
      const client = createWalletClient({
        chain: mainnet,
        transport: custom(window.ethereum),
      });
      const addresses = await client.requestAddresses();
      if ((await client.getChainId()) !== 1)
        throw new Error(
          "Switch your wallet to Ethereum mainnet, then reconnect.",
        );
      setWallet(client);
      setOwner(addresses[0]);
      setRecipient(addresses[0]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function send(action: () => Promise<Hash>, queued = false) {
    setTx("awaiting-approval");
    setError("");
    let submitted = false;
    try {
      const h = await action();
      submitted = true;
      setHash(h);
      setTx("pending");
      await adapter!.receipt(h);
      setTx("confirmed");
      setMessage(
        queued
          ? "Purchaser rewards queued. Delivery remains unconfirmed until the helper Claimed event."
          : "Transaction confirmed. Refreshing entitlements is required before another claim.",
      );
      return h;
    } catch (e) {
      const next = transactionErrorState((e as Error).message, submitted);
      setTx(next);
      setError(
        next === "pending"
          ? "Confirmation is unavailable. The transaction may still complete. Check its receipt before submitting another action."
          : (e as Error).message,
      );
      return null;
    }
  }
  async function inspect(t: OwnedTicket, origin = t.round) {
    if (!owner || !adapter) return;
    setClaim({ ...t, origin });
    setInventory(null);
    setIndices([]);
    setRight("Checking current entitlement…");
    setNftMessage("");
    try {
      const r = await adapter.entitlement(t.game, origin, t.id, owner);
      setRight(
        `${eth(r.amount)} ETH currently claimable. ${r.divisor > 1n ? "Shared in-kind assets require unanimous nomination." : ""}`,
      );
      const assets = await adapter.inventory(t.game, origin);
      setInventory(assets);
    } catch (e) {
      setRight((e as Error).message);
    }
  }
  if (unavailable)
    return (
      <>
        <PageHead
          eyebrow="Ethereum mainnet"
          title="Live play is unavailable."
          description={unavailable}
        />
        <p>
          No deployment address is inferred from the historical parked Sepolia
          launch. No wallet request is made.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Retry configuration
        </button>
      </>
    );
  return (
    <>
      <PageHead
        eyebrow={writable ? "Ethereum mainnet" : "Ethereum mainnet · read-only"}
        title="Your Sorphera rounds"
        description="Live values come from the verified deployment. Confirm the game, round, price and recipient before every wallet approval."
      />
      <p className="notice">
        {writable
          ? "Transactions activated for this verified deployment. Gas costs are additional."
          : "Read-only mode. Wallet connection cannot enable transactions."}
      </p>
      <div className="row wrap">
        <button id="live-connect" className="button" onClick={connect}>
          {owner
            ? `Connected ${owner.slice(0, 6)}…${owner.slice(-4)}`
            : "Connect wallet"}
        </button>
        <p role="status">{message}</p>
      </div>
      <p role="alert" className="error">
        {error}
      </p>
      <div className="jackpot-grid">
        {rounds.map((r) => (
          <article className="jackpot" key={r.game}>
            <h2>
              {r.game === 0 ? "ETH" : "NFT"} · Round {String(r.id)}
            </h2>
            <p>
              {statusLabel(r.status)} ·{" "}
              {r.salesEnabled ? "Sales enabled" : "Sales paused"}
            </p>
            <p>
              {eth(r.actualETH)} actual ETH · {r.securedNFTs} secured NFTs ·{" "}
              {r.pendingPulls} pending pulls excluded
            </p>
            {r.cancellationReview && (
              <p>
                Custody review: {r.cancellationReview.cursor} of{" "}
                {r.cancellationReview.total}. Still Closed; waiting for
                DrawRequested or Cancelled evidence.
              </p>
            )}
            <p>
              {eth(r.price)} ETH per ticket · Cutoff{" "}
              {new Date(r.cutoff * 1000).toUTCString()}
            </p>
          </article>
        ))}
      </div>
      <section className="picker-panel" style={{ marginTop: 24 }}>
        <h2>Choose an entry</h2>
        <div className="filters">
          <label>
            Game
            <select
              value={game}
              onChange={(e) => setGame(Number(e.target.value) as Game)}
            >
              <option value="0">ETH</option>
              <option value="1">NFT</option>
            </select>
          </label>
          <label>
            Number 1
            <input
              type="number"
              min="1"
              max="20"
              value={picks.main[0]}
              onChange={(e) =>
                setPicks({
                  ...picks,
                  main: [+e.target.value, picks.main[1], picks.main[2]],
                })
              }
            />
          </label>
          <label>
            Number 2
            <input
              type="number"
              min="1"
              max="20"
              value={picks.main[1]}
              onChange={(e) =>
                setPicks({
                  ...picks,
                  main: [picks.main[0], +e.target.value, picks.main[2]],
                })
              }
            />
          </label>
          <label>
            Number 3
            <input
              type="number"
              min="1"
              max="20"
              value={picks.main[2]}
              onChange={(e) =>
                setPicks({
                  ...picks,
                  main: [picks.main[0], picks.main[1], +e.target.value],
                })
              }
            />
          </label>
          <label>
            Bonus
            <input
              type="number"
              min="1"
              max="5"
              value={picks.bonus}
              onChange={(e) => setPicks({ ...picks, bonus: +e.target.value })}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="1"
              max="100"
              value={quantity}
              onChange={(e) => setQuantity(+e.target.value)}
            />
          </label>
        </div>
        <div className="row wrap">
          <button className="button" onClick={() => setPicks(quickPick())}>
            Quick Pick
          </button>
          <button
            className="button primary"
            disabled={
              !writable ||
              !wallet ||
              !rounds.length ||
              tx === "pending" ||
              tx === "awaiting-approval"
            }
            onClick={() => {
              setError("");
              setReview(rounds[game]);
            }}
          >
            Review tickets
          </button>
        </div>
      </section>
      <section style={{ marginTop: 40 }}>
        <h2>Confirmed draw results</h2>
        <p className="fine">
          Recorded from confirmed contract events. NFT results stay provisional
          until the separate tie-break result.
        </p>
        {Object.entries(draws)
          .slice(-20)
          .map(([identity, state]) => (
            <article className="history-row" key={identity}>
              <div>
                <h3>Game / round {identity}</h3>
                {proofs[identity] && (
                  <a
                    className="inline-link"
                    href={explorerTx(proofs[identity])}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View confirmed transaction ↗
                  </a>
                )}
                <p>{state.stage}</p>
                <p>
                  {state.provisional
                    ? "Provisional · claims unavailable"
                    : state.winningTicket && state.winningTicket !== "0"
                      ? `Winning ticket #${state.winningTicket}`
                      : ""}
                </p>
              </div>
              {state.main && state.bonus && (
                <Balls pick={{ main: state.main, bonus: state.bonus }} />
              )}
            </article>
          ))}
      </section>
      <section style={{ marginTop: 40 }}>
        <h2>My tickets</h2>
        <p className="fine">
          20 tickets per page. Prize balances exclude company rewards. Claims
          remain available when sales are paused.
        </p>
        {owned.map((t) => (
          <article className="my-ticket" key={`${t.game}:${t.round}:${t.id}`}>
            <div>
              <h3>
                {t.game === 0 ? "ETH" : "NFT"} · Round {String(t.round)} ·
                Ticket #{String(t.id)}
              </h3>
              <Balls pick={decodeCombination(t.combination)} />
            </div>
            <button className="button" onClick={() => void inspect(t)}>
              View entitlement
            </button>
          </article>
        ))}
        {!owned.length && (
          <p>
            {owner
              ? "No tickets in the indexed portion of confirmed history."
              : "Connect a wallet to find your tickets."}
          </p>
        )}
        <div className="row">
          <button
            className="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous page
          </button>
          <button
            className="button"
            disabled={!hasMore}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </button>
        </div>
      </section>
      <p role="status">
        {tx === "awaiting-approval"
          ? "Awaiting wallet approval"
          : tx === "pending"
            ? "Transaction pending"
            : tx === "confirmed"
              ? "Transaction confirmed"
              : tx === "rejected"
                ? "Wallet approval rejected. Review to retry."
                : tx === "failed"
                  ? "Transaction failed. Review current state before retrying."
                  : ""}
      </p>
      {hash && (
        <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
          View transaction on Etherscan ↗
        </a>
      )}
      {hash && tx === "pending" && (
        <button
          className="button"
          onClick={() =>
            void adapter!
              .receipt(hash)
              .then(() => {
                setTx("confirmed");
                setError("");
                setMessage(
                  "Transaction confirmed. Refresh entitlements; reward queueing still requires a separate helper delivery.",
                );
              })
              .catch((e) => {
                setTx(transactionErrorState(e.message, true));
                setError(e.message);
              })
          }
        >
          Check transaction confirmation
        </button>
      )}
      {review && (
        <Modal title="Review live purchase" onClose={() => setReview(null)}>
          <p>
            Ethereum mainnet · {review.game === 0 ? "ETH" : "NFT"} · Round{" "}
            {String(review.id)}
          </p>
          <Balls pick={picks} />
          <p>
            {quantity} tickets × {eth(review.price)} ETH. Plus network gas.
          </p>
          <p>
            3 distinct main numbers, one bonus. Tickets are nontransferable and
            expire with this round. Your wallet will show the transaction value.
          </p>
          <button
            className="button primary full"
            disabled={tx === "pending" || tx === "awaiting-approval"}
            onClick={() =>
              void send(() =>
                adapter!.buy(wallet!, review, [{ ...picks, quantity } as Line]),
              ).then((h) => {
                if (h) setReview(null);
              })
            }
          >
            Confirm in wallet
          </button>
          <p role="alert">{error}</p>
        </Modal>
      )}
      {claim && (
        <Modal title="Review available claim" onClose={() => setClaim(null)}>
          <p>
            Ticket #{String(claim.id)} · {claim.game === 0 ? "ETH" : "NFT"}{" "}
            round {String(claim.round)}
          </p>
          <label>
            Prize source round
            <select
              value={String(claim.origin)}
              onChange={(e) => void inspect(claim, BigInt(e.target.value))}
            >
              {[
                ...new Set([
                  claim.round,
                  ...origins
                    .filter(
                      (o) => o.game === claim.game && o.round <= claim.round,
                    )
                    .map((o) => o.round),
                ]),
              ]
                .sort((a, b) => Number(b - a))
                .map((id) => (
                  <option key={String(id)} value={String(id)}>
                    Round {String(id)}
                  </option>
                ))}
            </select>
          </label>
          <p className="fine">
            Rolled prizes can span several originating vaults. Each claim
            rechecks your ticket’s rights to the selected source round.
          </p>
          <p>{right}</p>
          <label>
            Recipient address
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={compatible}
              onChange={(e) => setCompatible(e.target.checked)}
            />
            Recipient contract supports ERC721 safe transfers
          </label>
          <div className="stack">
            <button
              className="button"
              disabled={
                !writable ||
                !wallet ||
                tx === "pending" ||
                tx === "awaiting-approval"
              }
              onClick={() =>
                void send(() =>
                  adapter!.claimETH(
                    wallet!,
                    claim.game,
                    claim.origin,
                    [claim.id],
                    recipient as Address,
                  ),
                )
              }
            >
              Claim ETH / refund
            </button>
            <button
              className="button"
              disabled={
                !writable ||
                !wallet ||
                tx === "pending" ||
                tx === "awaiting-approval"
              }
              onClick={() =>
                void send(
                  async () =>
                    adapter!.claimTokens(
                      wallet!,
                      claim.game,
                      claim.origin,
                      claim.id,
                      recipient as Address,
                      (await adapter!.client.getBlock()).timestamp + 1200n,
                    ),
                  true,
                )
              }
            >
              Queue purchaser rewards
            </button>
            <button
              className="button"
              disabled={
                !writable ||
                !wallet ||
                tx === "pending" ||
                tx === "awaiting-approval"
              }
              onClick={() => {
                let helper: Address | null = null;
                void send(async () => {
                  const delivery = await adapter!.deliverPurchaserRewards(
                    wallet!,
                    claim.game,
                    claim.origin,
                    recipient as Address,
                  );
                  helper = delivery.helper;
                  return delivery.hash;
                }).then(async (h) => {
                  if (h && helper) {
                    const result = await adapter!.purchaserDelivery(
                      h,
                      helper,
                      recipient as Address,
                    );
                    setMessage(
                      result.state === "delivered"
                        ? `Helper Claimed event confirms ${result.amount} token base units delivered to the recipient.`
                        : "No matching helper delivery event was confirmed.",
                    );
                  }
                });
              }}
            >
              Deliver queued rewards
            </button>
          </div>
          {inventory && (
            <>
              <p>
                Secured inventory page · {inventory.assets.length} of{" "}
                {String(inventory.total)}
              </p>
              {inventory.assets
                .filter((a) => !a.claimed && a.secured)
                .map((a) => (
                  <label key={String(a.index)} className="checkbox">
                    <input
                      type="checkbox"
                      checked={indices.includes(a.index)}
                      onChange={(e) =>
                        setIndices(
                          e.target.checked
                            ? [...indices, a.index]
                            : indices.filter((i) => i !== a.index),
                        )
                      }
                    />
                    Asset {String(a.index)} · token #{String(a.tokenId)}
                  </label>
                ))}
              <button
                className="button primary full"
                disabled={
                  !writable ||
                  !wallet ||
                  !indices.length ||
                  tx === "pending" ||
                  tx === "awaiting-approval"
                }
                onClick={() =>
                  void send(() =>
                    adapter!.claimNFTs(
                      wallet!,
                      claim.game,
                      claim.origin,
                      claim.id,
                      indices,
                      recipient as Address,
                      compatible,
                    ),
                  ).then(async (h) => {
                    if (h) {
                      const vault = await adapter!.verifiedVault(
                        claim.game,
                        claim.origin,
                      );
                      const outcomes = await adapter!.nftOutcomes(h, vault);
                      setNftMessage(
                        outcomes
                          .map((o) => `Asset ${o.index}: ${o.state}`)
                          .join("; "),
                      );
                      setIndices(
                        outcomes
                          .filter((o) => o.state === "failed")
                          .map((o) => o.index),
                      );
                    }
                  })
                }
              >
                Claim selected NFTs
              </button>
              <button
                className="button full"
                disabled={inventory.next >= inventory.total}
                onClick={() =>
                  void adapter!
                    .inventory(claim.game, claim.origin, inventory.next)
                    .then((a) => {
                      setInventory(a);
                      setIndices([]);
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Next 20 assets
              </button>
            </>
          )}
          <p role="status">{nftMessage}</p>
          <p role="alert">{error}</p>
          <p className="fine">
            NFT failures stay retryable. Shared assets may wait for unanimous
            recipient votes. A purchaser-reward transaction only queues tokens;
            helper delivery needs separate confirmed evidence.
          </p>
        </Modal>
      )}
    </>
  );
}
