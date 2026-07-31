/**
 * The demo shell for the location-source example pages.
 *
 * Every location-source example needs the same scaffolding: reflect core/source
 * status, an update counter, an error row, a pose readout, and start/stop (plus
 * optional scan) buttons. That scaffolding used to be ~180 lines of
 * `getElementById` + `textContent` + `onclick` plumbing copied into each page,
 * burying the handful of SDK calls the example exists to show.
 *
 * LocationSourcePanel owns all of that behind two things: construct it with the
 * button handlers, then call `render(view)` whenever state changes. The example
 * page is left as its SDK calls plus `panel.render(...)`.
 *
 * It binds to a fixed set of element ids; a page that omits the scan elements
 * (e.g. GNSS) simply gets no scan behaviour.
 */
import type { Pose } from '@wemap/positioning';
import { poseReadoutHtml } from './poseReadoutHtml';

const GREEN = '#28a745';
const RED = '#dc3545';

export type LocationSourceView = {
  /** Whether `core.init()` succeeded. */
  coreReady: boolean;
  /** Whether the location source is started. */
  running: boolean;
  /** Whether a VPS scan is in progress. Omit on pages without scanning. */
  scanning?: boolean;
  /** Number of pose updates received so far. */
  updateCount: number;
  /** Latest error message, or null to clear the error row. */
  error: string | null;
  /** Latest pose from the source (`{}` before the first fix). */
  pose: Pose;
};

export type LocationSourcePanelHandlers = {
  onStart?: () => void;
  onStop?: () => void;
  onStartScan?: () => void;
  onStopScan?: () => void;
};

export class LocationSourcePanel {
  private readonly root: ParentNode;

  constructor(handlers: LocationSourcePanelHandlers = {}, root: ParentNode = document) {
    this.root = root;
    this.bindClick('start-source', handlers.onStart);
    this.bindClick('stop-source', handlers.onStop);
    this.bindClick('start-scan', handlers.onStartScan);
    this.bindClick('stop-scan', handlers.onStopScan);
  }

  render(view: LocationSourceView): void {
    this.setStatus('core-status', view.coreReady, view.coreReady ? '✓ Yes' : '✗ No');
    this.setText('ui-update-time', new Date().toISOString());
    this.setStatus('source-status', view.running, view.running ? '● Running' : '○ Stopped');

    if (view.scanning !== undefined) {
      this.setStatus('scan-status', view.scanning, view.scanning ? '● Running' : '○ Stopped');
    }

    this.setText('update-count', String(view.updateCount));
    this.setError(view.error);
    this.setHtml('pose-container', poseReadoutHtml(view.pose));

    this.setDisabled('start-source', view.running);
    this.setDisabled('stop-source', !view.running);
    // A scan can run independently of the source being started (matches the
    // standalone VPS page); only guard against starting a scan twice.
    this.setDisabled('start-scan', Boolean(view.scanning));
    this.setDisabled('stop-scan', !view.scanning);
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.root.querySelector<T>(`#${id}`);
  }

  private bindClick(id: string, handler?: () => void): void {
    if (!handler) {
      return;
    }
    this.el<HTMLButtonElement>(id)?.addEventListener('click', handler);
  }

  private setText(id: string, text: string): void {
    const el = this.el(id);
    if (el) {
      el.textContent = text;
    }
  }

  private setHtml(id: string, html: string): void {
    const el = this.el(id);
    if (el) {
      el.innerHTML = html;
    }
  }

  private setStatus(id: string, ok: boolean, text: string): void {
    const el = this.el(id);
    if (el) {
      el.textContent = text;
      el.style.color = ok ? GREEN : RED;
    }
  }

  private setDisabled(id: string, disabled: boolean): void {
    const el = this.el<HTMLButtonElement>(id);
    if (el) {
      el.disabled = disabled;
    }
  }

  private setError(message: string | null): void {
    const display = this.el('error-display');
    const messageEl = this.el('error-message');
    if (!display || !messageEl) {
      return;
    }
    if (message) {
      display.style.display = 'inline';
      messageEl.textContent = message;
    } else {
      display.style.display = 'none';
    }
  }
}
