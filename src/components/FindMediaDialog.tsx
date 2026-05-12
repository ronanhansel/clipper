import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

const compositionFileSuffix = ".composition.ts";

export function FindMediaDialog({
  findMediaRequest,
  onFindCompositionMedia,
  onFindMediaRequestChange,
}: {
  findMediaRequest: { compositionId: string; fileName: string } | null;
  onFindCompositionMedia: (compositionId: string, fileName: string) => void;
  onFindMediaRequestChange?: (
    request: { compositionId: string; fileName: string } | null,
  ) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(stripCompositionFileSuffix(findMediaRequest?.fileName ?? ""));
  }, [findMediaRequest]);

  function submit() {
    const name = stripCompositionFileSuffix(draft.trim());
    if (!findMediaRequest || !name) return;
    onFindCompositionMedia(
      findMediaRequest.compositionId,
      `${name}${compositionFileSuffix}`,
    );
    onFindMediaRequestChange?.(null);
  }

  return (
    <Dialog
      open={Boolean(findMediaRequest)}
      onOpenChange={(open) => {
        if (!open) onFindMediaRequestChange?.(null);
      }}
    >
      <DialogContent className="w-[min(420px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Find media in project</DialogTitle>
          <DialogDescription>
            Search the project folder for the missing composition source by
            filename.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[#2d313b] bg-[#171920] focus-within:border-[var(--clipper-accent)]">
          <Input
            autoFocus
            className="h-9 border-0 bg-transparent focus-visible:ring-0"
            value={draft}
            placeholder="example"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <span className="grid select-none place-items-center border-l border-[#2d313b] bg-[#111319] px-3 text-sm font-bold text-[#7f8490]">
            {compositionFileSuffix}
          </span>
        </div>
        <DialogFooter>
          <button
            className="rounded-lg border border-[#2d313b] px-3 py-2 text-sm font-bold text-[#c7cbd6] transition hover:bg-[#20232c]"
            type="button"
            onClick={() => onFindMediaRequestChange?.(null)}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-[var(--clipper-accent)] px-3 py-2 text-sm font-extrabold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={!draft.trim()}
            onClick={submit}
          >
            Find
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stripCompositionFileSuffix(fileName: string) {
  return fileName.endsWith(compositionFileSuffix)
    ? fileName.slice(0, -compositionFileSuffix.length)
    : fileName;
}
