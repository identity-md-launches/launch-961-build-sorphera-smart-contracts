import { Balls, Globe, PageHead } from "./components";
import {
  allScenarios,
  demoRound,
  demoRounds,
  selectDemoRound,
  type DemoTicket,
} from "./fixtures";
import { type Game, type Round } from "./core";
import { CalendarActions, RoundSchedule, useNow } from "./RoundSchedule";
import { drawLink, entriesOpen } from "./schedule";
import { gameName } from "./Play";

export default function UpcomingDraw({
  game,
  roundId,
  tickets,
}: {
  game: Game;
  roundId?: string;
  tickets: DemoTicket[];
}) {
  const now = useNow();
  const parsed =
    roundId === undefined
      ? demoRounds[game].id
      : /^\d+$/.test(roundId)
        ? BigInt(roundId)
        : undefined;
  const saved = tickets.find(
    (t) => t.game === game && t.round === parsed && t.source === "mine",
  );
  let round: Round | undefined =
    parsed === undefined
      ? undefined
      : parsed === demoRounds[game].id
        ? demoRounds[game]
        : demoRound(game, parsed);
  if (saved?.schedule && round) round = { ...round, ...saved.schedule };
  const legacy = saved && !saved.schedule;
  if (legacy) round = undefined;
  const samples = allScenarios.filter((s) => s.game === game);
  const mine = tickets.filter(
    (t) => t.source === "mine" && t.game === game && t.round === parsed,
  );
  return (
    <>
      <PageHead
        eyebrow="The draw room"
        title="Your next little possibility."
        description="Follow your round from ticket sales to confirmed numbers."
      />
      <nav className="game-switch" aria-label="Upcoming jackpot">
        {([0, 1] as const).map((g) => (
          <a
            className={g === game ? "active" : ""}
            aria-current={g === game ? "page" : undefined}
            key={g}
            href={drawLink(g, demoRounds[g].id)}
          >
            {gameName(g)}
          </a>
        ))}
      </nav>
      <section className="upcoming-draw" aria-labelledby="upcoming-title">
        <div className="upcoming-heading">
          <div>
            <h2 id="upcoming-title">
              {gameName(game)} · Round {parsed?.toString() ?? roundId}
            </h2>
            <p className="fine">Demo - no real tickets or prizes</p>
          </div>
          <Globe size="large" kind={game === 0 ? "eth" : "nft"} />
        </div>
        {round ? (
          <>
            <RoundSchedule round={round} priority />
            <p className="fine">
              Simulated schedule: sales close Sunday at{" "}
              {game === 0 ? "00:00" : "01:00"} UTC. The draw window opens 30
              minutes later. This gap is illustrative, not production policy.
              Times above are in your local time zone.
            </p>
            <p className="fine">
              No confirmed result is available for this round. FWA
              reconciliation must finish before randomness can be requested,
              fulfilled and finalized. NFT ties may require another request.
            </p>
            <CalendarActions round={round} />
            {entriesOpen(round, now) && (
              <a
                className="button primary"
                href={`#play?game=${game}`}
                onClick={() => selectDemoRound(game, round!.id)}
              >
                Make your picks
              </a>
            )}
            {now >= round.cutoff && (
              <a
                className="button"
                href={drawLink(game, round.id + 1n)}
                onClick={() => selectDemoRound(game, round!.id + 1n)}
              >
                Explore next simulated round
              </a>
            )}
          </>
        ) : (
          <p className="notice">
            {legacy
              ? "This older ticket has no saved schedule. Its original record is preserved; no replacement deadline or result has been assigned."
              : "Schedule unavailable for this exact round. No result has been supplied."}
          </p>
        )}
      </section>
      <section className="my-results">
        <h2>Your tickets in this round</h2>
        {mine.length ? (
          <ul className="result-tickets">
            {mine.map((t) => (
              <li className="result-ticket" key={t.id}>
                <span className="fine">
                  {t.reward ? "Your reward ticket" : "Your demo entry"}
                </span>
                <Balls pick={t.pick} />
                <span>Waiting for a confirmed outcome</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No saved entries for this game and round.</p>
        )}
      </section>
      <section className="sample-replays">
        <h2>Sample replays & simulations</h2>
        <p className="fine">
          These separate fixtures demonstrate the reveal. They do not advance
          your round or determine your ticket’s result.
        </p>
        <div className="replay-links">
          {(samples.length
            ? samples
            : allScenarios.filter((s) => !s.simulated)
          ).map((s) => (
            <a className="button" key={s.id} href={`#draw?scenario=${s.id}`}>
              {s.simulated ? "Simulation preview" : "Sample replay"} · {s.label}
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
