/**
 * Camera surface for the VPS sample app.
 *
 * One `Camera` instance lives for the whole session and is only *shown* while
 * the user runs a manual scan (the design's screen 2): a full-stage viewfinder
 * with a framing rectangle and the sweep instruction. The rest of the time the
 * surface is `display: none` — the camera keeps running so
 * `VPSLocationSource`'s background scan can re-locate the user, and a small
 * label is all the user sees while that happens.
 *
 * Hiding it is safe because capture never goes through layout:
 * `Camera.currentImage` draws from the video's intrinsic `videoWidth` /
 * `videoHeight`, and `VpsProvider` sends no calibration derived from the
 * displayed size. Stopping the camera would not be safe — the provider's
 * request loop breaks out as soon as the camera is no longer `started`.
 */
import { Camera } from '@wemap/camera';
import { icon } from './icons';

export type ScanViewOptions = {
  /** Where to mount the camera surface (the map stage). */
  container: HTMLElement;
  /** User dismissed the expanded viewfinder. */
  onCancel: () => void;
};

const SWEEP_HINT = 'Hold the phone upright and sweep slowly across signs, shop fronts and facades';

export class ScanView {
  readonly root: HTMLElement;

  private readonly label: HTMLElement;
  private readonly labelTextEl: HTMLElement;
  private readonly videoHolder: HTMLElement;
  private readonly hintEl: HTMLElement;
  private camera: Camera | null = null;

  constructor(options: ScanViewOptions) {
    this.root = document.createElement('div');
    this.root.className = 'scan-view scan-view--hidden';
    this.root.innerHTML = `
      <div class="scan-view__video"></div>
      <button type="button" class="scan-view__cancel" aria-label="Cancel scan">${icon('x', 20)}</button>
      <div class="scan-view__frame" aria-hidden="true"></div>
      <p class="scan-view__hint">${icon('move-horizontal', 18)}<span>${SWEEP_HINT}</span></p>
    `;

    this.videoHolder = this.root.querySelector<HTMLElement>('.scan-view__video')!;
    this.hintEl = this.root.querySelector<HTMLElement>('.scan-view__hint span:last-child')!;

    this.root
      .querySelector<HTMLButtonElement>('.scan-view__cancel')!
      .addEventListener('click', () => options.onCancel());

    // A sibling of the camera surface, so it stays visible while that is hidden.
    this.label = document.createElement('div');
    this.label.className = 'scan-label';
    this.label.hidden = true;
    this.label.innerHTML = '<span class="scan-label__dot"></span><span class="scan-label__text"></span>';
    this.labelTextEl = this.label.querySelector<HTMLElement>('.scan-label__text')!;

    options.container.appendChild(this.root);
    options.container.appendChild(this.label);
  }

  /** Start the camera (first call only) and show the viewfinder. */
  async expand(hint: string = SWEEP_HINT): Promise<void> {
    this.root.classList.remove('scan-view--hidden');
    this.hintEl.textContent = hint;

    if (!this.camera) {
      await Camera.checkAvailability();
      this.camera = new Camera(this.videoHolder, { resizeOnWindowChange: true });
      await this.camera.start();
    }

    // Only ever sized while visible: `Camera` reads the container's pixel size,
    // which is 0 under `display: none`.
    this.camera.notifyContainerSizeChanged();
  }

  /** Take the viewfinder off screen, leaving the camera running. */
  hide(): void {
    this.root.classList.add('scan-view--hidden');
  }

  setHint(hint: string): void {
    this.hintEl.textContent = hint;
  }

  /** The only sign of a background scan: a small label, or `null` for none. */
  setScanLabel(text: string | null): void {
    this.label.hidden = text === null;
    this.labelTextEl.textContent = text ?? '';
  }

  async destroy(): Promise<void> {
    if (this.camera) {
      await this.camera.stop();
      // Drops the video element and unregisters from SharedCameras, so VPS
      // stops seeing a camera it can no longer read frames from.
      this.camera.release();
      this.camera = null;
    }
    this.root.remove();
    this.label.remove();
  }
}
