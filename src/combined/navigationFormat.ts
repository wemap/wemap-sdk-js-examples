/**
 * Pure formatting helpers for the VPS navigation sample.
 *
 * Kept free of DOM and SDK instances so the wording/iconography rules that the
 * UI depends on can be unit tested (`navigationFormat.spec.ts`).
 */
import type { LocationState } from '@wemap/positioning';
import type { Coordinates, Step } from '@wemap/routing';
import type { IconName } from './icons';

/** The parts of an `Itinerary` {@link stepDistances} reads. */
export type StepDistanceInput = {
  coords: ReadonlyArray<Coordinates>;
  steps: ReadonlyArray<Step>;
};

/**
 * Cumulative distance **along the route** at each manoeuvre, measured from the
 * itinerary's origin — the same origin as `ItineraryInfoManager`'s
 * `traveledDistance`, so subtracting one from the other gives the metres left
 * to walk before the turn.
 *
 * Built once per itinerary: a straight line to the next step would read short
 * exactly where it matters, at a corner the user has to walk around.
 */
export function stepDistances(itinerary: StepDistanceInput): Map<Step, number> {
  const table = new Map<Step, number>();
  const pending = [...itinerary.steps];
  let cumulative = 0;
  let next = pending.shift();

  itinerary.coords.forEach((coords, index, all) => {
    if (index > 0) {
      cumulative += all[index - 1].distanceTo(coords);
    }

    while (next && next.coords.equals(coords)) {
      table.set(next, cumulative);
      next = pending.shift();
    }
  });

  return table;
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) {
    return '—';
  }
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** Walking time for a remaining distance, at the router's own 1.4 m/s pace. */
export function formatWalkingTime(metres: number): string {
  if (!Number.isFinite(metres)) {
    return '—';
  }
  return `${Math.max(1, Math.round(metres / 1.4 / 60))} min`;
}

const DIRECTION_LABELS: Record<string, { icon: IconName; text: string }> = {
  straight: { icon: 'arrow-up', text: 'Continue straight' },
  right: { icon: 'corner-up-right', text: 'Turn right' },
  'slight-right': { icon: 'arrow-up-right', text: 'Bear right' },
  'sharp-right': { icon: 'corner-up-right', text: 'Sharp right' },
  left: { icon: 'corner-up-left', text: 'Turn left' },
  'slight-left': { icon: 'arrow-up-left', text: 'Bear left' },
  'sharp-left': { icon: 'corner-up-left', text: 'Sharp left' },
  'u-turn': { icon: 'u-turn', text: 'Make a U-turn' },
  up: { icon: 'chevrons-up', text: 'Go up' },
  down: { icon: 'chevrons-down', text: 'Go down' },
};

const TYPE_LABELS: Record<string, string> = {
  stairs: 'the stairs',
  elevator: 'the elevator',
  escalator: 'the escalator',
  'incline-plane': 'the ramp',
  'moving-walkway': 'the moving walkway',
  entrance: 'the entrance',
  exit: 'the exit',
  gate: 'the gate',
  turnstile: 'the turnstile',
  'subway-entrance': 'the subway entrance',
};

export type Instruction = { icon: IconName; text: string };

/**
 * Turn the routing `Step` shape into a one-line instruction.
 *
 * Vertical steps (stairs, elevator…) read "Take the stairs up to level 2";
 * horizontal ones read "Turn right onto <name>".
 */
export function stepInstruction(step: Step | null): Instruction {
  if (!step) {
    return { icon: 'flag', text: 'Head to your destination' };
  }

  if (step.lastStep) {
    return { icon: 'flag', text: 'Arrive at your destination' };
  }

  const vertical = step.direction === 'up' || step.direction === 'down';
  const place = step.type ? TYPE_LABELS[step.type] : undefined;

  if (vertical && place) {
    const level =
      step.destinationLevel !== null && step.destinationLevel !== undefined
        ? ` to level ${step.destinationLevel}`
        : '';
    return {
      icon: step.direction === 'up' ? 'chevrons-up' : 'chevrons-down',
      text: `Take ${place} ${step.direction}${level}`,
    };
  }

  const base = (step.direction && DIRECTION_LABELS[step.direction]) ?? {
    icon: 'arrow-up' as IconName,
    text: 'Continue',
  };

  if (step.name) {
    return { ...base, text: `${base.text} onto ${step.name}` };
  }
  if (place && !vertical) {
    return { ...base, text: `${base.text} at ${place}` };
  }

  return base;
}

export type LocationStateDescriptor = {
  /** `data-location-state` value driving the map + pill styling. */
  tone: LocationState;
  label: string;
  hint: string;
  /** Whether the UI should push the user towards a new scan. */
  suggestScan: boolean;
};

export function describeLocationState(state: LocationState): LocationStateDescriptor {
  switch (state) {
    case 'accurate':
      return {
        tone: 'accurate',
        label: 'Accurate position',
        hint: 'Visual positioning is up to date.',
        suggestScan: false,
      };
    case 'degraded':
      return {
        tone: 'degraded',
        label: 'Approximate position',
        hint: "You've walked a while since the last scan — rescan to sharpen your position.",
        suggestScan: true,
      };
    default:
      return {
        tone: 'no_positioning',
        label: 'Position lost',
        hint: 'We can no longer trust your position. Rescan your surroundings to keep guiding you.',
        suggestScan: true,
      };
  }
}
