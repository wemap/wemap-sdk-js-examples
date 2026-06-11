/**
 * Smoke-test page for DomMarkerLayer (map-003 manual QA).
 *
 * Livemap 31668 — toolbar buttons add marker variants; bulk add stress-test.
 */
import { core, type Building } from '@wemap/core';
import { WemapMap, DomMarkerLayer } from '@wemap/map';
import type { DomMarkerClickEvent } from '@wemap/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '31668';

const SAMPLE_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffffff"/><text x="12" y="16" text-anchor="middle" font-size="12" fill="#2F7DE1">★</text></svg>'
  );

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — DomMarkerLayer</h1>
    <p>Livemap <strong>${EMMID}</strong>. Toolbar adds markers; click a pin to log id and coordinates (map-003).</p>
    <div id="levels" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.75rem 0;position:relative;z-index:2">
      <span>Loading map…</span>
    </div>
    <div id="controls" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;position:relative;z-index:2"></div>
    <div id="map" style="width:100%;height:60vh;border-radius:8px"></div>
    <p id="readout" style="margin-top:.5rem;color:#4a5568;font-size:.875rem"></p>
    <p id="status" style="margin-top:.25rem;color:#2d3748;font-size:.875rem;font-weight:500"></p>
    <p id="click-log" style="margin-top:.25rem;color:#1a365d;font-size:.875rem;font-family:monospace;white-space:pre-wrap"></p>
  </div>
`;

const levelsBar = document.querySelector<HTMLDivElement>('#levels')!;
const controls = document.querySelector<HTMLDivElement>('#controls')!;
const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const clickLog = document.querySelector<HTMLParagraphElement>('#click-log')!;

type AppState = {
  map: WemapMap;
  markers: DomMarkerLayer;
  mapReady: boolean;
  markerCount: number;
};

let state: AppState | null = null;

function setStatus(message: string): void {
  status.textContent = message;
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.cssText =
    'padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff';
  btn.addEventListener('click', () => {
    try {
      onClick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${message}`);
      console.error(error);
    }
  });

  return btn;
}

function randomCoord(baseLat: number, baseLng: number): { lat: number; lng: number } {
  return {
    lat: baseLat + (Math.random() - 0.5) * 0.002,
    lng: baseLng + (Math.random() - 0.5) * 0.002,
  };
}

function nextId(prefix: string): string {
  state!.markerCount += 1;

  return `${prefix}-${state!.markerCount}`;
}

function updateReadout(): void {
  if (!state) {
    return;
  }

  const c = state.map.getCenter();
  readout.textContent =
    `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · zoom: ${state.map.getZoom().toFixed(1)} · map level: ${state.map.getLevel() ?? '—'}`;
}

function logClick(event: DomMarkerClickEvent): void {
  const { id, position } = event;
  const level = position.level ?? '—';
  clickLog.textContent = `marker click: id=${id} · lat=${position.lat.toFixed(5)} lng=${position.lng.toFixed(5)} · level=${level}`;
}

const BASE = { lat: 43.609092, lng: 3.91722 };

controls.append(
  makeButton('Default pin (L0)', () => {
    const id = nextId('default');
    state!.markers.add({
      id,
      position: { ...randomCoord(BASE.lat, BASE.lng), level: 0 },
    });
    setStatus(`Added ${id} (default teardrop, floor 0)`);
  }),
  makeButton('Icon + color (L1)', () => {
    const id = nextId('icon');
    state!.markers.add({
      id,
      position: { ...randomCoord(BASE.lat, BASE.lng), level: 1 },
      icon: SAMPLE_ICON,
      color: 'rgb(220, 80, 60)',
    });
    setStatus(`Added ${id} (icon + colored shape, floor 1)`);
  }),
  makeButton('Custom element', () => {
    const id = nextId('custom');
    const el = document.createElement('div');
    el.textContent = 'POI';
    el.style.cssText =
      'padding:.35rem .6rem;background:#1a202c;color:#fff;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25)';
    state!.markers.add({
      id,
      position: randomCoord(BASE.lat, BASE.lng),
      element: el,
    });
    setStatus(`Added ${id} (custom element, no level)`);
  }),
  makeButton('Bulk add (20)', () => {
    for (let i = 0; i < 20; i += 1) {
      state!.markers.add({
        id: nextId('bulk'),
        position: {
          ...randomCoord(BASE.lat, BASE.lng),
          level: i % 2,
        },
      });
    }
    setStatus('Bulk added 20 markers (alternating floors 0/1)');
  }),
  makeButton('Clear all', () => {
    state!.markers.destroy();
    state!.markers = new DomMarkerLayer(state!.map);
    state!.markers.on('click', logClick);
    setStatus('All markers removed');
    clickLog.textContent = '';
  })
);

async function main(): Promise<void> {
  setStatus('Initializing livemap…');
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  const map = new WemapMap({ container: 'map' });

  const markers = new DomMarkerLayer(map);
  markers.on('click', logClick);

  state = { map, markers, mapReady: false, markerCount: 0 };

  const levelButtons = new Map<number, HTMLButtonElement>();
  const setActiveLevel = (active: number | null) => {
    for (const [lvl, btn] of levelButtons) {
      btn.style.background = lvl === active ? '#007bff' : '#fff';
      btn.style.color = lvl === active ? '#fff' : '#1a202c';
    }
  };

  map.onLevelChange((level) => {
    setActiveLevel(level);
    updateReadout();
  });

  map.on('move', updateReadout);

  map.on('load', () => {
    state!.mapReady = Boolean(map.map.isStyleLoaded());
    setStatus('Map ready — use toolbar buttons to add markers');
    updateReadout();
  });

  map.onBuildingChange((building: Building | null) => {
    levelButtons.clear();
    levelsBar.replaceChildren();

    if (!building?.levels.length) {
      levelsBar.append(
        Object.assign(document.createElement('span'), { textContent: 'No building in view' })
      );

      return;
    }

    levelsBar.append(
      Object.assign(document.createElement('span'), {
        textContent: `${building.name} — manual floor:`,
      })
    );

    for (const lvl of [...building.levels].sort((a, b) => b.level - a.level)) {
      const btn = makeButton(lvl.short_name, () => {
        map.setLevel(lvl.level);
        setStatus(`Manual floor ${lvl.level}`);
        updateReadout();
      });
      levelButtons.set(lvl.level, btn);
      levelsBar.append(btn);
    }

    setActiveLevel(map.getLevel());
  });
}

main().catch((error) => {
  setStatus(`Failed to load: ${error.message}`);
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
