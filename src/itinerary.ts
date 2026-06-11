/**
 * Smoke-test page for ItineraryLayer (map-004 manual QA).
 *
 * Livemap 30265 — calculate a multilevel indoor route and switch floors.
 */
import { core, type Building } from '@wemap/core';
import { WemapMap, ItineraryLayer } from '@wemap/map';
import { Router, type Itinerary } from '@wemap/routing';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '30265';

/** Destination offset from map center (outdoor point southwest of origin on 30265). */
const DESTINATION_OFFSET = {
  dLat: 43.60901 - 43.60907,
  dLng: 3.91658 - 3.91708,
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — ItineraryLayer</h1>
    <p>Livemap <strong>${EMMID}</strong>. Multilevel route with floor filtering (map-004).</p>
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
const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

type AppState = {
  map: WemapMap;
  route: ItineraryLayer;
  router: Router;
  currentItinerary: Itinerary | null;
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

function getRouteEndpoints(map: WemapMap) {
  const center = map.getCenter();
  const level = map.getLevel() ?? 1;

  return {
    origin: { lat: center.lat, lng: center.lng, level },
    destination: {
      lat: center.lat + DESTINATION_OFFSET.dLat,
      lng: center.lng + DESTINATION_OFFSET.dLng,
    },
  };
}

async function fetchItinerary(): Promise<Itinerary> {
  const { map, router } = state!;
  const { origin, destination } = getRouteEndpoints(map);
  const itineraries = await router.directions(origin, destination, 'WALK');

  if (!itineraries.length) {
    throw new Error('No route found');
  }

  return itineraries[0];
}

function updateReadout(): void {
  if (!state) {
    return;
  }

  const c = state.map.getCenter();
  const { origin, destination } = getRouteEndpoints(state.map);
  const points = state.currentItinerary?.coords.length ?? 0;
  readout.textContent =
    `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · zoom: ${state.map.getZoom().toFixed(1)} · map level: ${state.map.getLevel() ?? '—'} · route: ${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)} (L${origin.level ?? '—'}) → ${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}${points ? ` · ${points} pts` : ''}`;
}

controls.append(
  makeButton('Calculate route (fitBounds)', async () => {
    setStatus('Calculating route…');

    const itinerary = await fetchItinerary();
    state!.currentItinerary = itinerary;
    state!.route.set(itinerary, { fitBounds: true });
    setStatus(`Route drawn (${itinerary.coords.length} points)`);
    updateReadout();
  }),
  makeButton('Redraw (no fitBounds)', () => {
    if (!state?.currentItinerary) {
      setStatus('Calculate a route first');

      return;
    }

    state.route.set(state.currentItinerary);
    setStatus('Route redrawn without camera change');
  }),
  makeButton('Style: red / width 8', () => {
    if (!state?.currentItinerary) {
      setStatus('Calculate a route first');

      return;
    }

    state.route.set(state.currentItinerary, { color: '#ff0000', width: 8 });
    setStatus('Route style updated (red, width 8)');
  }),
  makeButton('Clear route', () => {
    state!.currentItinerary = null;
    state!.route.clear();
    setStatus('Route cleared');
    updateReadout();
  })
);

async function main(): Promise<void> {
  setStatus('Initializing livemap…');
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  const map = new WemapMap({ container: 'map' });

  const route = new ItineraryLayer(map);
  const router = new Router();

  state = { map, route, router, currentItinerary: null };

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
    setStatus('Map ready — calculate a multilevel route');
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
