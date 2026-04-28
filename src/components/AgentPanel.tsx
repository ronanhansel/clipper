import { sectionTitle } from "../app/config";
import type { Part } from "../core/types";

export function AgentPanel({ part, sourceStatus, agentContext }: { part: Part; sourceStatus: string; agentContext: unknown }) {
  return <div className="grid gap-4"><section className="grid gap-2.5"><h2 className={sectionTitle}>Snapshot</h2>{part.snapshot.map((line) => <div className="grid grid-cols-[48px_1fr] gap-2.5 rounded-[11px] border border-[#2d313b] bg-[#1a1d26] p-2.5 text-xs" key={`${part.id}-${line.at}`}><strong className="text-[var(--clipper-accent)] tabular-nums">{line.at}</strong><span className="text-[#cfd2db]">{line.description}</span></div>)}</section><section className="grid gap-2.5"><h2 className={sectionTitle}>Agent Context</h2><div className="rounded-xl border border-[#2d313b] bg-[#151821] p-3 text-xs text-[#9b9da7]">{sourceStatus}</div><pre className="m-0 max-h-[260px] overflow-auto rounded-xl border border-[#2d313b] bg-[#151821] p-3 text-[11px] leading-normal text-[var(--clipper-accent)]">{JSON.stringify(agentContext, null, 2)}</pre></section></div>;
}
