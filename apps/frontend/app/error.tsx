"use client";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { toUserFacingError } from "@/lib/errors/user-facing-error";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center p-6">
      <ErrorNotice
        error={toUserFacingError(null, "runtime.page")}
        actionLabel="Try Again"
        onAction={reset}
        className="w-full"
      />
    </main>
  );
}
