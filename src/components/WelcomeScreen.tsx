import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import type { RecentProject } from "../app/project/activeProjectManifest";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";

type WelcomeScreenProps = {
  error: string | null;
  recentProjects: RecentProject[];
  onCreateNewProject: (name: string) => Promise<boolean> | boolean;
  onDeleteRecentProject: (project: RecentProject) => void;
  onOpenProject: () => void;
  onOpenRecentProject: (project: RecentProject) => void;
};

export function WelcomeScreen({ error, recentProjects, onCreateNewProject, onDeleteRecentProject, onOpenProject, onOpenRecentProject }: WelcomeScreenProps) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const nameError = validateProjectName(newProjectName);

  useEffect(() => {
    if (isCreatingProject) {
      setNewProjectName("");
      setIsSubmitting(false);
      setTimeout(() => newProjectInputRef.current?.focus(), 50);
    }
  }, [isCreatingProject]);

  async function submitCreateProject() {
    if (newProjectName && !nameError && !isSubmitting) {
      setIsSubmitting(true);
      const success = await onCreateNewProject(newProjectName);
      setIsSubmitting(false);
      if (success) {
        setIsCreatingProject(false);
      }
    }
  }

  async function handleCreateProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitCreateProject();
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (newProjectName && !nameError && !isSubmitting) {
        e.preventDefault();
        submitCreateProject();
      }
    }
  }

  function handleDeleteProject(e: React.MouseEvent, project: RecentProject) {
    e.stopPropagation();
    if (window.confirm(`Delete "${project.name}"? The project files will be moved to the Bin.`)) {
      onDeleteRecentProject(project);
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
                <div key={project.path} className="group relative">
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#dfe2ea] transition hover:bg-[#1e212a]"
                    onClick={() => onOpenRecentProject(project)}
                  >
                    {project.name}
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 top-1.5 opacity-0 transition group-hover:opacity-100 hover:text-red-400 p-1"
                    title="Delete project"
                    aria-label="Delete project"
                    onClick={(e) => handleDeleteProject(e, project)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
                  onKeyDown={handleInputKeyDown}
                  placeholder="My Awesome Video"
                  className={nameError && newProjectName ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {nameError && newProjectName && (
                  <p className="text-xs text-red-500">{nameError}</p>
                )}
                {error && !nameError && (
                  <p className="text-xs text-red-500">{error}</p>
                )}
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
                disabled={!newProjectName.trim() || !!nameError || isSubmitting}
                className="rounded-md bg-[var(--clipper-accent)] px-3 py-2 text-sm font-medium text-[var(--clipper-accent-foreground)] disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create Project"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function validateProjectName(name: string): string | null {
  if (!name) return "Project name cannot be empty.";
  if (/^\s|\s$/.test(name)) return "Name cannot start or end with whitespace.";
  
  if (name === "." || name === "..") return "Invalid project name.";
  if (/[\x00-\x1F]/.test(name)) return "Name cannot contain control characters.";
  if (/[<>:"\/\\|?*]/.test(name)) return 'Name cannot contain < > : " / \\ | ? *';
  
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reserved.test(name)) return `"${name}" is a reserved system name.`;
  
  if (name.endsWith(".")) return "Name cannot end with a dot.";
  
  return null;
}
