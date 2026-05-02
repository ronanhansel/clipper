import { useState, useRef, useEffect } from "react";
import type { RecentProject } from "../app/project/activeProjectManifest";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";

type WelcomeScreenProps = {
  error: string | null;
  recentProjects: RecentProject[];
  onCreateNewProject: (name: string) => void;
  onOpenProject: () => void;
  onOpenRecentProject: (project: RecentProject) => void;
};

export function WelcomeScreen({ error, recentProjects, onCreateNewProject, onOpenProject, onOpenRecentProject }: WelcomeScreenProps) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingProject) {
      setNewProjectName("");
      setTimeout(() => newProjectInputRef.current?.focus(), 50);
    }
  }, [isCreatingProject]);

  function handleCreateProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newProjectName.trim()) {
      onCreateNewProject(newProjectName.trim());
      setIsCreatingProject(false);
    }
  }
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
            onClick={() => setIsCreatingProject(true)}
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

      <Dialog open={isCreatingProject} onOpenChange={setIsCreatingProject}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateProjectSubmit}>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="projectName" className="text-sm font-medium">
                  Project Name
                </label>
                <Input
                  id="projectName"
                  ref={newProjectInputRef}
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Awesome Video"
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10"
                onClick={() => setIsCreatingProject(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newProjectName.trim()}
                className="rounded-md bg-[var(--clipper-accent)] px-3 py-2 text-sm font-medium text-[var(--clipper-accent-foreground)] disabled:opacity-50"
              >
                Create Project
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
