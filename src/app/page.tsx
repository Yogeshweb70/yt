import Link from "next/link";

const phases = [
  { name: "Foundation", status: "in progress" },
  { name: "Auth & data layer", status: "not started" },
  { name: "Content pipeline", status: "not started" },
  { name: "Publish & schedule", status: "not started" },
  { name: "Analytics & feedback", status: "not started" },
  { name: "Admin dashboard", status: "not started" },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">AI Shorts Studio</h1>
        <p className="text-muted">
          Automated YouTube Shorts generation and publishing. Foundation is up —
          see <code>CONTINUE.md</code> for the roadmap.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Build phases</h2>
        <ul className="flex flex-col gap-2">
          {phases.map((p) => (
            <li
              key={p.name}
              className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3"
            >
              <span>{p.name}</span>
              <span className="text-sm text-muted">{p.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/dashboard" className="text-primary underline">
        Go to admin dashboard →
      </Link>
    </main>
  );
}
