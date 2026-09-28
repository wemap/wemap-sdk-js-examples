/**
 * Demo settings, as screen 6 of the design: venue, API token, strict map
 * matching. It replaces the generic example params form on this page so the
 * sheet matches the rest of the app; the GNSS example keeps that form.
 */
import { icon } from './icons';

export type SettingsValues = {
  emmid: string;
  token: string;
  useStrict: boolean;
};

export class SettingsSheet {
  readonly root: HTMLElement;

  private readonly emmidInput: HTMLInputElement;
  private readonly tokenInput: HTMLInputElement;
  private readonly strictInput: HTMLInputElement;

  private readonly onApply: (values: SettingsValues) => void;

  constructor(container: HTMLElement, onApply: (values: SettingsValues) => void) {
    this.onApply = onApply;
    this.root = document.createElement('div');
    this.root.className = 'nav-modal';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="nav-modal__scrim" data-action="close"></div>
      <form class="nav-sheet nav-sheet--modal">
        <div class="nav-sheet__handle-row"><span class="nav-sheet__handle"></span></div>
        <div class="nav-row nav-row--header">
          <h2 class="nav-title nav-title--md">Settings</h2>
          <button type="button" class="nav-btn nav-btn--round" data-action="close" aria-label="Close settings">
            ${icon('x', 18)}
          </button>
        </div>
        <label class="nav-stack nav-stack--field">
          <span class="nav-field__caption">Venue</span>
          <span class="nav-input">${icon('building-2', 16)}<input name="emmid" type="text" autocomplete="off" /></span>
        </label>
        <label class="nav-stack nav-stack--field">
          <span class="nav-field__caption">API token</span>
          <span class="nav-input">${icon('key-round', 16)}<input name="token" type="password" autocomplete="off" /></span>
        </label>
        <label class="nav-field nav-field--toggle">
          <span class="nav-stack nav-stack--tight">
            <span class="nav-field__label">Strict map matching</span>
            <span class="nav-field__hint">Snap hard to the route instead of the raw position.</span>
          </span>
          <input name="useStrict" type="checkbox" class="nav-switch" />
        </label>
        <button type="submit" class="nav-btn nav-btn--primary nav-btn--block">Apply</button>
        <p class="nav-note">Demo options. End users never see this screen.</p>
      </form>
    `;

    this.emmidInput = this.root.querySelector<HTMLInputElement>('[name="emmid"]')!;
    this.tokenInput = this.root.querySelector<HTMLInputElement>('[name="token"]')!;
    this.strictInput = this.root.querySelector<HTMLInputElement>('[name="useStrict"]')!;

    this.root.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-action="close"]')) {
        this.close();
      }
    });

    this.root.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const emmid = this.emmidInput.value.trim();
      const token = this.tokenInput.value.trim();

      if (!emmid || !token) {
        return;
      }

      this.onApply({ emmid, token, useStrict: this.strictInput.checked });
      this.close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    });

    container.appendChild(this.root);
  }

  open(values: SettingsValues): void {
    this.emmidInput.value = values.emmid;
    this.tokenInput.value = values.token;
    this.strictInput.checked = values.useStrict;
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }
}
