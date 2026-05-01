import type { RecentProject } from "../app/project/activeProjectManifest";

type WelcomeScreenProps = {
  error: string | null;
  recentProjects: RecentProject[];
  onCreateNewProject: () => void;
  onOpenProject: () => void;
  onOpenRecentProject: (project: RecentProject) => void;
};

export function WelcomeScreen({ error, recentProjects, onCreateNewProject, onOpenProject, onOpenRecentProject }: WelcomeScreenProps) {
  return (
    <main className="grid h-screen place-items-center bg-[#12141a] text-[#dfe2ea]">
      <section className="grid w-[360px] gap-6">
        <div className="grid gap-3 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Clipper</h1>
          {error ? (
            <p className="text-sm text-[#a7adbb]">{error}</p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            className="rounded-xl bg-[var(--clipper-accent)] px-4 py-2.5 text-sm font-bold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)]"
            onClick={onCreateNewProject}
          >
            Create New Project
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#3b4150] bg-[#171920] px-4 py-2.5 text-sm font-bold text-[#f7f7f8] transition hover:border-[#505870] hover:bg-[#20232c]"
            onClick={onOpenProject}
          >
            Open Existing Project
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[#2d313b]" />
              <span className="text-xs text-[#737884]">Recent Projects</span>
              <div className="h-px flex-1 bg-[#2d313b]" />
            </div>
            <div className="grid gap-1">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  type="button"
                  className="rounded-lg px-3 py-2 text-left text-sm text-[#dfe2ea] transition hover:bg-[#1e212a]"
                  onClick={() => onOpenRecentProject(project)}
                >
                  {project.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
