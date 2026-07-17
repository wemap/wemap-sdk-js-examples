/**
 * Integrator-facing showcase for the @wemap/map package.
 *
 * Features shown on one page:
 * - WemapMap creation from snippet defaults (`core.init` + `new WemapMap`)
 * - camera helpers (`setCenter`, `setZoom`, `flyTo`, `fitBounds`)
 * - indoor levels: built-in opt-in `LevelControl` + `onLevelChange` readout
 * - runtime source/layer helpers (`addSource`, `addLayer`, `registerIndoorLayer`)
 * - POI state APIs (`onPoiClick`, `setPoiHighlighted`, `setPoiSelected`, `showAllPois` / `filterPois`)
 * - viewport pinpoints stream (`onViewportPinpointsChange`)
 */
import { core } from '@wemap/core';
import { BoundingBox, Coordinates } from '@wemap/geo';
import { WemapMap, LevelControl } from '@wemap/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '31668';
const CUSTOM_SOURCE_ID = 'example-level-areas';
const CUSTOM_LAYER_ID = 'example-level-areas-fill';
const SAMPLE_POI_IDS = [93929221, 90494242, 89151273];

const CUSTOM_LAYER_DATA = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [3.9168, 43.6093],
            [3.9175, 43.6093],
            [3.9175, 43.6088],
            [3.9168, 43.6088],
            [3.9168, 43.6093],
          ],
        ],
      },
      properties: { level: '0' },
    },
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [3.9170, 43.6092],
            [3.9177, 43.6092],
            [3.9177, 43.6087],
            [3.9170, 43.6087],
            [3.9170, 43.6092],
          ],
        ],
      },
      properties: { level: '1' },
    },
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [3.9165, 43.6091],
            [3.9172, 43.6091],
            [3.9172, 43.6086],
            [3.9165, 43.6086],
            [3.9165, 43.6091],
          ],
        ],
      },
      properties: { min_level: 0, max_level: 1, level: '0;1' },
    },
  ],
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — Feature showcase</h1>
    <p>Livemap <strong>${EMMID}</strong>. One page demonstrating the core map APIs integrators use most.</p>

    <div id="camera-controls" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
      <strong>Camera</strong>
      <button type="button" id="btn-reset-view">Reset view</button>
      <button type="button" id="btn-fly-paris">Fly to Paris center</button>
      <button type="button" id="btn-fit-demo">Fit demo bounds</button>
      <button type="button" id="btn-zoom-in">Zoom +1</button>
      <button type="button" id="btn-zoom-out">Zoom -1</button>
    </div>


    <div id="poi-controls" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
      <strong>POI state</strong>
      <button type="button" id="btn-highlight-sample">Highlight sample IDs</button>
      <button type="button" id="btn-select-sample">Select sample IDs</button>
      <button type="button" id="btn-visible-sample">Show sample IDs only</button>
      <button type="button" id="btn-visible-all">Show all</button>
      <button type="button" id="btn-clear-poi-state">Clear POI state</button>
    </div>

    <div id="layer-controls" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
      <strong>Runtime layers</strong>
      <button type="button" id="btn-add-indoor-layer" disabled>Add indoor demo layer</button>
      <button type="button" id="btn-toggle-indoor-layer" disabled>Toggle layer visibility</button>
    </div>

    <div id="map" style="width:100%;height:64vh;border-radius:8px;margin-top:1rem"></div>

    <p id="readout" style="margin-top:.5rem;color:#4a5568;font-size:.875rem"></p>
    <p id="poi-click-log" style="margin-top:.25rem;color:#1a365d;font-size:.875rem;font-family:monospace;white-space:pre-wrap"></p>
    <pre id="pinpoints-log"></pre>
  </div>
`;

const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const poiClickLog = document.querySelector<HTMLParagraphElement>('#poi-click-log')!;
const pinpointsLog = document.querySelector<HTMLPreElement>('#pinpoints-log')!;
const btnResetView = document.querySelector<HTMLButtonElement>('#btn-reset-view')!;
const btnFlyParis = document.querySelector<HTMLButtonElement>('#btn-fly-paris')!;
const btnFitDemo = document.querySelector<HTMLButtonElement>('#btn-fit-demo')!;
const btnZoomIn = document.querySelector<HTMLButtonElement>('#btn-zoom-in')!;
const btnZoomOut = document.querySelector<HTMLButtonElement>('#btn-zoom-out')!;
const btnHighlightSample = document.querySelector<HTMLButtonElement>('#btn-highlight-sample')!;
const btnSelectSample = document.querySelector<HTMLButtonElement>('#btn-select-sample')!;
const btnVisibleSample = document.querySelector<HTMLButtonElement>('#btn-visible-sample')!;
const btnVisibleAll = document.querySelector<HTMLButtonElement>('#btn-visible-all')!;
const btnClearPoiState = document.querySelector<HTMLButtonElement>('#btn-clear-poi-state')!;
const btnAddIndoorLayer = document.querySelector<HTMLButtonElement>('#btn-add-indoor-layer')!;
const btnToggleIndoorLayer = document.querySelector<HTMLButtonElement>('#btn-toggle-indoor-layer')!;

async function main(): Promise<void> {
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });
  const map = new WemapMap({ container: 'map' });
  await map.whenReady();

  btnAddIndoorLayer.disabled = false;
  btnToggleIndoorLayer.disabled = false;

  const initialCenter = map.getCenter();
  const initialZoom = map.getZoom();
  let indoorLayerVisible = true;

  const updateReadout = () => {
    const c = map.getCenter();
    const highlighted = map.getPoiHighlighted();
    const selected = map.getPoiSelected();
    const visible = map.getPoiFilter();
    readout.textContent = [
      `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`,
      `zoom: ${map.getZoom().toFixed(1)}`,
      `level: ${map.getLevel() ?? '—'}`,
      `highlighted: [${highlighted.join(', ') || '—'}]`,
      `selected: [${selected.join(', ') || '—'}]`,
      `visible: ${
        visible === null ? 'all' : visible.length ? `[${visible.join(', ')}]` : '[]'
      }`,
    ].join(' · ');
  };

  map.onLevelChange(updateReadout);
  map.on('move', updateReadout);
  map.on('load', updateReadout);

  // Built-in opt-in indoor level switcher (replaces the former hand-built #levels bar).
  map.addControl(new LevelControl(map));

  map.onPoiClick((event) => {
    poiClickLog.textContent = [
      `POI click`,
      `id: ${event.pinpoint.id}`,
      `name: ${event.pinpoint.name}`,
      `externalId: ${event.externalId ?? '—'}`,
      `coordinates: ${event.coordinates.lat.toFixed(5)}, ${event.coordinates.lng.toFixed(5)}`,
    ].join('\n');
  });

  map.onViewportPinpointsChange(({ pinpoints, trigger }) => {
    const preview = pinpoints
      .slice(0, 8)
      .map((p) => `#${p.id} · ${p.name} · level ${p.level ?? '—'}`);
    pinpointsLog.textContent = [
      `Viewport pinpoints (${trigger}) -> ${pinpoints.length} item(s)`,
      ...preview,
      ...(pinpoints.length > preview.length
        ? [`... and ${pinpoints.length - preview.length} more`]
        : []),
    ].join('\n');
  });

  btnResetView.addEventListener('click', () => {
    map.setCenter(initialCenter);
    map.setZoom(initialZoom);
  });
  btnFlyParis.addEventListener('click', () => {
    map.flyTo({ center: new Coordinates(48.8566, 2.3522), zoom: 16.5, duration: 1200 });
  });
  btnFitDemo.addEventListener('click', () => {
    map.fitBounds(
      new BoundingBox(new Coordinates(48.8618, 2.361), new Coordinates(48.8528, 2.343))
    );
  });
  btnZoomIn.addEventListener('click', () => map.setZoom(map.getZoom() + 1));
  btnZoomOut.addEventListener('click', () => map.setZoom(Math.max(0, map.getZoom() - 1)));

  btnHighlightSample.addEventListener('click', () => {
    map.setPoiHighlighted(SAMPLE_POI_IDS);
    updateReadout();
  });
  btnSelectSample.addEventListener('click', () => {
    map.setPoiSelected(SAMPLE_POI_IDS);
    updateReadout();
  });
  btnVisibleSample.addEventListener('click', () => {
    map.filterPois(SAMPLE_POI_IDS);
    updateReadout();
  });
  btnVisibleAll.addEventListener('click', () => {
    map.showAllPois();
    updateReadout();
  });
  btnClearPoiState.addEventListener('click', () => {
    map.setPoiHighlighted([]);
    map.setPoiSelected([]);
    map.showAllPois();
    updateReadout();
  });

  btnAddIndoorLayer.addEventListener('click', async () => {
    await map.whenReady();

    map.addSource(CUSTOM_SOURCE_ID, {
      type: 'geojson',
      data: CUSTOM_LAYER_DATA,
    });

    map.addLayer(
      {
        id: CUSTOM_LAYER_ID,
        type: 'fill',
        source: CUSTOM_SOURCE_ID,
        paint: {
          'fill-color': '#7c3aed',
          'fill-opacity': 0.25,
          'fill-outline-color': '#5b21b6',
        },
      },
      { indoor: true }
    );

    const currentLevel = map.getLevel();
    if (currentLevel !== null) {
      map.setLevel(currentLevel);
    }
  });

  btnToggleIndoorLayer.addEventListener('click', () => {
    const layer = map.maplibre.getLayer(CUSTOM_LAYER_ID);
    if (!layer) {
      return;
    }

    indoorLayerVisible = !indoorLayerVisible;
    map.maplibre.setLayoutProperty(
      CUSTOM_LAYER_ID,
      'visibility',
      indoorLayerVisible ? 'visible' : 'none'
    );
  });
}

main().catch((error) => {
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
