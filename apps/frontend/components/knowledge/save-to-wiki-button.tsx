"use client";

import { useState } from "react";
import {
  BookmarkSimpleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDataProvider } from "@/hooks/use-data-provider";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

const SAVED_MESSAGE_KEY = "chat_knowledge_saved_messages";

type SavedMessage = {
  path: string;
  id: string;
};

function readSavedMessage(messageId: string): SavedMessage | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(SAVED_MESSAGE_KEY) ?? "{}",
    ) as Record<string, SavedMessage>;
    return saved[messageId] ?? null;
  } catch {
    return null;
  }
}

function rememberSavedMessage(messageId: string, saved: SavedMessage): void {
  try {
    const current = JSON.parse(
      window.localStorage.getItem(SAVED_MESSAGE_KEY) ?? "{}",
    ) as Record<string, SavedMessage>;
    current[messageId] = saved;
    window.localStorage.setItem(SAVED_MESSAGE_KEY, JSON.stringify(current));
  } catch {
    // A storage failure should not prevent the note from being saved.
  }
}

const NAMESPACES = [
  {
    value: "fleet",
    label: "Machine & Fleet",
    description: "Machine behaviour, incidents, and operating insights",
  },
  {
    value: "domain",
    label: "Engineering Guidance",
    description: "Reusable maintenance and engineering knowledge",
  },
  {
    value: "concepts",
    label: "Model & Evaluation Notes",
    description: "How models, tests, and evaluation should work",
  },
  {
    value: "sources",
    label: "Reference Source",
    description: "Information taken from an external document",
  },
];

/**
 * Files an assistant answer into the wiki.
 *
 * The point of the vault is that a good answer is written down once rather than
 * re-derived. Capturing appends under a heading when the page already exists, so
 * three conversations about the same machine build one page instead of three.
 */
export function SaveToWikiButton({
  messageId,
  text,
}: {
  messageId: string;
  text: string;
}) {
  const provider = useDataProvider();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [namespace, setNamespace] = useState("fleet");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(
    () => readSavedMessage(messageId)?.path ?? null,
  );
  const [savedId, setSavedId] = useState<string | null>(
    () => readSavedMessage(messageId)?.id ?? null,
  );
  const [saveError, setSaveError] = useState<UserFacingError | null>(null);
  const selectedCategory =
    NAMESPACES.find((option) => option.value === namespace) ?? NAMESPACES[0];

  if (!text.trim()) {
    return null;
  }

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const note = await provider.captureToKnowledge({
        title: title.trim(),
        content: text,
        namespace,
        reason: reason.trim() || undefined,
      });
      setSavedPath(note.path);
      setSavedId(note.id);
      rememberSavedMessage(messageId, { path: note.path, id: note.id });
      toast.success(
        "Saved to the Knowledge Base. The AI Assistant can use it on its next turn.",
      );
    } catch (error) {
      setSaveError(toUserFacingError(error, "data.save", {
        title: "This answer could not be saved to the Knowledge Base",
        message: "Review the page details and try again. Your answer is still in this dialog.",
      }));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {savedPath ? (
        <Button
          asChild
          size="xs"
          variant="ghost"
          className="self-start text-success hover:text-success"
        >
          <Link href={`/knowledge?note=${encodeURIComponent(savedId ?? "")}`}>
            <CheckCircleIcon weight="fill" /> Saved to Knowledge Base
          </Link>
        </Button>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          className="self-start text-muted-foreground"
          onClick={() => {
            setTitle("");
            setNamespace("fleet");
            setReason("");
            setSaveError(null);
            setOpen(true);
          }}
        >
          <BookmarkSimpleIcon /> Save to Knowledge Base
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-5">
          <DialogHeader>
            <DialogTitle>Save to Knowledge Base</DialogTitle>
            <DialogDescription className="text-sm">
              Keep a useful finding so the AI Assistant and your team can refer
              to it in future investigations.
            </DialogDescription>
          </DialogHeader>

          {savedPath ? (
            <div className="flex gap-3 border border-border bg-muted/30 p-4">
              <CheckCircleIcon
                className="mt-0.5 size-5 shrink-0 text-success"
                weight="fill"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium">Insight saved</p>
                <p className="text-sm text-muted-foreground">
                  The AI Assistant can use it in future conversations.
                </p>
                <Link
                  href={`/knowledge?note=${encodeURIComponent(savedId ?? "")}`}
                  className="inline-block text-sm font-medium text-primary underline underline-offset-2"
                >
                  Open in Knowledge
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              {saveError ? <ErrorNotice error={saveError} /> : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="knowledge-capture-title">Title</Label>
                <Input
                  id="knowledge-capture-title"
                  placeholder="e.g. Machine C bearing inspection"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Use a short title your team will recognise later.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="knowledge-capture-category">Category</Label>
                <Select value={namespace} onValueChange={setNamespace}>
                  <SelectTrigger
                    id="knowledge-capture-category"
                    className="h-auto min-h-10 w-full py-2 text-sm"
                  >
                    <SelectValue>{selectedCategory.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="p-1.5">
                    {NAMESPACES.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        textValue={option.label}
                        className="min-h-14 py-3 pr-10 pl-3"
                      >
                        <span className="flex flex-col items-start gap-1 pr-4">
                          <span>{option.label}</span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="knowledge-capture-reason">
                  Why should this be kept? <span className="font-normal text-muted-foreground">(Optional)</span>
                </Label>
                <Textarea
                  id="knowledge-capture-reason"
                  className="min-h-16"
                  placeholder="e.g. Confirmed during the 19 September inspection"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This helps future readers understand why the insight was saved.
                </p>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-3 border border-border bg-muted/30 p-4">
                <InfoIcon
                  className="mt-0.5 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">
                    Check before using as guidance
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Saving makes this AI-generated answer available in future
                    conversations. It does not confirm that the information is
                    correct, so review it before relying on it.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {savedPath ? "Close" : "Cancel"}
            </Button>
            {!savedPath && (
              <Button size="sm" disabled={!title.trim() || isSaving} onClick={() => void save()}>
                {isSaving ? "Saving…" : "Save Insight"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
