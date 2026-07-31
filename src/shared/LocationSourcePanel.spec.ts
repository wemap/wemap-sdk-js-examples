// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pose } from '@wemap/positioning';
import { LocationSourcePanel } from './LocationSourcePanel';

const pose = (value: unknown): Pose => value as Pose;

// Mirrors the shared element ids the example HTML exposes. A gnss page omits the
// scan controls; a vps page includes them. The panel binds whatever is present.
function mount(withScan = false): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <span id="core-status"></span>
    <span id="ui-update-time"></span>
    <span id="source-status"></span>
    ${withScan ? '<span id="scan-status"></span>' : ''}
    <span id="update-count"></span>
    <span id="error-display" style="display:none"><span id="error-message"></span></span>
    <div id="pose-container"></div>
    <button id="start-source"></button>
    <button id="stop-source"></button>
    ${withScan ? '<button id="start-scan"></button><button id="stop-scan"></button>' : ''}
  `;
  document.body.appendChild(root);
  return root;
}

const baseView = {
  coreReady: true,
  running: false,
  updateCount: 0,
  error: null,
  pose: pose({}),
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('LocationSourcePanel', () => {
  it('renders core, source status and update count', () => {
    const root = mount();
    const panel = new LocationSourcePanel({}, root);

    panel.render({ ...baseView, coreReady: true, running: true, updateCount: 7 });

    expect(root.querySelector('#core-status')?.textContent).toContain('Yes');
    expect(root.querySelector('#source-status')?.textContent).toContain('Running');
    expect(root.querySelector('#update-count')?.textContent).toBe('7');
  });

  it('shows and hides the error row', () => {
    const root = mount();
    const panel = new LocationSourcePanel({}, root);
    const display = root.querySelector<HTMLElement>('#error-display')!;

    panel.render({ ...baseView, error: 'boom' });
    expect(display.style.display).not.toBe('none');
    expect(root.querySelector('#error-message')?.textContent).toBe('boom');

    panel.render({ ...baseView, error: null });
    expect(display.style.display).toBe('none');
  });

  it('renders a pose readout when a position is present', () => {
    const root = mount();
    const panel = new LocationSourcePanel({}, root);

    panel.render({ ...baseView, pose: pose({ position: { latitude: 48.8566, longitude: 2.3522 } }) });

    const html = root.querySelector('#pose-container')?.innerHTML ?? '';
    expect(html).toContain('48.856600');
    expect(html).toContain('Latitude');
  });

  it('shows placeholders when pose has no position or attitude', () => {
    const root = mount();
    const panel = new LocationSourcePanel({}, root);

    panel.render({ ...baseView, pose: pose({}) });

    const html = root.querySelector('#pose-container')?.innerHTML ?? '';
    expect(html).toContain('No position data yet');
    expect(html).toContain('No attitude data yet');
  });

  it('reflects running state on the start/stop buttons', () => {
    const root = mount();
    const panel = new LocationSourcePanel({}, root);
    const start = root.querySelector<HTMLButtonElement>('#start-source')!;
    const stop = root.querySelector<HTMLButtonElement>('#stop-source')!;

    panel.render({ ...baseView, running: false });
    expect(start.disabled).toBe(false);
    expect(stop.disabled).toBe(true);

    panel.render({ ...baseView, running: true });
    expect(start.disabled).toBe(true);
    expect(stop.disabled).toBe(false);
  });

  it('wires start/stop handlers to button clicks', () => {
    const root = mount();
    const onStart = vi.fn();
    const onStop = vi.fn();
    new LocationSourcePanel({ onStart, onStop }, root);

    root.querySelector<HTMLButtonElement>('#start-source')!.click();
    root.querySelector<HTMLButtonElement>('#stop-source')!.click();

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('drives scan controls only when the scan elements exist', () => {
    const root = mount(true);
    const onStartScan = vi.fn();
    const panel = new LocationSourcePanel({ onStartScan }, root);

    panel.render({ ...baseView, running: true, scanning: false });
    const startScan = root.querySelector<HTMLButtonElement>('#start-scan')!;
    expect(startScan.disabled).toBe(false);
    expect(root.querySelector('#scan-status')?.textContent).toContain('Stopped');

    startScan.click();
    expect(onStartScan).toHaveBeenCalledOnce();
  });

  it('tolerates a page without scan controls', () => {
    const root = mount(false);
    const panel = new LocationSourcePanel({ onStartScan: vi.fn() }, root);
    expect(() => panel.render({ ...baseView, running: true, scanning: false })).not.toThrow();
  });
});
