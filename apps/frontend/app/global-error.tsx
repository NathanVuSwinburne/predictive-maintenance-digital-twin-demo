"use client";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { toUserFacingError } from "@/lib/errors/user-facing-error";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center p-6">
          <ErrorNotice
            error={toUserFacingError(null, "runtime.page")}
            actionLabel="Try Again"
            onAction={reset}
            className="w-full"
          />
        </main>
      </body>
    </html>
  );
}
