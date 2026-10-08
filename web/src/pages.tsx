import { useEffect, useState } from "react";
import {
  asset,
  Balls,
  Globe,
  Modal,
  PageHead,
  SectionHeading,
} from "./components";
import { demoRounds, scenarios } from "./fixtures";
import { eth, replay } from "./core";
export function Countdown({ cutoff }: { cutoff: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, cutoff - Math.floor(now / 1000));
  return (
    <span className="countdown">
      {diff
        ? `${Math.floor(diff / 86400)}d ${String(Math.floor((diff % 86400) / 3600)).padStart(2, "0")}h ${String(Math.floor((diff % 3600) / 60)).padStart(2, "0")}m`
        : "Cutoff reached · awaiting settlement"}
    </span>
  );
}
export function Home() {
  const [gallery, setGallery] = useState<number | null>(null);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-star" aria-hidden="true">
              ✦
            </span>{" "}
            A world of possibility
          </p>
          <h1>
            <img
              className="hero-wordmark"
              src={asset("sorphera-wordmark-ice-blue")}
              alt="Sorphera"
              width="1000"
              height="333"
            />
          </h1>
          <p className="tagline">
            Weekly ETH &amp; NFT lottery ball jackpots. Powered by FWA.
          </p>
          <p className="hero-description">
            Three numbers. One bonus. Your little chance
            <br className="desktop-break" /> at something out of this world.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#play">
              Make your picks <span aria-hidden="true">↗</span>
            </a>
            <a className="watch-link" href="#draw">
              {" "}
              <span className="play-icon" aria-hidden="true">
                ▷
              </span>{" "}
              Watch demo draw
            </a>
          </div>
          <p className="fine hero-note">
            Explore the experience. No wallet needed.
          </p>
        </div>
        <div className="hero-art">
          <img
            src={asset("hero-world")}
            alt="Plush ice-blue and pink globe lottery balls nestled among pink clouds and iridescent crystals"
            width="796"
            height="661"
            fetchPriority="high"
          />
          <span className="art-label">A LITTLE LUCK GOES A LONG WAY.</span>
        </div>
      </section>
      <section className="jackpot-section" aria-labelledby="jackpots-title">
        <div className="section-heading compact">
          <h2 id="jackpots-title">Two jackpots. Endless possibility.</h2>
          <span className="fine">
            Independent weekly draws · synthetic amounts
          </span>
        </div>
        <div className="jackpot-grid">
          {demoRounds.map((r) => (
            <article className={`jackpot jackpot-${r.game}`} key={r.game}>
              <div className="jackpot-top">
                <span className="eyebrow">
                  {r.game === 0 ? "ETH jackpot" : "NFT jackpot"}
                </span>
                <span className="open-pill">Demo round #{String(r.id)}</span>
              </div>
              <div className="jackpot-amount">
                <div>
                  <h3>
                    {r.game === 0 ? eth(r.actualETH) : r.securedNFTs}
                    <span>{r.game === 0 ? " ETH" : " NFTs"}</span>
                  </h3>
                  <p>
                    {r.game === 0
                      ? "One prize. Shared by matching tickets."
                      : "One winning ticket. The whole collection."}
                  </p>
                </div>
                <Globe kind={r.game === 0 ? "eth" : "nft"} size="large" />
              </div>
              <div className="jackpot-footer">
                <div>
                  <span className="fine">Entries close in</span>
                  <strong>
                    <Countdown cutoff={r.cutoff} />
                  </strong>
                  <span className="cutoff">
                    {new Date(r.cutoff * 1000).toLocaleString("en-GB", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </span>
                </div>
                <a
                  className={`button ${r.game === 0 ? "ice" : "pink-button"}`}
                  href={`#play?game=${r.game}`}
                >
                  Play {r.game === 0 ? "ETH" : "NFT"}{" "}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <details className="jackpot-accounting">
                <summary>What’s in this jackpot?</summary>
                <p>
                  {r.game === 0
                    ? "18.42 ETH in actual prize cash; 1 pending pull excluded."
                    : "6 secured NFTs. 2 pending pulls are excluded. 0.012 ETH incidental funds are separate."}{" "}
                  These are synthetic fixture values, not live balances.
                  Purchaser rewards are separate; company revenue is excluded.
                  No NFT valuation is assumed.
                </p>
              </details>
            </article>
          ))}
        </div>
      </section>
      <section className="how-section">
        <SectionHeading
          eyebrow="Small picks. Big possibilities."
          title="A whole world in three steps."
        />
        <div className="steps">
          <article>
            <span className="step-number">01</span>
            <h3>Find your jackpot.</h3>
            <p>
              ETH or NFTs? Pick your world. Each has its own weekly round and
              prize.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>Make it your numbers.</h3>
            <p>
              Choose 3 different numbers from 1–20 and a bonus from 1–5. Order
              doesn’t matter.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Watch your world unfold.</h3>
            <p>
              Match all four to qualify. ETH matches split the prize. NFT ties
              get a separate draw.
            </p>
          </article>
        </div>
        <a className="inline-link" href="#faq">
          A few more things to know <span aria-hidden="true">↗</span>
        </a>
      </section>
      <section className="recent-section">
        <SectionHeading
          eyebrow="The last little moments of luck"
          title="Fresh from the draw room."
        >
          <a className="inline-link" href="#history">
            All results ↗
          </a>
        </SectionHeading>
        <div className="recent-results">
          {scenarios.slice(0, 2).map((s) => (
            <a
              className="recent-result"
              key={s.id}
              href={`#draw?scenario=${s.id}`}
            >
              <div>
                <span className="eyebrow">
                  {s.game === 0 ? "ETH" : "NFT"} / Round {String(s.round)}
                </span>
                <h3>{s.prize}</h3>
                <p className="fine">
                  {s.game === 0
                    ? "3 matches · 4.28 ETH each"
                    : "Tie-break complete · ticket #118"}
                </p>
              </div>
              <Balls pick={{ main: [7, 12, 19], bonus: 4 }} />
              <span className="round-arrow" aria-label="Watch replay">
                ↗
              </span>
            </a>
          ))}
        </div>
        <p className="fine">
          Synthetic demo results. No real winners or prizes.
        </p>
      </section>
      <section className="gallery-section">
        <SectionHeading
          eyebrow="Objects of possibility"
          title="Meet the little worlds."
        >
          <span className="fine">
            Demo collection · supplied Sorphera artwork
          </span>
        </SectionHeading>
        <div className="gallery">
          {["Blue planet", "Pink orbit", "Lucky world", "Soft horizons"].map(
            (name, i) => (
              <button
                className={`gallery-item gallery-${i}`}
                key={name}
                onClick={() => setGallery(i)}
              >
                <div className="gallery-art">
                  <Globe
                    kind={i % 2 ? "nft" : "eth"}
                    number={[7, 4, 19, 12][i]}
                    size="large"
                  />
                </div>
                <span className="gallery-meta">
                  <strong>{name}</strong>
                  <span>
                    World study 0{i + 1} <span aria-hidden="true">↗</span>
                  </span>
                </span>
              </button>
            ),
          )}
        </div>
        <p className="fine">
          Illustrative gallery, not real NFT metadata or sale listings. The demo
          round contains 6 synthetic secured assets; 4 studies are shown.
        </p>
      </section>
      <div className="closing-banner">
        <div>
          <p className="eyebrow">A little luck starts here.</p>
          <h2>Which world will you pick?</h2>
        </div>
        <a className="button primary" href="#play">
          Explore the demo ↗
        </a>
      </div>
      {gallery !== null && (
        <Modal
          title={
            ["Blue planet", "Pink orbit", "Lucky world", "Soft horizons"][
              gallery
            ]
          }
          onClose={() => setGallery(null)}
        >
          <div className="gallery-detail">
            <Globe
              kind={gallery % 2 ? "nft" : "eth"}
              size="large"
              number={[7, 4, 19, 12][gallery]}
            />
          </div>
          <p>World study 0{gallery + 1} · synthetic gallery asset.</p>
          <p>
            This illustration uses the supplied Sorphera branding. It is not an
            actual NFT, collection endorsement or prize. No valuation is
            assigned.
          </p>
          <a
            href="#play?game=1"
            className="button primary full"
            onClick={() => setGallery(null)}
          >
            Explore the NFT demo
          </a>
        </Modal>
      )}
    </>
  );
}
export function History() {
  const [filter, setFilter] = useState("all");
  return (
    <>
      <PageHead
        eyebrow="Every little moment, remembered"
        title="The result is in."
        description="Explore past demo draws, winning numbers, rollovers and the stories between."
      />
      <div className="filters">
        <label>
          Jackpot
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All jackpots</option>
            <option value="0">ETH jackpot</option>
            <option value="1">NFT jackpot</option>
          </select>
        </label>
        <p className="fine">Synthetic fixtures · not an onchain history</p>
      </div>
      <div className="history-list">
        {scenarios
          .filter((s) => filter === "all" || String(s.game) === filter)
          .map((s) => {
            const state = replay(s.events, s.game);
            return (
              <article key={s.id} className="history-row">
                <div>
                  <p className="eyebrow">
                    {s.game === 0 ? "ETH" : "NFT"} jackpot · Round{" "}
                    {String(s.round)}
                  </p>
                  <h2>{s.prize}</h2>
                  <p>{s.description}</p>
                  <details>
                    <summary>Result details</summary>
                    <p>
                      Status: {state.stage}. Matches:{" "}
                      {state.main ? state.matches : "Not determined"}.{" "}
                      {state.winningTicket && state.winningTicket !== "0"
                        ? `Winning ticket: #${state.winningTicket}.`
                        : ""}
                    </p>
                    <p>
                      Explorer proof unavailable: this is a synthetic fixture
                      with no transaction hash. Verified live records link to
                      Ethereum mainnet receipts.
                    </p>
                    <p>
                      Old tickets expire on rollover. Reward queueing is
                      separate from confirmed delivery.
                    </p>
                  </details>
                </div>
                <div className="history-numbers">
                  {state.main && state.bonus ? (
                    <Balls pick={{ main: state.main, bonus: state.bonus }} />
                  ) : (
                    <p className="muted">No numbers drawn</p>
                  )}
                  <a className="button" href={`#draw?scenario=${s.id}`}>
                    Watch demo replay ↗
                  </a>
                </div>
              </article>
            );
          })}
      </div>
    </>
  );
}
export const faqs = [
  [
    "How do I play?",
    "Choose the ETH or NFT game. Each ticket enters one round of one game. Pick 3 distinct unordered main numbers from 1–20 and 1 bonus from 1–5. Match all four. Quick Pick only chooses an entry; you still review and approve it. The default ticket price is 0.005 ETH, but a live round’s frozen price, eligibility and deadline are authoritative.",
  ],
  [
    "What are the odds?",
    "There are 5,700 number combinations. The chance of matching all numbers is 1 in 5,700 per entry. This does not guarantee sole NFT victory: multiple matching NFT tickets need a separate random tie-break. Duplicate combinations are allowed, tickets are nontransferable, and total sales are uncapped. A transaction can contain at most 100 tickets.",
  ],
  [
    "What happens when more than one ticket matches?",
    "ETH matches share distributable ETH equally, including duplicate tickets. One NFT match wins the inventory and incidental ETH. With multiple NFT matches, a separate Chainlink VRF request selects one matching ticket for all inventory. No winner or claim is final until TieBreakResult.",
  ],
  [
    "Where does the ticket money go?",
    "90% of new sales funds FWA acquisitions for that originating round. 10% is held as operator fees under the contract rules. ETH prizes include actual cashouts, unused budget, refunds and ETH carryover, not estimated NFT values. NFT counts include only secured custody, not pending pulls. Company builder rewards are revenue and never part of the jackpot. Purchaser FWA token rewards, when actually received, are separate in-kind entitlements.",
  ],
  [
    "What is the relationship with FWA?",
    "Sorphera’s contracts use FWA to acquire randomly selected assets. ETH rounds normally settle acquisitions to ETH; NFT rounds normally retain the NFTs. “Powered by FWA” describes this integration, not an endorsement or a guarantee. There is no fixed FWA spin price, guaranteed return or assumed reward emission.",
  ],
  [
    "What if nobody matches?",
    "Each game rolls its own prize to its next round. ETH prize funds roll within the ETH game; NFT inventory and residual funds roll within the NFT game. Old tickets expire and do not enter the next round. A round with zero tickets skips lottery randomness and retains carryover.",
  ],
  [
    "How is the draw decided?",
    "Confirmed contract results determine the balls. Animation, physics and client timers never choose winners. The draw follows DrawRequested, RandomnessStored and Result. NFT ties add TieBreakRequired, TieBreakRequested, TieBreakRandomnessStored and TieBreakResult. Each game has its own weekly schedule, which external settlement or oracle delays can hold up.",
  ],
  [
    "What happens if the oracle is delayed?",
    "Requested and TieBreakRequested can wait indefinitely for their original oracle request. Accepted requests cannot be cancelled or replaced. There is no promised redraw or automatic refund deadline. Permanent nonfulfillment remains an unresolved risk that can lock assets indefinitely.",
  ],
  [
    "Can a round be cancelled or refunded?",
    "An NFT round with no NFT secured before its settlement deadline can cancel only before lottery randomness is requested. Custody review may advance while the round remains Closed; a successful requestDraw transaction alone does not prove a draw was requested. Available prize ETH and held fees become equal per-ticket refunds. Third-party costs and losses mean actual refunds may be less than ticket cost. Late recoveries can increase entitlements.",
  ],
  [
    "How do I claim a prize?",
    "The entitled ticket owner nominates a recipient. ETH winnings and refunds use claimETH. NFT claims come from originating vaults in batches of at most 20 assets. Use an ERC721-compatible recipient; failures are reported per asset and can be retried without undoing successful deliveries. Paused sales do not block valid claims. Purchaser reward queueing is not delivery: wait for the helper’s confirmed Claimed event.",
  ],
  [
    "Who holds the NFTs, and are there exceptions?",
    "Separate round vaults hold secured NFTs. External FWA timeout settlement can force ETH cashout for an NFT round or NFT delivery for an ETH round. Late settlement after NFT cancellation normally takes the ETH bid for refunds. Involuntary shared NFT recoveries require unanimous recipient nomination by every entitled ticket; holdouts can delay delivery indefinitely. Stuck assets are excluded until custody is actually recovered.",
  ],
  [
    "Is this website live?",
    "This is a demo. All jackpots, tickets and results shown here are synthetic. No real tickets are sold, and no transactions are signed or broadcast. Ethereum mainnet is the production target, but deployment addresses remain unset. Wallet connection alone never enables purchases. This website is not a claim of launch readiness, an audit, a license or an endorsement.",
  ],
];
export function FAQ() {
  return (
    <>
      <PageHead
        eyebrow="A clearer view of the world"
        title="A few things to know."
        description="The rules, the rewards, and what happens when the unexpected happens."
      />
      <div className="faq-layout">
        <aside>
          <Globe size="large" />
          <h2>
            Small numbers.
            <br />
            Clear rules.
          </h2>
          <p>Read the details before taking part in any live lottery.</p>
          <a className="inline-link" href="#play">
            Try the demo ↗
          </a>
        </aside>
        <div className="faq-list">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
          <details>
            <summary>Technical proofs & contract references</summary>
            <p>
              Baseline: merged PR #3, ed68e960dc3b9f0847caa637b5d3ea0c082bcfe3.
              Only Won (5), Rolled (6) and Cancelled (7) are terminal; appended
              tie states 8–10 are not. The frontend uses the preserved ABI
              exports.
            </p>
            <p>
              <a
                href="https://github.com/identity-md-launches/launch-961-build-sorphera-smart-contracts/tree/ed68e960dc3b9f0847caa637b5d3ea0c082bcfe3/frontend"
                target="_blank"
                rel="noreferrer"
              >
                Read the contract integration artifacts ↗
              </a>
            </p>
            <p>
              <a
                href="https://github.com/identity-md-launches/launch-961-build-sorphera-smart-contracts/blob/ed68e960dc3b9f0847caa637b5d3ea0c082bcfe3/docs/OPERATIONS.md"
                target="_blank"
                rel="noreferrer"
              >
                Read the custody and operations specification ↗
              </a>
            </p>
          </details>
        </div>
      </div>
      <img
        className="campaign-banner"
        src={asset("sorphera-banner-ice-blue")}
        alt="Sorphera campaign artwork with plush ice-blue lettering and blue and pink globe lottery balls"
        loading="lazy"
        width="1400"
        height="467"
      />
    </>
  );
}
