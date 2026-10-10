import { useEffect, useRef, type ReactNode } from "react";
import type { Pick } from "./core";
import PlushGlobe from "./PlushGlobe";
export const asset = (name: string) =>
  `${import.meta.env.BASE_URL}brand/${name}.webp`;
export function Globe({
  number,
  kind = "eth",
  size = "normal",
}: {
  number?: number | string;
  kind?: "eth" | "nft";
  size?: "small" | "normal" | "large";
}) {
  return (
    <span className={`globe globe-${kind} globe-${size}`} aria-hidden="true">
      <PlushGlobe kind={kind} number={number} />
    </span>
  );
}
export function Balls({
  pick,
  size = "small",
  hits,
}: {
  pick: Pick;
  size?: "small" | "normal" | "large";
  /** Numbers already matched by revealed balls, for highlighting. */
  hits?: { main: number[]; bonus: boolean };
}) {
  const hitCount = hits ? hits.main.length + (hits.bonus ? 1 : 0) : 0;
  return (
    <div
      className="balls"
      role="img"
      aria-label={`Main numbers ${pick.main.join(", ")}. Bonus ${pick.bonus}.${
        hits ? ` ${hitCount} matched.` : ""
      }`}
    >
      {pick.main.map((n) => (
        <span key={n} className={hits?.main.includes(n) ? "hit" : ""}>
          <Globe number={n} size={size} />
        </span>
      ))}
      <span className="bonus-plus" aria-hidden="true">
        +
      </span>
      <span className={hits?.bonus ? "hit" : ""}>
        <Globe number={pick.bonus} kind="nft" size={size} />
      </span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
          ) ?? [],
        ).filter(
          (node) =>
            node.getClientRects().length > 0 &&
            (node.checkVisibility
              ? node.checkVisibility()
              : !node.closest("details:not([open])") ||
                node.tagName === "SUMMARY"),
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-top">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
