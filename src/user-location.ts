/**
 * Smoke-test page for UserLocationLayer (map-002 manual QA).
 *
 * Livemap 30265 — simulates pose updates with buttons (no real positioning).
 */
import { core, CoreConfig, type Building } from '@wemap/core';
import { WemapMap, IndoorController, UserLocationLayer } from '@wemap/map';
import type { UserLocationUpdate } from '@wemap/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '30265';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — UserLocationLayer</h1>
    <p>Livemap <strong>${EMMID}</strong>. Simulated pose stream for manual QA (map-002).</p>
    <div id="levels" class="section" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.75rem 0;position:relative;z-index:2">
      <span>Loading map…</span>
    </div>
    <div id="controls" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;position:relative;z-index:2"></div>
    <div id="map" style="width:100%;height:60vh;border-radius:8px"></div>
    <p id="readout" style="margin-top:.5rem;color:#4a5568;font-size:.875rem"></p>
    <p id="status" style="margin-top:.25rem;color:#2d3748;font-size:.875rem;font-weight:500"></p>
  </div>
`;

const levelsBar = document.querySelector<HTMLDivElement>('#levels')!;
const controls = document.querySelector<HTMLDivElement>('#controls')!;
const readout = document.querySelector<HTMLDivElement>('#readout')!;
const status = document.querySelector<HTMLDivElement>('#status')!;

type AppState = {
  map: WemapMap;
  user: UserLocationLayer;
  mapReady: boolean;
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

function applyPose(label: string, update: UserLocationUpdate): void {
  if (!state) {
    setStatus('Map still loading…');

    return;
  }

  if (!state.mapReady) {
    setStatus('Map style not ready yet…');

    return;
  }

  state.user.update(update);
  setStatus(`Applied: ${label} · map level ${state.map.getLevel() ?? '—'}`);
  updateReadout();
}

function updateReadout(): void {
  if (!state) {
    return;
  }

  const c = state.map.getCenter();
  readout.textContent =
    `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · zoom: ${state.map.getZoom().toFixed(1)} · map level: ${state.map.getLevel() ?? '—'}`;
}

const poseL0: UserLocationUpdate = {
  position: { lat: 43.609092, lng: 3.91722, level: 0 },
  attitude: { headingDegrees: 45 },
};
const poseL1: UserLocationUpdate = {
  position: { lat: 43.60909, lng: 3.9172, level: 1 },
  attitude: { headingDegrees: 200 },
};
const poseOutdoor: UserLocationUpdate = {
  position: { lat: 43.60892, lng: 3.91708 },
  attitude: { headingDegrees: 90 },
};

controls.append(
  makeButton('Pose floor 0', () => applyPose('pose floor 0', poseL0)),
  makeButton('Pose floor 1', () => applyPose('pose floor 1', poseL1)),
  makeButton('Pose no level', () => applyPose('pose no level', poseOutdoor)),
  makeButton('Heading only (90°)', () => applyPose('heading 90°', { attitude: { headingDegrees: 90 } }))
);

async function main(): Promise<void> {
  setStatus('Initializing livemap…');
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  const map = new WemapMap({
    container: 'map',
    ...CoreConfig.getMapOptions(),
  });

  const user = new UserLocationLayer(map, {
    syncLevel: true,
    showHeading: true,
    followOnFirstFix: true,
  });

  state = { map, user, mapReady: false };

  const indoor = new IndoorController(map, { autoSetLevel: true });

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
    setStatus('Map ready — use pose buttons or pick a floor');
    user.update(poseL0);
    updateReadout();
  });

  indoor.onBuildingChange((building: Building | null) => {
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
