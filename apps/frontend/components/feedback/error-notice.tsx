import { WarningCircleIcon } from "@phosphor-icons/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { UserFacingError } from "@/lib/errors/user-facing-error";
import { cn } from "@/lib/utils";

type ErrorNoticeProps = {
  error: UserFacingError;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function ErrorNotice({
  error,
  actionLabel,
  onAction,
  className,
}: ErrorNoticeProps) {
  return (
    <Alert
      variant="destructive"
      aria-live="polite"
      className={cn("break-words px-2.5 py-2 text-xs", className)}
    >
      <WarningCircleIcon aria-hidden="true" />
      <AlertTitle className="text-xs font-medium">{error.title}</AlertTitle>
      <AlertDescription className="space-y-2 text-xs">
        <p>{error.message}</p>
        {actionLabel && onAction ? (
          <Button type="button" variant="outline" size="xs" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
