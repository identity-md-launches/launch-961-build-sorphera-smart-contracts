import { lazy, Suspense, useEffect, useState } from "react";
import { asset, Modal } from "./components";
import { Home, History, FAQ } from "./pages";
import Play from "./Play";
import Tickets, { type ClaimMemory } from "./Tickets";
import { initialTickets, type DemoTicket } from "./fixtures";
import config from "./deployment.json";
import type { Baskets } from "./budget";
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
  const [tickets, setTickets] = useState<DemoTicket[]>(initialTickets);
  // Separate baskets per game and round survive navigation. Switching views
  // never moves entries between games.
  const [baskets, setBaskets] = useState<Baskets>({});
  const [limit, setLimit] = useState("30");
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
    document.title = `Sorphera${view.path === "home" ? "" : ` · ${links.find(([p]) => p === view.path)?.[1] ?? "Explore"}`} — ${config.mode === "demo" ? "Demo" : "Ethereum mainnet"}`;
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
            <Home />
          ) : view.path === "play" ? (
            <Play
              key={view.params.get("game")}
              initialGame={view.params.get("game") === "1" ? 1 : 0}
              baskets={baskets}
              onBaskets={setBaskets}
              limit={limit}
              onLimit={setLimit}
              onTickets={(added) => setTickets([...added, ...tickets])}
            />
          ) : view.path === "draw" ? (
            <DrawRoom
              scenarioId={view.params.get("scenario") ?? undefined}
              tickets={tickets}
            />
          ) : view.path === "tickets" ? (
            <Tickets
              tickets={tickets}
              memory={claimMemory}
              onMemory={setClaimMemory}
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
          <span>
            Weekly ETH &amp; NFT lottery ball jackpots. Powered by FWA.
          </span>
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
