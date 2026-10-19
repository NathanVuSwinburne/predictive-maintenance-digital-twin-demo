import {
  ArrowsClockwiseIcon,
  ClockCountdownIcon,
  HourglassIcon,
  PlugsIcon,
  PulseIcon,
  type Icon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { liveStatePresentation } from "@/lib/domain/presentation";
import type { EntityLiveState } from "@/lib/domain/types";

const liveStateIcons: Record<EntityLiveState, Icon> = {
  live: PulseIcon,
  stale: ClockCountdownIcon,
  reconnecting: ArrowsClockwiseIcon,
  disconnected: PlugsIcon,
  waiting: HourglassIcon,
  "no-source": PlugsIcon,
};

type LiveStateBadgeProps = {
  state: EntityLiveState;
  /** Optional text shown instead of the standard state label (e.g. "MQTT · Live"). */
  label?: string;
  className?: string;
};

/** Icon + text + semantic colour for an MQTT feed state, so colour is never the only cue. */
export function LiveStateBadge({ state, label, className }: LiveStateBadgeProps) {
  const presentation = liveStatePresentation[state];
  const StateIcon = liveStateIcons[state];
  return (
    <Badge variant={presentation.variant} className={className} data-live-state={state}>
      <StateIcon data-icon="inline-start" aria-hidden="true" />
      {label ?? presentation.label}
    </Badge>
  );
}
