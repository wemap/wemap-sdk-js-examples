/**
 * Custom markers from API pinpoints in the viewport.
 *
 * This livemap renders **no pinpoints in its map style** — the points of
 * interest live only in the Wemap API. The SDK still exposes them through
 * `@wemap/core`'s `PinpointManager`, and `WemapMap` streams the ones currently
 * on screen via `onViewportPinpointsChange` (API-sourced, debounced on
 * move/zoom/level change, filtered to the viewport — NOT read from the style).
 *
 * Here we turn that stream into our own custom DOM markers with `DomMarkerLayer`:
 * as you pan and zoom, markers are added for pinpoints that enter the viewport
 * and removed for those that leave. Clicking a marker shows the pinpoint's API
 * data, including `external_data`.
 *
 * The page markup, styles, and the marker/details templates live in
 * `viewport-pinpoints.html`; this module only wires behavior.
 */
import { core } from '@wemap/core';
import type { Pinpoint } from '@wemap/core';
import { Coordinates } from '@wemap/geo';
import { WemapMap, DomMarkerLayer } from '@wemap/map';
import type { DomMarkerClickEvent } from '@wemap/map';
import './shared/maplibreSetup';

const EMMID = '21864';

const countEl = document.querySelector<HTMLSpanElement>('#vp-count')!;
const triggerEl = document.querySelector<HTMLSpanElement>('#vp-trigger')!;
const detailsEl = document.querySelector<HTMLDivElement>('#vp-details')!;
const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const markerTemplate = document.querySelector<HTMLTemplateElement>('#marker-template')!;
const detailsTemplate = document.querySelector<HTMLTemplateElement>('#details-template')!;

/** Build the custom DOM element for one pinpoint's marker from the template. */
function buildMarkerElement(pinpoint: Pinpoint): HTMLElement {
  const el = markerTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  el.querySelector<HTMLSpanElement>('.api-marker__label')!.textContent =
    pinpoint.name || `#${pinpoint.id}`;
  return el;
}

/** Render the API data for a clicked pinpoint into the details panel. */
function showDetails(pinpoint: Pinpoint): void {
  const fragment = detailsTemplate.content.cloneNode(true) as DocumentFragment;
  const set = (field: string, value: string) => {
    fragment.querySelector<HTMLElement>(`[data-field="${field}"]`)!.textContent = value;
  };

  set('id', String(pinpoint.id));
  set('name', pinpoint.name || '—');
  set('level', pinpoint.level == null ? '—' : String(pinpoint.level));
  set('coordinates', `${pinpoint.latitude.toFixed(5)}, ${pinpoint.longitude.toFixed(5)}`);
  set('address', pinpoint.address || '—');
  set('tags', pinpoint.tags?.length ? pinpoint.tags.join(', ') : '—');
  set(
    'external_data',
    pinpoint.external_data ? JSON.stringify(pinpoint.external_data, null, 2) : 'null'
  );

  detailsEl.replaceChildren(fragment);
}

async function main(): Promise<void> {
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  const map = new WemapMap({ container: 'map' });
  await map.whenReady();

  // Our own layer of custom markers — no clustering, one marker per pinpoint.
  const markers = new DomMarkerLayer(map);

  // The pinpoints currently rendered (by id), so a marker click can look one up.
  const shown = new Map<string, Pinpoint>();
  // Cache built elements so panning reuses them instead of rebuilding every marker.
  const elements = new Map<string, HTMLElement>();

  markers.on('click', ({ id }: DomMarkerClickEvent) => {
    const pinpoint = shown.get(id);
    if (pinpoint) {
      showDetails(pinpoint);
    }
  });

  // Reconcile the marker layer to exactly the pinpoints in view — DomMarkerLayer
  // handles the add/update/remove diff; we just hand it the full desired set.
  const render = (pinpoints: Pinpoint[]) => {
    shown.clear();
    for (const pinpoint of pinpoints) {
      shown.set(String(pinpoint.id), pinpoint);
    }

    markers.setMarkers(
      pinpoints.map((pinpoint) => {
        const id = String(pinpoint.id);
        let element = elements.get(id);
        if (!element) {
          element = buildMarkerElement(pinpoint);
          elements.set(id, element);
        }
        return {
          id,
          position: new Coordinates(pinpoint.latitude, pinpoint.longitude, null, pinpoint.level ?? null),
          element,
        };
      })
    );

    for (const id of [...elements.keys()]) {
      if (!shown.has(id)) {
        elements.delete(id);
      }
    }

    countEl.textContent = String(pinpoints.length);
  };

  // Deterministic first paint: pull the current set instead of racing the first emit.
  render(map.getViewportPinpoints());

  // The viewport pinpoint stream: API-sourced, already filtered to what's on screen.
  map.onViewportPinpointsChange(({ pinpoints, trigger }) => {
    triggerEl.textContent = `(${trigger})`;
    // Keep the current markers on screen while the next fetch is in flight.
    if (trigger === 'loading') {
      return;
    }
    render(pinpoints);
  });

  const updateReadout = () => {
    const c = map.getCenter();
    readout.textContent = `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · zoom: ${map
      .getZoom()
      .toFixed(1)} · level: ${map.getLevel() ?? '—'}`;
  };
  map.on('move', updateReadout);
  map.on('load', updateReadout);
  map.onLevelChange(updateReadout);
  updateReadout();
}

main().catch((error) => {
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
