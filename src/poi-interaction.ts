/**
 * Smoke-test page for WemapMap POI interaction (map-005 manual QA).
 *
 * Livemap 31668 — click stylesheet pinpoints; highlight/select by id.
 */
import { core, type Building } from '@wemap/core';
import { WemapMap } from '@wemap/map';
import type { PoiClickEvent } from '@wemap/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '31668';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — POI interaction</h1>
    <p>Livemap <strong>${EMMID}</strong>. Click a stylesheet POI; highlight or select by pinpoint id (map-005).</p>
    <div id="levels" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.75rem 0;position:relative;z-index:2">
      <span>Loading map…</span>
    </div>
    <div id="controls" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem;position:relative;z-index:2">
      <label style="display:flex;gap:.35rem;align-items:center;font-size:.875rem">
        Pinpoint id
        <input id="pinpoint-id" type="number" placeholder="id" style="width:6rem;padding:.35rem .5rem;border:1px solid #cbd5e0;border-radius:4px" />
      </label>
      <button type="button" id="btn-highlight" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Highlight</button>
      <button type="button" id="btn-select" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Select</button>
      <button type="button" id="btn-clear-highlight" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Clear highlight</button>
      <button type="button" id="btn-clear-select" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Clear select</button>
    </div>
    <div id="map" style="width:100%;height:60vh;border-radius:8px"></div>
    <p id="readout" style="margin-top:.5rem;color:#4a5568;font-size:.875rem"></p>
    <p id="click-log" style="margin-top:.25rem;color:#1a365d;font-size:.875rem;font-family:monospace;white-space:pre-wrap"></p>
  </div>
`;

const levelsBar = document.querySelector<HTMLDivElement>('#levels')!;
const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const clickLog = document.querySelector<HTMLParagraphElement>('#click-log')!;
const pinpointInput = document.querySelector<HTMLInputElement>('#pinpoint-id')!;

let map: WemapMap | null = null;

function setReadout(extra = ''): void {
  if (!map) {
    return;
  }

  const c = map.getCenter();
  const highlighted = map.getPoiHighlighted().join(', ') || '—';
  const selected = map.getPoiSelected().join(', ') || '—';
  readout.textContent =
    `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · level: ${map.getLevel() ?? '—'} · highlighted: [${highlighted}] · selected: [${selected}]${extra ? ` · ${extra}` : ''}`;
}

function logClick(event: PoiClickEvent): void {
  pinpointInput.value = String(event.pinpoint.id);
  clickLog.textContent = [
    `id: ${event.pinpoint.id}`,
    `name: ${event.pinpoint.name}`,
    `externalId: ${event.externalId ?? '—'}`,
    `lngLat: ${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`,
  ].join('\n');
  setReadout();
}

function readPinpointId(): number | null {
  const value = Number(pinpointInput.value);

  return Number.isFinite(value) ? value : null;
}

async function main(): Promise<void> {
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  map = new WemapMap({ container: 'map' });

  map.on('move', () => setReadout());
  map.on('load', () => setReadout());
  map.onLevelChange((level) => {
    setActive(level);
    setReadout();
  });
  map.onPoiClick(logClick);

  const buttons = new Map<number, HTMLButtonElement>();
  const setActive = (active: number | null) => {
    for (const [lvl, btn] of buttons) {
      btn.style.background = lvl === active ? '#007bff' : '#fff';
      btn.style.color = lvl === active ? '#fff' : '#1a202c';
    }
  };

  map.onBuildingChange((building: Building | null) => {
    buttons.clear();
    levelsBar.replaceChildren();

    if (!building?.levels.length) {
      levelsBar.append(
        Object.assign(document.createElement('span'), { textContent: 'No building in view' })
      );

      return;
    }

    levelsBar.append(
      Object.assign(document.createElement('span'), { textContent: `${building.name} — level:` })
    );

    for (const lvl of [...building.levels].sort((a, b) => b.level - a.level)) {
      const btn = document.createElement('button');
      btn.textContent = lvl.short_name;
      btn.style.cssText =
        'padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff';
      btn.addEventListener('click', () => map?.setLevel(lvl.level));
      buttons.set(lvl.level, btn);
      levelsBar.append(btn);
    }

    setActive(map?.getLevel() ?? null);
  });

  document.querySelector('#btn-highlight')!.addEventListener('click', () => {
    const id = readPinpointId();

    if (id === null || !map) {
      setReadout('enter a valid pinpoint id');

      return;
    }

    map.setPoiHighlighted([...map.getPoiHighlighted(), id]);
    setReadout(`highlighted ${id}`);
  });

  document.querySelector('#btn-select')!.addEventListener('click', () => {
    const id = readPinpointId();

    if (id === null || !map) {
      setReadout('enter a valid pinpoint id');

      return;
    }

    map.setPoiSelected([...map.getPoiSelected(), id]);
    setReadout(`selected ${id}`);
  });

  document.querySelector('#btn-clear-highlight')!.addEventListener('click', () => {
    map?.setPoiHighlighted([]);
    setReadout('cleared highlight');
  });

  document.querySelector('#btn-clear-select')!.addEventListener('click', () => {
    map?.setPoiSelected([]);
    setReadout('cleared select');
  });
}

main().catch((error) => {
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
