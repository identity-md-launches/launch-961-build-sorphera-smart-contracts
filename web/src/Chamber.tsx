import { Globe } from "./components";
export default function Chamber({
  active,
  reduced,
}: {
  active: boolean;
  reduced: boolean;
}) {
  return (
    <div
      className={`chamber ${active && !reduced ? "chamber-active" : ""}`}
      aria-hidden="true"
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="chamber-globe cg-one">
        <Globe size="large" />
      </div>
      <div className="chamber-globe cg-two">
        <Globe size="large" kind="nft" />
      </div>
      <div className="chamber-globe cg-three">
        <Globe size="large" />
      </div>
      <div className="chamber-globe cg-four">
        <Globe size="large" />
      </div>
      <span className="chamber-caption">A WORLD OF POSSIBILITY</span>
    </div>
  );
}
