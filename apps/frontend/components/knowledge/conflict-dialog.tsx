"use client";

import { WarningIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { KnowledgeNoteDetail } from "@/lib/domain/types";

export type SaveConflict = {
  path: string;
  mine: string;
  theirs: KnowledgeNoteDetail;
};

/**
 * Shown when a save is rejected with a 409. The other writer is usually the
 * agent saving what it just learned, so the user needs to see both versions
 * before deciding — silently keeping either one loses real work.
 */
export function ConflictDialog({
  conflict,
  onKeepMine,
  onTakeTheirs,
  onCancel,
}: {
  conflict: SaveConflict | null;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onCancel: () => void;
}) {
  if (!conflict) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            <WarningIcon className="mr-1 inline" />
            This page changed while you were editing it
          </DialogTitle>
          <DialogDescription className="text-sm">
            Most likely the assistant wrote something it just learned. Nothing has been
            overwritten — {conflict.path} is still showing their version. Choose which one to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Your edit</p>
            <pre className="h-72 overflow-auto border border-border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
              {conflict.mine}
            </pre>
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              On disk now
              {conflict.theirs.updatedBy ? ` — written by ${conflict.theirs.updatedBy}` : ""}
            </p>
            <pre className="h-72 overflow-auto border border-border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
              {conflict.theirs.content}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" onClick={onTakeTheirs}>
            Take theirs
          </Button>
          <Button size="sm" onClick={onKeepMine}>
            Keep mine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
