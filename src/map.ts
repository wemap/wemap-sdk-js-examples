/**
 * Integrator-facing showcase for the @wemap/map package.
 *
 * Built around one realistic flow — a map with a search box and a POI card —
 * instead of a wall of demo buttons:
 * - WemapMap creation from snippet defaults (`core.init` + `new WemapMap`)
 * - a single search field that queries BOTH the geocoder (places) and the
 *   livemap pinpoints (`core.createGeocodingService`, `core.createPinpointManager`)
 * - picking a place fits/flies the camera there (`fitBounds`, `flyTo`)
 * - matched pinpoints are highlighted on the map (`setPoiHighlighted`)
 * - clicking a pinpoint (on the map or in the results) selects it
 *   (`onPoiClick`, `setPoiSelected`) and opens a floating info card
 * - the user's location via the browser Geolocation API (`UserLocationLayer`)
 * - walking directions from the user to the selected POI (`Router`,
 *   `ItineraryLayer`)
 * - a Home control that restores the initial view and clears transient state
 * - indoor levels: built-in opt-in `LevelControl` + `onLevelChange` readout
 */
import { core, boundsToDelta, type GeocodingResult, type Pinpoint } from '@wemap/core';
import { BoundingBox, Coordinates } from '@wemap/geo';
import { WemapMap, LevelControl, UserLocationLayer, ItineraryLayer } from '@wemap/map';
import { Router } from '@wemap/routing';
import './shared/maplibreSetup';

const EMMID = '31668';
const SEARCH_DEBOUNCE_MS = 300;
const MAX_RESULTS = 6;

// Wide bounds so the pinpoint search covers the whole livemap, not just the
// current viewport — matches what a user expects from a global search box.
const WORLD_BOUNDS = new BoundingBox(
  new Coordinates(85, 170),
  new Coordinates(-85, -170)
);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — Feature showcase</h1>
    <p>
      Livemap <strong>${EMMID}</strong>. Search for a place or a point of
      interest, or click a pinpoint on the map to see its details.
    </p>

    <div class="map-stage">
      <div class="map-search">
        <input
          id="search-input"
          class="map-search__input"
          type="search"
          autocomplete="off"
          placeholder="Search places or points of interest…"
          aria-label="Search places or points of interest"
        />
        <ul id="search-results" class="map-search__results" hidden></ul>
      </div>

      <div id="map" class="map-container"></div>

      <div class="map-controls">
        <button
          type="button"
          id="btn-home"
          class="map-control"
          title="Reset to initial view"
          aria-label="Reset to initial view"
        >⌂</button>
        <button
          type="button"
          id="btn-locate"
          class="map-control"
          title="Show my location"
          aria-label="Show my location"
        >◎</button>
      </div>

      <aside id="poi-card" class="poi-card" hidden></aside>
    </div>

    <p id="readout" style="margin-top:.75rem;color:#4a5568;font-size:.875rem"></p>
  </div>
`;

const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const searchInput = document.querySelector<HTMLInputElement>('#search-input')!;
const searchResults = document.querySelector<HTMLUListElement>('#search-results')!;
const poiCard = document.querySelector<HTMLElement>('#poi-card')!;
const btnHome = document.querySelector<HTMLButtonElement>('#btn-home')!;
const btnLocate = document.querySelector<HTMLButtonElement>('#btn-locate')!;

/** Format a distance in metres for display. */
function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

/** Format a duration in seconds for display. */
function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

async function main(): Promise<void> {
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });

  const map = new WemapMap({ container: 'map' });
  await map.whenReady();

  const geocoding = core.createGeocodingService({ language: 'en' });
  const pinpoints = core.createPinpointManager();
  const router = new Router();

  // The user's blue dot, and the route line from the user to a selected POI.
  const userLocation = new UserLocationLayer(map, { showHeading: false });
  const itinerary = new ItineraryLayer(map);

  // Initial camera, captured once, so the Home control can restore it.
  const initialCenter = map.getCenter();
  const initialZoom = map.getZoom();

  // Last known user position (browser Geolocation), reused as the route origin.
  let userPosition: Coordinates | null = null;
  // The POI currently shown in the card, so async route results target it.
  let selectedPinpoint: Pinpoint | null = null;

  const updateReadout = () => {
    const c = map.getCenter();
    readout.textContent = [
      `center: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`,
      `zoom: ${map.getZoom().toFixed(1)}`,
      `level: ${map.getLevel() ?? '—'}`,
      `highlighted: [${map.getPoiHighlighted().join(', ') || '—'}]`,
      `selected: [${map.getPoiSelected().join(', ') || '—'}]`,
    ].join(' · ');
  };

  map.onLevelChange(updateReadout);
  map.on('move', updateReadout);
  map.on('load', updateReadout);
  updateReadout();

  // Built-in opt-in indoor level switcher.
  map.addControl(new LevelControl(map));

  // --- POI selection card ---------------------------------------------------

  function hidePoiCard(): void {
    selectedPinpoint = null;
    poiCard.hidden = true;
    poiCard.innerHTML = '';
  }

  async function routeToSelectedPinpoint(): Promise<void> {
    const target = selectedPinpoint;
    if (!target) {
      return;
    }

    const button = poiCard.querySelector<HTMLButtonElement>('.poi-card__directions');
    const routeInfo = poiCard.querySelector<HTMLParagraphElement>('.poi-card__route');
    if (button) {
      button.disabled = true;
    }
    if (routeInfo) {
      routeInfo.className = 'poi-card__route';
      routeInfo.textContent = 'Getting directions…';
    }

    try {
      const origin = await ensureUserPosition();
      // Carry the POI's indoor level into the destination so the router can
      // build the correct multilevel path.
      const destination = new Coordinates(
        target.latitude,
        target.longitude,
        null,
        target.level ?? null
      );
      const [best] = await router.directions(origin, destination, 'WALK');

      // A newer selection may have replaced the card while we awaited.
      if (selectedPinpoint?.id !== target.id) {
        return;
      }

      if (!best) {
        throw new Error('No route found');
      }

      itinerary.set(best, { fitBounds: true });

      // A multilevel route is split into per-level features; the indoor filter
      // only hides the other floors once a level is active. With no active
      // level (the default), every floor's segment renders at once. Select the
      // route's destination level — taken from the route itself, since a POI's
      // declared `level` can be null even when the path crosses floors — so the
      // route reads one floor at a time (LevelControl switches between them).
      const destinationLevel = best.destination?.level;
      const displayLevel =
        typeof destinationLevel === 'number'
          ? destinationLevel
          : typeof target.level === 'number'
            ? target.level
            : null;
      if (displayLevel !== null) {
        map.setLevel(displayLevel);
      }

      const info = poiCard.querySelector<HTMLParagraphElement>('.poi-card__route');
      if (info) {
        info.className = 'poi-card__route';
        info.textContent = `${formatDuration(best.duration)} walk · ${formatDistance(
          best.distance
        )}`;
      }
    } catch (error) {
      console.error('Directions failed:', error);
      const info = poiCard.querySelector<HTMLParagraphElement>('.poi-card__route');
      if (info && selectedPinpoint?.id === target.id) {
        info.className = 'poi-card__route poi-card__route--error';
        info.textContent =
          error instanceof GeolocationPositionError || !userPosition
            ? 'Location unavailable — allow location access to get directions.'
            : 'Could not find a route.';
      }
    } finally {
      const btn = poiCard.querySelector<HTMLButtonElement>('.poi-card__directions');
      if (btn) {
        btn.disabled = false;
      }
    }
  }

  function showPoiCard(pinpoint: Pinpoint): void {
    const badges: string[] = [];
    if (pinpoint.level !== null && pinpoint.level !== undefined) {
      badges.push(`Level ${pinpoint.level}`);
    }
    for (const tag of pinpoint.tags ?? []) {
      badges.push(tag);
    }

    poiCard.innerHTML = `
      <button type="button" class="poi-card__close" aria-label="Close">×</button>
      ${
        pinpoint.image_url
          ? `<img class="poi-card__image" src="${escapeHtml(pinpoint.image_url)}" alt="" />`
          : ''
      }
      <div class="poi-card__body">
        <h3 class="poi-card__name">${escapeHtml(pinpoint.name)}</h3>
        ${
          badges.length
            ? `<div class="poi-card__meta">${badges
                .map((b) => `<span class="poi-card__badge">${escapeHtml(b)}</span>`)
                .join('')}</div>`
            : ''
        }
        ${
          pinpoint.address
            ? `<p class="poi-card__address">${escapeHtml(pinpoint.address)}</p>`
            : ''
        }
        ${
          pinpoint.description
            ? `<p class="poi-card__description">${escapeHtml(pinpoint.description)}</p>`
            : ''
        }
        <div class="poi-card__actions">
          <button type="button" class="poi-card__directions">🚶 Directions</button>
        </div>
        <p class="poi-card__route" hidden></p>
        <p class="poi-card__footer">#${pinpoint.id}</p>
      </div>
    `;
    poiCard.hidden = false;

    poiCard
      .querySelector<HTMLButtonElement>('.poi-card__close')!
      .addEventListener('click', () => {
        map.setPoiSelected([]);
        itinerary.clear();
        hidePoiCard();
        updateReadout();
      });

    poiCard
      .querySelector<HTMLButtonElement>('.poi-card__directions')!
      .addEventListener('click', () => {
        const info = poiCard.querySelector<HTMLParagraphElement>('.poi-card__route');
        if (info) {
          info.hidden = false;
        }
        void routeToSelectedPinpoint();
      });
  }

  function selectPinpoint(pinpoint: Pinpoint, options: { fly: boolean }): void {
    selectedPinpoint = pinpoint;
    itinerary.clear();
    map.setPoiSelected([pinpoint.id]);

    if (options.fly) {
      if (pinpoint.level !== null && pinpoint.level !== undefined) {
        map.setLevel(pinpoint.level);
      }
      map.flyTo({
        center: new Coordinates(pinpoint.latitude, pinpoint.longitude),
        zoom: Math.max(map.getZoom(), 18),
        duration: 900,
      });
    }

    showPoiCard(pinpoint);
    updateReadout();
  }

  // Requirement 3: clicking a pinpoint on the map selects it (no camera move —
  // the user is already looking at it).
  map.onPoiClick((event) => {
    selectPinpoint(event.pinpoint, { fly: false });
  });

  // --- User location --------------------------------------------------------

  function getCurrentPosition(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(new Coordinates(pos.coords.latitude, pos.coords.longitude)),
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  /** Resolve the user's position, requesting it from the browser if needed. */
  async function ensureUserPosition(): Promise<Coordinates> {
    if (userPosition) {
      return userPosition;
    }
    return locate();
  }

  /** Fetch the browser position, drop the user marker, and fly to it. */
  async function locate(): Promise<Coordinates> {
    btnLocate.disabled = true;
    try {
      const position = await getCurrentPosition();
      userPosition = position;
      userLocation.update({ position });
      btnLocate.classList.add('map-control--active');
      map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 16), duration: 900 });
      return position;
    } finally {
      btnLocate.disabled = false;
    }
  }

  btnLocate.addEventListener('click', () => {
    void locate().catch((error) => {
      console.error('Location failed:', error);
      readout.textContent = 'Location unavailable — check browser location permissions.';
    });
  });

  // --- Home (restore the initial view + clear transient state) --------------

  btnHome.addEventListener('click', () => {
    searchInput.value = '';
    hideResults();
    map.setPoiHighlighted([]);
    map.setPoiSelected([]);
    itinerary.clear();
    hidePoiCard();
    map.flyTo({ center: initialCenter, zoom: initialZoom, duration: 900 });
    updateReadout();
  });

  // --- Search (geocoding + pinpoints) --------------------------------------

  function hideResults(): void {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
  }

  function selectPlace(result: GeocodingResult): void {
    if (result.bbox) {
      const [west, south, east, north] = result.bbox;
      map.fitBounds(
        new BoundingBox(new Coordinates(north, east), new Coordinates(south, west)),
        { padding: 48 }
      );
    } else {
      map.flyTo({
        center: new Coordinates(result.latitude, result.longitude),
        zoom: Math.max(map.getZoom(), 15),
        duration: 900,
      });
    }
    hideResults();
  }

  function renderStatus(message: string): void {
    searchResults.innerHTML = `<li class="map-search__status">${escapeHtml(message)}</li>`;
    searchResults.hidden = false;
  }

  function renderResults(places: GeocodingResult[], pois: Pinpoint[]): void {
    if (places.length === 0 && pois.length === 0) {
      renderStatus('No results');
      return;
    }

    searchResults.innerHTML = '';

    if (pois.length > 0) {
      const title = document.createElement('li');
      title.className = 'map-search__group-title';
      title.textContent = 'Points of interest';
      searchResults.appendChild(title);

      for (const poi of pois) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-search__item';
        button.innerHTML = `${escapeHtml(poi.name)}${
          poi.address
            ? `<span class="map-search__item-sub">${escapeHtml(poi.address)}</span>`
            : ''
        }`;
        button.addEventListener('click', () => {
          hideResults();
          selectPinpoint(poi, { fly: true });
        });
        li.appendChild(button);
        searchResults.appendChild(li);
      }
    }

    if (places.length > 0) {
      const title = document.createElement('li');
      title.className = 'map-search__group-title';
      title.textContent = 'Places';
      searchResults.appendChild(title);

      for (const place of places) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-search__item';
        button.textContent = place.placeName;
        button.addEventListener('click', () => {
          selectPlace(place);
        });
        li.appendChild(button);
        searchResults.appendChild(li);
      }
    }

    searchResults.hidden = false;
  }

  async function runSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      hideResults();
      map.setPoiHighlighted([]);
      updateReadout();
      return;
    }

    renderStatus('Searching…');

    const [places, poiResult] = await Promise.all([
      geocoding.searchMultiple(trimmed).catch((error) => {
        console.error('Geocoding search failed:', error);
        return [] as GeocodingResult[];
      }),
      pinpoints
        .search({ ...boundsToDelta(WORLD_BOUNDS), query: trimmed, limit: MAX_RESULTS })
        .then((response) => response.items)
        .catch((error) => {
          console.error('Pinpoint search failed:', error);
          return [] as Pinpoint[];
        }),
    ]);

    // Requirement 2: highlight the matched pinpoints on the map.
    map.setPoiHighlighted(poiResult.map((p) => p.id));
    updateReadout();

    // A newer keystroke may have cleared the field while we awaited.
    if (searchInput.value.trim() !== trimmed) {
      return;
    }

    renderResults(places.slice(0, MAX_RESULTS), poiResult);
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    const value = searchInput.value;
    searchTimer = setTimeout(() => void runSearch(value), SEARCH_DEBOUNCE_MS);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideResults();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    if (target && !searchInput.contains(target) && !searchResults.contains(target)) {
      hideResults();
    }
  });
}

main().catch((error) => {
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
