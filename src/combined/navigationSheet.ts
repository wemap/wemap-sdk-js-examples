/**
 * The bottom sheet of the VPS sample app — screens 1 to 5 of `debug-design.pen`.
 *
 * It owns every piece of guidance the user reads — what to do next, where they
 * are going, how far is left — as one state machine rendered from a view model,
 * so `combined.ts` stays SDK wiring and never touches markup.
 *
 * Buttons are wired once through delegation (`data-action`), so a re-render
 * never has to re-bind anything. The location-state pill is *not* here: the
 * design floats it over the map (see `statusPill.ts`).
 */
import type { Instruction } from './navigationFormat';
import { formatDistance, formatWalkingTime } from './navigationFormat';
import { icon } from './icons';

export type LevelOption = { value: number | null; label: string };

export type DestinationView = {
  name: string;
  detail: string;
  level: number | null;
  /**
   * Whether the user may override the level. A pinpoint already carries its
   * own, so the card shows it as a read-only chip; a dropped pin has nothing
   * but the floor the map is showing, so it gets the floor field.
   */
  levelEditable: boolean;
  /** Floors offered by the active building; empty falls back to a number input. */
  levelOptions: LevelOption[];
};

export type NavigationView = {
  instruction: Instruction;
  /** Metres to the next manoeuvre, or null when the fix is untrustworthy. */
  distanceToStep: number | null;
  remainingDistance: number;
  progress: number;
  arrived: boolean;
  /** Destination name, for the "to Gate B12" footer line. */
  destinationName: string;
  /** Banner shown when the fix has drifted or is lost. */
  drift: { tone: 'degraded' | 'lost'; label: string } | null;
};

export type SheetView = {
  /** Set once the source is running. */
  running: boolean;
  /** Whether a position is known — a route needs an origin. */
  located: boolean;
  scanning: boolean;
  /** The last failed scan, shown while the camera stays open. */
  scanError: { title: string; body: string } | null;
  destination: DestinationView | null;
  calculatingRoute: boolean;
  navigation: NavigationView | null;
  /** Floor readout for the "pick a destination" hint row. */
  currentLevel: number | null;
  error: string | null;
};

export type SheetHandlers = {
  onScan: () => void;
  onCancelScan: () => void;
  onGo: () => void;
  onClearDestination: () => void;
  onEnd: () => void;
  onDestinationLevelChange: (level: number | null) => void;
  onOpenSettings: () => void;
};

const escapeHtml = (value: string): string => {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
};

export class NavigationSheet {
  readonly root: HTMLElement;

  private readonly bodyEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  /**
   * The last markup written. Poses arrive at sensor rate (~60/s), and most of
   * them change nothing the user can read — rewriting `innerHTML` that often
   * starves the main thread badly enough that maplibre's tap recogniser starts
   * dropping map taps. Comparing first keeps the sheet cheap between the
   * updates that matter.
   */
  private lastHtml = '';

  constructor(container: HTMLElement, handlers: SheetHandlers) {
    this.root = document.createElement('section');
    this.root.className = 'nav-sheet';
    this.root.innerHTML = `
      <div class="nav-sheet__handle-row"><span class="nav-sheet__handle"></span></div>
      <p class="nav-error" role="alert" hidden></p>
      <div class="nav-sheet__body"></div>
    `;

    this.bodyEl = this.root.querySelector<HTMLElement>('.nav-sheet__body')!;
    this.errorEl = this.root.querySelector<HTMLElement>('.nav-error')!;

    this.root.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
        .action;

      if (action === 'scan') handlers.onScan();
      if (action === 'cancel-scan') handlers.onCancelScan();
      if (action === 'go') handlers.onGo();
      if (action === 'clear-destination') handlers.onClearDestination();
      if (action === 'end') handlers.onEnd();
      if (action === 'settings') handlers.onOpenSettings();
    });

    this.root.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      if (input.dataset.action !== 'destination-level') {
        return;
      }
      const parsed = Number.parseInt(input.value, 10);
      handlers.onDestinationLevelChange(Number.isFinite(parsed) ? parsed : null);
    });

    container.appendChild(this.root);
  }

  render(view: SheetView): void {
    this.errorEl.hidden = view.error === null;
    this.errorEl.textContent = view.error ?? '';

    const html = this.bodyHtml(view);

    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.bodyEl.innerHTML = html;
    }
  }

  private bodyHtml(view: SheetView): string {
    if (view.scanning) {
      return this.scanningHtml();
    }

    if (view.scanError) {
      return this.scanFailedHtml(view.scanError);
    }

    if (view.navigation) {
      return this.navigationHtml(view.navigation);
    }

    if (view.destination) {
      return this.destinationHtml(view);
    }

    if (!view.running) {
      return `
        <div class="nav-stack">
          <h2 class="nav-title nav-title--lg">Find your way indoors</h2>
          <p class="nav-body">
            Your camera finds you inside the building — point it at signs and
            shop fronts and we'll place you on the map.
          </p>
        </div>
        <div class="nav-row nav-row--actions">
          <button type="button" class="nav-btn nav-btn--primary" data-action="scan">
            ${icon('scan-line', 18)}<span>Scan to locate me</span>
          </button>
          <button type="button" class="nav-btn nav-btn--square" data-action="settings" aria-label="Settings">
            ${icon('settings', 20)}
          </button>
        </div>
      `;
    }

    const levelHint =
      view.currentLevel === null
        ? 'The map follows your floor as you move'
        : `You're on Level ${view.currentLevel} · the map follows your floor`;

    return `
      <div class="nav-stack">
        <h2 class="nav-title">Pick a destination</h2>
        <p class="nav-body">
          Tap a point of interest on the map, or anywhere on it to drop a custom
          destination.
        </p>
      </div>
      <div class="nav-row nav-row--actions">
        <div class="nav-hint">${icon('pointer', 16)}<span>${escapeHtml(levelHint)}</span></div>
        <button type="button" class="nav-btn nav-btn--square" data-action="settings" aria-label="Settings">
          ${icon('settings', 20)}
        </button>
      </div>
    `;
  }

  private scanningHtml(): string {
    return `
      <div class="nav-row nav-row--lead">
        <span class="nav-pulse"><span class="nav-pulse__dot"></span></span>
        <div class="nav-stack nav-stack--tight">
          <h2 class="nav-title nav-title--sm">Scanning your surroundings…</h2>
          <p class="nav-body">Keep sweeping until we recognise the place.</p>
        </div>
      </div>
      <button type="button" class="nav-btn nav-btn--quiet nav-btn--block" data-action="cancel-scan">
        Cancel
      </button>
    `;
  }

  private scanFailedHtml(failure: { title: string; body: string }): string {
    return `
      <div class="nav-notice nav-notice--amber">
        ${icon('eye-off', 20)}
        <div class="nav-stack nav-stack--tight">
          <p class="nav-notice__title">${escapeHtml(failure.title)}</p>
          <p class="nav-notice__body">${escapeHtml(failure.body)}</p>
        </div>
      </div>
      <div class="nav-row nav-row--actions">
        <button type="button" class="nav-btn nav-btn--primary" data-action="scan">
          ${icon('refresh-cw', 18)}<span>Try again</span>
        </button>
        <button type="button" class="nav-btn nav-btn--quiet" data-action="cancel-scan">Cancel</button>
      </div>
    `;
  }

  private destinationHtml(view: SheetView): string {
    const destination = view.destination!;
    // Picking a destination before scanning is fine — the card then asks for
    // the scan the route needs, instead of refusing the tap.
    const action = view.located
      ? {
          name: 'go',
          label: view.calculatingRoute ? 'Computing route…' : 'Start navigation',
          glyph: 'navigation' as const,
        }
      : { name: 'scan', label: 'Scan to locate me', glyph: 'scan-line' as const };

    const floorChip =
      destination.levelEditable || destination.level === null
        ? ''
        : `<span class="nav-chip">${icon('layers', 13)}<span>Level ${destination.level}</span></span>`;

    return `
      <div class="nav-row nav-row--lead">
        <span class="nav-avatar">${icon('map-pin', 24)}</span>
        <div class="nav-stack nav-stack--tight">
          <h2 class="nav-title nav-title--md">${escapeHtml(destination.name)}</h2>
          <p class="nav-body nav-body--tight">${escapeHtml(destination.detail)}</p>
          ${floorChip}
        </div>
        <button type="button" class="nav-btn nav-btn--round" data-action="clear-destination" aria-label="Clear destination">
          ${icon('x', 18)}
        </button>
      </div>
      ${destination.levelEditable ? this.floorFieldHtml(destination) : ''}
      ${view.located ? '' : `<p class="nav-note">We'll locate you first, then route you here.</p>`}
      <button type="button" class="nav-btn nav-btn--primary nav-btn--block" data-action="${
        action.name
      }" ${view.calculatingRoute ? 'disabled' : ''}>
        ${icon(action.glyph, 18)}<span>${action.label}</span>
      </button>
    `;
  }

  private floorFieldHtml(destination: DestinationView): string {
    const control = destination.levelOptions.length
      ? `<select class="nav-select" data-action="destination-level" aria-label="Destination floor">
          ${destination.levelOptions
            .map(
              (option) =>
                `<option value="${option.value ?? ''}"${
                  option.value === destination.level ? ' selected' : ''
                }>${escapeHtml(option.label)}</option>`
            )
            .join('')}
        </select>`
      : `<input class="nav-select" type="number" step="1" inputmode="numeric" placeholder="Outdoor"
          data-action="destination-level" aria-label="Destination floor" value="${
            destination.level ?? ''
          }" />`;

    return `
      <div class="nav-field">
        <div class="nav-stack nav-stack--tight">
          <p class="nav-field__label">Floor</p>
          <p class="nav-field__hint">A dropped pin has no floor — set the one you mean.</p>
        </div>
        ${control}
      </div>
    `;
  }

  private navigationHtml(navigation: NavigationView): string {
    if (navigation.arrived) {
      return `
        <div class="nav-row nav-row--lead">
          <span class="nav-avatar nav-avatar--round">${icon('flag', 28)}</span>
          <div class="nav-stack nav-stack--tight">
            <h2 class="nav-title nav-title--md">You have arrived</h2>
            <p class="nav-body nav-body--tight">${escapeHtml(navigation.destinationName)}</p>
          </div>
        </div>
        <button type="button" class="nav-btn nav-btn--primary nav-btn--block" data-action="end">Done</button>
      `;
    }

    const distanceToStep =
      navigation.distanceToStep === null
        ? 'Distance unavailable'
        : `In ${formatDistance(navigation.distanceToStep)}`;

    const drift = navigation.drift
      ? `<div class="nav-notice nav-notice--compact nav-notice--${
          navigation.drift.tone === 'degraded' ? 'amber' : 'grey'
        }">
          ${icon('radar', 16)}<p class="nav-notice__body">${escapeHtml(navigation.drift.label)}</p>
        </div>`
      : '';

    return `
      <div class="nav-row nav-row--lead">
        <span class="nav-avatar nav-avatar--lg">${icon(navigation.instruction.icon, 28)}</span>
        <div class="nav-stack nav-stack--tight">
          <h2 class="nav-title nav-title--step">${escapeHtml(navigation.instruction.text)}</h2>
          <p class="nav-body nav-body--tight">${distanceToStep}</p>
        </div>
      </div>
      ${drift}
      <div class="nav-progress"><span style="width:${Math.round(
        Math.min(1, Math.max(0, navigation.progress)) * 100
      )}%"></span></div>
      <div class="nav-row nav-row--footer">
        <div class="nav-stack nav-stack--tight">
          <p class="nav-metric">${formatDistance(
            navigation.remainingDistance
          )} · ${formatWalkingTime(navigation.remainingDistance)}</p>
          <p class="nav-metric__label">to ${escapeHtml(navigation.destinationName)}</p>
        </div>
        <button type="button" class="nav-btn nav-btn--quiet nav-btn--sm" data-action="end">End navigation</button>
      </div>
    `;
  }
}
