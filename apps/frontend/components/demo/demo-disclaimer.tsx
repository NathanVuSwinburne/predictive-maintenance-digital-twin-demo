import { InfoIcon } from "@phosphor-icons/react/dist/ssr";

export function DemoDisclaimer() {
  return (
    <aside className="border-b border-primary/15 bg-primary/[0.055] px-4 py-2.5 text-xs leading-5 text-foreground/80 backdrop-blur-sm" aria-label="Portfolio demo data notice">
      <div className="mx-auto flex max-w-screen-2xl items-start gap-2.5">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"><InfoIcon className="size-3.5" aria-hidden="true" /></span>
        <p><strong className="font-semibold text-foreground">Portfolio simulation:</strong> All displayed live metrics are simulated. Machine A’s model foundation uses the public AI4I dataset. Machine C’s public demonstration uses synthetic/sanitized data.</p>
      </div>
    </aside>
  );
}
