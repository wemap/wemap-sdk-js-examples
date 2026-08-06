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
 * - the user's location via `GnssWifiLocationSource` (`@wemap/positioning`)
 *   streaming poses into `UserLocationLayer`
 * - clicking the empty map drops a runtime marker (`DomMarkerLayer`) with a
 *   popup, from which the same directions can be requested
 * - walking directions from the user to the selected POI or dropped pin
 *   (`Router`, `ItineraryLayer`)
 * - a Home control that restores the initial view and clears transient state
 * - indoor levels: built-in opt-in `LevelControl` + `onLevelChange` readout
 */
import { core, boundsToDelta, type GeocodingResult, type Pinpoint } from '@wemap/core';
import { BoundingBox, Coordinates } from '@wemap/geo';
import {
  WemapMap,
  LevelControl,
  UserLocationLayer,
  ItineraryLayer,
  DomMarkerLayer,
  type UserLocationAttitude,
} from '@wemap/map';
import { Router, type Itinerary } from '@wemap/routing';
import { GnssWifiLocationSource } from '@wemap/positioning';
import * as maplibregl from 'maplibre-gl';
import { readPose } from './shared/readPose';
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
      interest, click a pinpoint to see its details, or click anywhere on the
      map to drop a pin.
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

  // The user's blue dot, the route line, and runtime DOM markers (dropped pin).
  const userLocation = new UserLocationLayer(map, { showHeading: true, accuracyRing: true });
  const itinerary = new ItineraryLayer(map);
  const markers = new DomMarkerLayer(map);

  // Initial camera, captured once, so the Home control can restore it.
  const initialCenter = map.getCenter();
  const initialZoom = map.getZoom();

  // Last known user position (browser Geolocation), reused as the route origin.
  let userPosition: Coordinates | null = null;
  // The POI currently shown in the card, so async route results target it.
  let selectedPinpoint: Pinpoint | null = null;
  // The dropped-pin popup, when one is open.
  let droppedPopup: maplibregl.Popup | null = null;

  const DROPPED_PIN_ID = 'dropped-pin';

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

  // --- Directions (shared by the POI card and the dropped-pin popup) --------

  /** Compute a walking route from the user's position to a destination. */
  async function computeWalkingRoute(destination: Coordinates): Promise<Itinerary> {
    const origin = await ensureUserPosition();
    const [best] = await router.directions(origin, destination, 'WALK');
    if (!best) {
      throw new Error('No route found');
    }
    return best;
  }

  /** Draw a computed route and align the map to its destination level. */
  function drawRoute(best: Itinerary): void {
    itinerary.set(best, { fitBounds: true });

    // A multilevel route is split into per-level features; the indoor filter
    // only hides the other floors once a level is active. With no active level
    // (the default), every floor's segment renders at once. Select the route's
    // destination level — taken from the route itself, since a POI's declared
    // `level` can be null even when the path crosses floors — so the route
    // reads one floor at a time (LevelControl switches between them).
    const destinationLevel = best.destination?.level;
    if (typeof destinationLevel === 'number') {
      map.setLevel(destinationLevel);
    }
  }

  function routeErrorMessage(): string {
    return userPosition
      ? 'Could not find a route.'
      : 'Location unavailable — allow location access to get directions.';
  }

  /**
   * Run the directions flow for one "info surface" (POI card or dropped-pin
   * popup): disable its button, show progress, draw the route, and print the
   * summary — bailing if the surface was replaced/closed mid-request.
   */
  async function runDirections(
    root: HTMLElement,
    destination: Coordinates,
    isStale: () => boolean
  ): Promise<void> {
    const button = root.querySelector<HTMLButtonElement>('.poi-card__directions');
    const setInfo = (text: string, isError = false): void => {
      const info = root.querySelector<HTMLParagraphElement>('.poi-card__route');
      if (info) {
        info.hidden = false;
        info.className = isError ? 'poi-card__route poi-card__route--error' : 'poi-card__route';
        info.textContent = text;
      }
    };

    if (button) {
      button.disabled = true;
    }
    setInfo('Getting directions…');

    try {
      const best = await computeWalkingRoute(destination);
      if (isStale()) {
        return;
      }
      drawRoute(best);
      setInfo(`${formatDuration(best.duration)} walk · ${formatDistance(best.distance)}`);
    } catch (error) {
      console.error('Directions failed:', error);
      if (!isStale()) {
        setInfo(routeErrorMessage(), true);
      }
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  function routeToSelectedPinpoint(): Promise<void> {
    const target = selectedPinpoint;
    if (!target) {
      return Promise.resolve();
    }

    // Carry the POI's indoor level into the destination so the router can build
    // the correct multilevel path.
    const destination = new Coordinates(
      target.latitude,
      target.longitude,
      null,
      target.level ?? null
    );

    return runDirections(poiCard, destination, () => selectedPinpoint?.id !== target.id);
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
      .addEventListener('click', () => void routeToSelectedPinpoint());
  }

  function selectPinpoint(pinpoint: Pinpoint, options: { fly: boolean }): void {
    // The POI card and dropped-pin popup are mutually exclusive info surfaces.
    clearDroppedPin();
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

  // --- Dropped pin (DomMarkerLayer + popup) ---------------------------------

  /** Remove the dropped marker and its popup, if any. */
  function clearDroppedPin(): void {
    // Popup 'close' handler removes the marker; guard against re-entry.
    const popup = droppedPopup;
    droppedPopup = null;
    popup?.remove();
    markers.remove(DROPPED_PIN_ID);
  }

  /** Drop a runtime marker at a clicked location with a popup + directions. */
  function dropPin(position: Coordinates): void {
    // The dropped pin and the POI card are mutually exclusive info surfaces.
    map.setPoiSelected([]);
    hidePoiCard();
    itinerary.clear();
    clearDroppedPin();

    markers.add({ id: DROPPED_PIN_ID, position, color: '#e11d48' });

    const content = document.createElement('div');
    content.className = 'map-drop-popup';
    content.innerHTML = `
      <p class="map-drop-popup__title">Dropped pin</p>
      <p class="map-drop-popup__address">${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}</p>
      <button type="button" class="poi-card__directions">🚶 Directions</button>
      <p class="poi-card__route" hidden></p>
    `;

    // Enrich the coordinate readout with a reverse-geocoded address.
    void geocoding
      .reverseGeocode(position.lat, position.lng)
      .then((place) => {
        const addr = content.querySelector<HTMLParagraphElement>('.map-drop-popup__address');
        if (place && addr && content.isConnected) {
          addr.textContent = place.placeName;
        }
      })
      .catch(() => {});

    content
      .querySelector<HTMLButtonElement>('.poi-card__directions')!
      .addEventListener('click', () => {
        // Stale once the popup content is detached (pin replaced or closed).
        void runDirections(content, position, () => !content.isConnected);
      });

    const popup = new maplibregl.Popup({ offset: 36, closeOnClick: false })
      .setLngLat([position.lng, position.lat])
      .setDOMContent(content)
      .addTo(map.maplibre);
    popup.on('close', () => {
      markers.remove(DROPPED_PIN_ID);
      if (droppedPopup === popup) {
        droppedPopup = null;
      }
    });
    droppedPopup = popup;
  }

  // Clicking empty map (no pinpoint under the cursor) drops a pin. Pinpoint
  // clicks are detected the same way the SDK does — a `pinpoint` feature
  // property — and left to onPoiClick above.
  map.on('click', (event) => {
    const hitPinpoint = map.maplibre
      .queryRenderedFeatures(event.point)
      .some((feature) =>
        Object.prototype.hasOwnProperty.call(feature.properties ?? {}, 'pinpoint')
      );
    if (hitPinpoint) {
      return;
    }
    dropPin(new Coordinates(event.lngLat.lat, event.lngLat.lng));
  });

  // --- User location (via @wemap/positioning) -------------------------------

  // GNSS/WiFi positioning source. It streams SDK `Pose` updates (GPS + PDR,
  // smoothed) that feed the UserLocationLayer — the SDK's own positioning
  // pipeline rather than a raw `navigator.geolocation` call.
  const locationSource = new GnssWifiLocationSource();

  let locationStarted = false;
  // Callers awaiting the next fix (e.g. directions requested before we have one).
  let fixWaiters: {
    resolve: (position: Coordinates) => void;
    reject: (error: unknown) => void;
  }[] = [];

  locationSource.onUpdate((pose) => {
    const position = readPose(pose).position;
    const attitude = readPose(pose).attitude as UserLocationAttitude | undefined;
    if (!position) {
      return;
    }

    userPosition = new Coordinates(
      position.latitude,
      position.longitude,
      null,
      position.level
    );
    userLocation.update({ position: userPosition, accuracy: position.accuracy, attitude });
    btnLocate.classList.add('map-control--active');

    const waiters = fixWaiters;
    fixWaiters = [];
    for (const waiter of waiters) {
      waiter.resolve(userPosition);
    }
  });

  locationSource.onError((error) => {
    console.error('Location error:', error);
    // Only surface as a failure while we have no fix at all; transient errors
    // once positioning is live are ignored.
    if (!userPosition) {
      const waiters = fixWaiters;
      fixWaiters = [];
      for (const waiter of waiters) {
        waiter.reject(error);
      }
      readout.textContent = 'Location unavailable — check location permissions.';
    }
  });

  /** Resolve the user's position, starting the source and awaiting a fix if needed. */
  async function ensureUserPosition(): Promise<Coordinates> {
    if (userPosition) {
      return userPosition;
    }

    const fix = new Promise<Coordinates>((resolve, reject) => {
      fixWaiters.push({ resolve, reject });
    });

    if (!locationStarted) {
      locationStarted = true;
      await locationSource.start();
    }

    return fix;
  }

  /** Start positioning (if needed) and fly to the user's location. */
  async function locate(): Promise<void> {
    btnLocate.disabled = true;
    try {
      const position = await ensureUserPosition();
      map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 16), duration: 900 });
    } finally {
      btnLocate.disabled = false;
    }
  }

  btnLocate.addEventListener('click', () => {
    void locate().catch((error) => {
      console.error('Location failed:', error);
      readout.textContent = 'Location unavailable — check location permissions.';
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
    clearDroppedPin();
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
        { padding: 48, duration: 900 }
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
