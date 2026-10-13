import { loadEntries, saveEntries } from "./demoStorage";
import { lazy, Suspense, useEffect, useState } from "react";
import { asset, Modal } from "./components";
import { Home, History, FAQ } from "./pages";
import Play from "./Play";
import Tickets, { type ClaimMemory } from "./Tickets";
import { type DemoTicket } from "./fixtures";
import config from "./deployment.json";
import type { Baskets } from "./budget";
import {
  IDENTITIES,
  emptyRecord,
  loadIdentity,
  loadRecord,
  sampleRecord,
  saveIdentity,
  saveRecord,
  type IdentityId,
  type PassportRecord,
} from "./passport";
const DrawRoom = lazy(() => import("./DrawRoom"));
const LiveWorkspace = lazy(() => import("./LiveWorkspace"));
const links = [
  ["home", "Home"],
  ["play", "Play"],
  ["draw", "Draw room"],
  ["tickets", "My tickets"],
  ["history", "History"],
  ["faq", "FAQ"],
];
function route() {
  const [path, query] = (location.hash.slice(1) || "home").split("?");
  return { path, params: new URLSearchParams(query) };
}
export default function App() {
  const [view, setView] = useState(route);
  const [walletInfo, setWalletInfo] = useState(false);
  const [claimMemory, setClaimMemory] = useState<ClaimMemory>({
    results: {},
    claimed: [],
    queued: [],
  });
  const [tickets, setTickets] = useState<DemoTicket[]>(
    () => loadEntries(loadIdentity()).tickets,
  );
  // Separate baskets per game and round survive navigation. Switching views
  // never moves entries between games.
  const [baskets, setBaskets] = useState<Baskets>(
    () => loadEntries(loadIdentity()).baskets,
  );
  const [limit, setLimit] = useState("30");
  // Passport records are isolated per demo identity. Demo wallet A starts
  // with labelled sample history; B starts empty. Switching never transfers
  // progress, tickets or baskets.
  const [identity, setIdentity] = useState<IdentityId>(loadIdentity);
  const [passport, setPassportState] = useState<PassportRecord>(() =>
    loadStored(loadIdentity()),
  );
  function loadStored(id: IdentityId): PassportRecord {
    const stored = loadRecord(id);
    if (stored.purchases.length || stored.redemptions.length) return stored;
    try {
      if (localStorage.getItem(`sorphera.demo.passport.v1:${id}`))
        return emptyRecord();
    } catch {
      // Storage unavailable: fall through to the sample fixture.
    }
    return id === "demo-a" ? sampleRecord() : emptyRecord();
  }
  const setPassport = (record: PassportRecord) => {
    setPassportState(record);
    saveRecord(identity, record);
  };
  function switchIdentity(id: IdentityId) {
    if (id === identity) return;
    saveIdentity(id);
    setIdentity(id);
    setPassportState(loadStored(id));
    const saved = loadEntries(id);
    setTickets(saved.tickets);
    setBaskets(saved.baskets);
    setClaimMemory({ results: {}, claimed: [], queued: [] });
  }
  useEffect(() => {
    saveEntries(identity, tickets, baskets);
  }, [identity, tickets, baskets]);
  useEffect(() => {
    saveRecord(identity, passport);
    // Persist the seeded sample once so the first purchase is not re-seeded.
  }, [identity, passport]);
  useEffect(() => {
    const change = () => {
      setView(route());
      window.scrollTo(0, 0);
      setTimeout(
        () =>
          document
            .querySelector<HTMLElement>("main")
            ?.focus({ preventScroll: true }),
        0,
      );
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = `Sorphera${view.path === "home" ? "" : ` · ${links.find(([p]) => p === view.path)?.[1] ?? "Explore"}`}: ${config.mode === "demo" ? "demo" : "Ethereum mainnet"}`;
  }, [view.path]);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="demo-banner">
        {config.mode === "demo"
          ? "Demo - no real tickets or prizes"
          : "Ethereum mainnet · verified deployment required"}
        <span className="demo-separator">·</span>
        <span className="demo-extra">A little preview of a bigger world</span>
      </div>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="Sorphera home">
          <img
            className="brand-icon"
            src={asset("sorphera-globe-icon-ice-blue")}
            alt=""
            width="40"
            height="40"
          />
          <img
            className="brand-wordmark"
            src={asset("sorphera-wordmark-ice-blue")}
            alt="Sorphera"
            width="138"
            height="46"
          />
        </a>
        <nav aria-label="Main navigation">
          {links.map(([path, label]) => (
            <a
              key={path}
              href={`#${path}`}
              className={view.path === path ? "active" : ""}
              aria-current={view.path === path ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          className="wallet-button"
          onClick={() =>
            config.mode === "demo"
              ? setWalletInfo(true)
              : document.getElementById("live-connect")?.focus()
          }
        >
          <span className="wallet-icon" aria-hidden="true">
            ▱
          </span>{" "}
          Wallet
        </button>
      </header>
      <main id="main-content" className="main" tabIndex={-1}>
        <Suspense
          fallback={
            <p className="loading" role="status">
              Opening your world…
            </p>
          }
        >
          {config.mode !== "demo" ? (
            <LiveWorkspace />
          ) : view.path === "home" ? (
            <Home passport={passport} />
          ) : view.path === "play" ? (
            <Play
              key={`${view.params.get("game")}:${view.params.get("round")}`}
              initialGame={view.params.get("game") === "1" ? 1 : 0}
              initialRound={
                /^\d+$/.test(view.params.get("round") ?? "")
                  ? BigInt(view.params.get("round")!)
                  : undefined
              }
              baskets={baskets}
              onBaskets={setBaskets}
              limit={limit}
              onLimit={setLimit}
              onTickets={(added) => setTickets([...added, ...tickets])}
              passport={passport}
              onPassport={setPassport}
              identity={identity}
            />
          ) : view.path === "draw" ? (
            <DrawRoom
              scenarioId={view.params.get("scenario") ?? undefined}
              game={view.params.get("game") === "1" ? 1 : 0}
              roundId={view.params.get("round") ?? undefined}
              invalidGame={
                view.params.has("game") &&
                !["0", "1"].includes(view.params.get("game")!)
              }
              tickets={tickets}
            />
          ) : view.path === "tickets" ? (
            <Tickets
              tickets={tickets}
              memory={claimMemory}
              onMemory={setClaimMemory}
              passport={passport}
              onPassport={setPassport}
              identityLabel={
                IDENTITIES.find((i) => i.id === identity)?.label ?? identity
              }
            />
          ) : view.path === "history" ? (
            <History />
          ) : view.path === "faq" ? (
            <FAQ />
          ) : (
            <div className="empty-state">
              <h1>This world isn’t here.</h1>
              <a className="button primary" href="#home">
                Return home
              </a>
            </div>
          )}
        </Suspense>
      </main>
      <footer className="footer">
        <div className="footer-top">
          <a href="#home">
            <img
              src={asset("sorphera-wordmark-ice-blue")}
              width="160"
              height="53"
              alt="Sorphera"
            />
          </a>
          <p>A little luck. A whole world of possibility.</p>
          <a href="#faq">The finer details ↗</a>
        </div>
        <div className="footer-bottom">
          <span>Powered by FWA</span>
          <span>
            {config.mode === "demo"
              ? "Demo experience · Synthetic data · No real prizes"
              : "Ethereum mainnet · Deployment verification required"}
          </span>
        </div>
      </footer>
      {walletInfo && (
        <Modal title="A wallet can wait." onClose={() => setWalletInfo(false)}>
          <img
            className="wallet-globe"
            src={asset("sorphera-globe-icon-ice-blue")}
            alt="Sorphera globe icon"
            width="88"
            height="88"
          />
          <p>
            This demo works without a wallet. No transaction can be signed or
            broadcast, and connecting a wallet cannot activate purchases.
          </p>
          <p>
            Ethereum mainnet deployment details are not configured. Live wallet
            actions are unavailable.
          </p>
          <label>
            Demo wallet for passport and tickets
            <select
              value={identity}
              onChange={(e) => switchIdentity(e.target.value as IdentityId)}
            >
              {IDENTITIES.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <p className="fine">
            Passport progress is demo data stored in this browser per demo
            wallet. Switching wallets never transfers stamps or rewards.
          </p>
          <a
            className="button primary full"
            href="#play"
            onClick={() => setWalletInfo(false)}
          >
            Try the demo
          </a>
        </Modal>
      )}
    </>
  );
}
