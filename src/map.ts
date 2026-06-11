/**
 * Example page for the @wemap/map package
 *
 * Demonstrates the WemapMap wrapper with snippet-driven indoor:
 * - map parameters (style, bounds, zoom range, …) come from the livemap snippet
 *   via @wemap/core
 * - when `indoor.enable` is true, the map fetches buildings for the viewport,
 *   selects the current one, and switches to its default level
 * - a floor switcher is built from the active building's levels
 *
 * The map used here is the livemap `30265` ("Carte des bureaux test"), whose
 * single building "bureaux" exposes levels 0 and 1.
 */
import { core, type Building } from '@wemap/core';
import { WemapMap } from '@wemap/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '30265';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — Indoor levels</h1>
    <p>Livemap <strong>${EMMID}</strong>. Buildings & levels follow the map as it moves (snippet <code>indoor.enable</code>).</p>
    <div id="levels" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
      <span>No building in view</span>
    </div>
    <div id="map" style="width:100%;height:70vh;border-radius:8px;margin-top:1rem"></div>
    <p id="readout" style="margin-top:.5rem;color:#4a5568;font-size:.875rem"></p>
  </div>
`;

const levelsBar = document.querySelector<HTMLDivElement>('#levels')!;
const readout = document.querySelector<HTMLDivElement>('#readout')!;

async function main(): Promise<void> {
  // Fetch + parse the livemap snippet; map parameters come straight from it.
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  const map = new WemapMap({ container: 'map' });

  // Camera readout on every move.
  const updateReadout = () => {
    const c = map.getCenter();
    readout.textContent =
      `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · zoom: ${map.getZoom().toFixed(1)} · level: ${map.getLevel() ?? '—'}`;
  };
  map.on('move', updateReadout);
  map.on('load', updateReadout);

  // Highlight the active level button as the level changes.
  const buttons = new Map<number, HTMLButtonElement>();
  const setActive = (active: number | null) => {
    for (const [lvl, btn] of buttons) {
      btn.style.background = lvl === active ? '#007bff' : '#fff';
      btn.style.color = lvl === active ? '#fff' : '#1a202c';
    }
  };
  map.onLevelChange((level) => {
    setActive(level);
    updateReadout();
  });

  // Rebuild the floor switcher whenever the active building changes.
  map.onBuildingChange((building: Building | null) => {
    buttons.clear();
    levelsBar.replaceChildren();

    if (!building || !building.levels.length) {
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
      btn.addEventListener('click', () => map.setLevel(lvl.level));
      buttons.set(lvl.level, btn);
      levelsBar.append(btn);
    }

    setActive(map.getLevel());
  });
}

main().catch((error) => {
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
