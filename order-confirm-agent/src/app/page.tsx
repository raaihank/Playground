import Link from "next/link";

export default function Home() {
  return (
    <div className="home">
      <h1>
        Order<span style={{ color: "var(--accent)" }}>·</span>Confirmation<span style={{ color: "var(--accent)" }}>·</span>Agent
      </h1>
      <p>
        A cash-on-delivery confirmation call — as a simulator. Real speech, real
        Claude, real order changes. Your mic stands in for the customer&apos;s
        phone.
      </p>
      <div className="cta">
        <Link className="btn" href="/setup">
          Settings
        </Link>
        <Link className="btn btn-primary" href="/agentic-call">
          Start call
        </Link>
      </div>
    </div>
  );
}
