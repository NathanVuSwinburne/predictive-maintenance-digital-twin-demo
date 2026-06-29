import type { SimulationSessionOption } from "@/lib/domain/types";

export function SimulationSessionMetadata({ session }: { session: SimulationSessionOption }) {
  const hours = Math.floor(session.durationMinutes / 60);
  const minutes = session.durationMinutes % 60;
  const gapDays = session.gapFromPreviousMinutes ? Math.round(session.gapFromPreviousMinutes / 1440) : null;
  const provenance = session.provenance === "curated-observed-fixture" ? "Observed client-derived fixture" : session.provenance === "observed" ? "Observed" : "Synthetic forecast";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">Selected session</p><p className="font-medium">Session {session.sessionId}</p></div>
      <div><p className="text-xs text-muted-foreground">Collection range</p><p className="font-medium">{session.start} – {session.end}</p></div>
      <div><p className="text-xs text-muted-foreground">Duration</p><p className="font-medium">{hours} h {minutes} min</p></div>
      {session.sampleIntervalMs != null && <div><p className="text-xs text-muted-foreground">Cadence</p><p className="font-medium">{session.sampleIntervalMs} ms source cadence</p></div>}
      {gapDays != null && <div><p className="text-xs text-muted-foreground">Previous capture</p><p className="font-medium">{gapDays} day gap</p></div>}
      {session.provenance && <div><p className="text-xs text-muted-foreground">Provenance</p><p className="font-medium">{provenance}</p></div>}
    </div>
  );
}
