/**
 * The location-state pill floating over the map (top-left in the design).
 *
 * It is the app's one permanent confidence signal: a dot in the state's colour,
 * a plain-language label, and — only when the fix has drifted — a Rescan
 * button. The user marker is restyled from the same state (`styles.css`,
 * `[data-location-state]`), so the pill and the dot never disagree.
 */
import type { LocationStateDescriptor } from './navigationFormat';

export class StatusPill {
  readonly root: HTMLButtonElement;

  private readonly labelEl: HTMLElement;
  private readonly actionEl: HTMLElement;

  constructor(container: HTMLElement, onRescan: () => void) {
    // The whole pill triggers a rescan: with the camera hidden between scans,
    // this is the app's only permanent way to ask for a fresh fix.
    this.root = document.createElement('button');
    this.root.type = 'button';
    this.root.className = 'nav-pill';
    this.root.hidden = true;
    this.root.innerHTML = `
      <span class="nav-pill__dot"></span>
      <span class="nav-pill__label"></span>
      <span class="nav-pill__action" hidden>Rescan</span>
    `;

    this.labelEl = this.root.querySelector<HTMLElement>('.nav-pill__label')!;
    this.actionEl = this.root.querySelector<HTMLElement>('.nav-pill__action')!;
    this.root.addEventListener('click', onRescan);

    container.appendChild(this.root);
  }

  render(state: LocationStateDescriptor, visible: boolean, scanning: boolean): void {
    this.root.hidden = !visible;
    this.root.dataset.tone = state.tone;
    this.root.disabled = scanning;
    this.labelEl.textContent = state.label;
    this.actionEl.hidden = !state.suggestScan || scanning;
  }
}
