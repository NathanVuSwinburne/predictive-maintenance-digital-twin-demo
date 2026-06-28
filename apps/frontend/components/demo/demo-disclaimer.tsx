import { InfoIcon } from "@phosphor-icons/react/dist/ssr";

export function DemoDisclaimer() {
  return (
    <aside className="border-b border-amber-300/30 bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100" aria-label="Portfolio demo data notice">
      <div className="mx-auto flex max-w-screen-2xl items-start gap-2">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p><strong>Portfolio demo:</strong> All displayed live metrics are simulated. Machine A’s model foundation uses the public AI4I dataset. Machine C’s public demonstration uses synthetic/sanitized data.</p>
      </div>
    </aside>
  );
}
