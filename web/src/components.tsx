import { useEffect, useRef, type ReactNode } from "react";
import type { Pick } from "./core";
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
      <img src={asset(`${kind}-ball`)} alt="" draggable="false" />
      {number !== undefined && (
        <span className="number-badge">
          {typeof number === "number"
            ? String(number).padStart(2, "0")
            : number}
        </span>
      )}
    </span>
  );
}
export function Balls({
  pick,
  size = "small",
}: {
  pick: Pick;
  size?: "small" | "normal" | "large";
}) {
  return (
    <div
      className="balls"
      role="img"
      aria-label={`Main numbers ${pick.main.join(", ")}. Bonus ${pick.bonus}.`}
    >
      {pick.main.map((n) => (
        <Globe key={n} number={n} size={size} />
      ))}
      <span className="bonus-plus" aria-hidden="true">
        +
      </span>
      <Globe number={pick.bonus} kind="nft" size={size} />
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
