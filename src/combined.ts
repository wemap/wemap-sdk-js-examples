/**
 * VPS navigation sample app — the SDK's indoor navigation loop end to end.
 *
 * It is written as a small product rather than a control panel: one screen, one
 * flow (scan → pick a destination → walk it), built to the `debug-design.pen`
 * screens that live next to this file.
 *
 * What it shows:
 * - `VPSLocationSource` for camera-based positioning, with its **background
 *   scan** left enabled so the fix is refreshed without asking the user
 *   (`onBackgroundScanStatusChange` drives the camera thumbnail badge);
 * - `onLocationStateChange` driving the whole UI's confidence signals — the
 *   status pill over the map, the rescan call to action, the drift banner, and
 *   the user marker itself, which changes colour and grows a halo as the fix
 *   degrades (see `styles.css`, `[data-location-state]`);
 * - `Router` + `ItineraryLayer` for the route, `MapMatching` to snap the pose
 *   onto it, and `ItineraryInfoManager` for turn-by-turn guidance;
 * - `@wemap/map` for the map itself: POI clicks pick a destination,
 *   `LevelControl` switches floors, and level sync follows the pose.
 */
import { CoreConfig } from '@wemap/core';
import {
  MapMatching,
  VPSLocationSource,
  requestSensorPermissions,
  type BackgroundScanStatus,
  type LocationState,
  type Pose,
} from '@wemap/positioning';
import { LevelControl } from '@wemap/map';
import { MapMatchingHandler } from '@wemap/providers';
import {
  Coordinates,
  ItineraryInfoManager,
  Router,
  type Itinerary,
  type Step,
} from '@wemap/routing';
import { ExampleMapStack } from './shared/ExampleMapStack';
import { readPose } from './shared/readPose';
import {
  describeLocationState,
  stepDistances,
  stepInstruction,
} from './combined/navigationFormat';
import { icon } from './combined/icons';
import {
  NavigationSheet,
  type DestinationView,
  type LevelOption,
  type NavigationView,
} from './combined/navigationSheet';
import { StatusPill } from './combined/statusPill';
import { SettingsSheet, type SettingsValues } from './combined/settingsSheet';
import { ScanView } from './combined/scanView';

/**
 * Arrival threshold, in metres of route still to walk — `ItineraryInfoManager`'s
 * `remainingDistance`, measured along the itinerary (plus the user's offset
 * from it), not a straight line to the destination. A destination one aisle
 * away is metres apart as the crow flies and a long way round on foot.
 */
const ARRIVAL_REMAINING_M = 4;

const ROUTE_STYLE = { color: '#4A9FD8', width: 8 } as const;
const ROUTE_STYLE_LOST = { color: '#9AA3AB', width: 8 } as const;

const DEFAULTS: SettingsValues = {
  emmid: '30763',
  token: 'WEMAP_TOKEN',
  useStrict: true,
};

// --- Shell ------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="nav-stage">
    <div id="map" class="nav-map"></div>
    <button type="button" id="btn-locate" class="nav-locate" title="Center on me" aria-label="Center on me">
      ${icon('crosshair', 20)}
    </button>
  </div>
`;

const stage = app.querySelector<HTMLElement>('.nav-stage')!;
const mapEl = app.querySelector<HTMLElement>('#map')!;
const locateBtn = app.querySelector<HTMLButtonElement>('#btn-locate')!;

// --- State ------------------------------------------------------------------

let settingsValues: SettingsValues = DEFAULTS;
let pose: Pose = {};
let running = false;
let scanning = false;
let scanError: { title: string; body: string } | null = null;
let locationState: LocationState = 'no_positioning';
/** The sheet's view of the destination, plus where it came from. */
type Destination = DestinationView & {
  position: Coordinates;
  /** Pinpoint id when the destination is a POI, `null` for a dropped pin. */
  poiId: number | null;
};

let destination: Destination | null = null;
let itinerary: Itinerary | null = null;
/** Along-route distance at each manoeuvre, rebuilt with every itinerary. */
let stepDistanceTable: Map<Step, number> = new Map();
let calculatingRoute = false;
let scanCancelled = false;
let error: string | null = null;

const core = new CoreConfig();
const router = new Router();
let itineraryInfo = new ItineraryInfoManager();

// `core.init()` first: both the map style and the VPS endpoint come from the
// livemap configuration, so nothing below can be built before it resolves.
try {
  await core.init({ emmid: DEFAULTS.emmid, token: DEFAULTS.token });
} catch (initError) {
  console.warn('[core] initialization failed:', initError);
  error = 'Could not load the livemap — check the credentials in Settings.';
}

/**
 * Build a location source and wire it to the UI.
 *
 * It is a function because the VPS endpoint is read from the livemap
 * configuration **when the source is constructed** — changing the venue in
 * Settings means building a new source, not reusing this one.
 *
 * Background scan stays on: it is the feature that keeps the fix fresh while
 * the user walks, without any interaction.
 */
function createVpsSource(): VPSLocationSource {
  const source = new VPSLocationSource({
    usePositionSmoother: true,
    useStrict: settingsValues.useStrict,
  });

  source.onUpdate((next) => {
    pose = next;
    mapStack.updatePose(next);
    requestRender();
  });

  source.onError((sourceError) => {
    console.error('[VPSLocationSource]', sourceError);
    error = sourceError.message;
    render();
  });

  source.onLocationStateChange((state) => {
    locationState = state;

    // A lost fix makes the drawn route a guess too — grey it to match the marker.
    if (itinerary) {
      mapStack.setRoute(itinerary, state === 'no_positioning' ? ROUTE_STYLE_LOST : ROUTE_STYLE);
    }

    render();
  });

  // A background scan runs with the camera hidden — the label is the only sign.
  source.onBackgroundScanStatusChange((status: BackgroundScanStatus) => {
    scanView.setScanLabel(status === 'scanning' ? 'Refreshing position…' : null);
  });

  return source;
}

// --- UI ---------------------------------------------------------------------

const sheet = new NavigationSheet(app, {
  onScan: () => void startScan(),
  onCancelScan: () => void cancelScan(),
  onGo: () => void computeRoute(),
  onClearDestination: clearDestination,
  onEnd: clearDestination,
  onDestinationLevelChange: (level) => {
    if (!destination) {
      return;
    }
    destination.level = level;
    destination.position = withLevel(destination.position, level);
    drawDestination();
    render();
  },
  onOpenSettings: () => settings.open(settingsValues),
});

const pill = new StatusPill(stage, () => void startScan());

function createScanView(): ScanView {
  return new ScanView({ container: stage, onCancel: () => void cancelScan() });
}

let scanView = createScanView();

const settings = new SettingsSheet(app, (values) => void applySettings(values));

// --- Map --------------------------------------------------------------------

function createMapStack(): ExampleMapStack {
  const created = new ExampleMapStack({ container: mapEl, followOnFirstFix: true });

  void created.wemapMap.whenReady().then(() => {
    created.wemapMap.addControl(new LevelControl(created.wemapMap));
  });

  created.wemapMap.onLevelChange(() => render());

  // A pinpoint click names the destination; a click on bare map drops one.
  created.wemapMap.onPoiClick(({ pinpoint, coordinates }) => {
    setDestination(new Coordinates(coordinates.lat, coordinates.lng, null, pinpoint.level ?? null), {
      name: pinpoint.name,
      detail: pinpoint.address ?? 'Point of interest',
      // The pinpoint knows which floor it is on — nothing to override.
      levelEditable: false,
      poiId: pinpoint.id,
    });
  });

  created.wemapMap.on('click', (event) => {
    const hitPinpoint = created.wemapMap.maplibre
      .queryRenderedFeatures(event.point)
      .some((feature) => 'pinpoint' in (feature.properties ?? {}));

    if (hitPinpoint) {
      return;
    }

    const level = created.wemapMap.getLevel();
    setDestination(new Coordinates(event.lngLat.lat, event.lngLat.lng, null, level), {
      name: 'Dropped pin',
      detail: `${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`,
      levelEditable: true,
      poiId: null,
    });
  });

  return created;
}

let mapStack = createMapStack();

locateBtn.addEventListener('click', () => {
  const position = currentPosition();
  if (position) {
    mapStack.wemapMap.flyTo({ center: position, zoom: 19, duration: 800 });
  }
});

/** Floors of the active building, newest design's select options. */
function levelOptions(): LevelOption[] {
  const building = mapStack.wemapMap.getCurrentBuilding();

  if (!building) {
    return [];
  }

  return [...building.levels]
    .sort((a, b) => b.level - a.level)
    .map((level) => ({ value: level.level, label: `Level ${level.short_name || level.level}` }));
}

/**
 * Show the destination on the map.
 *
 * A pinpoint is already drawn by the map style, so it is marked *selected*
 * (`setPoiSelected`) rather than covered with a marker of our own; anywhere
 * else gets a plain dropped pin.
 */
function drawDestination(): void {
  if (!destination) {
    return;
  }

  if (destination.poiId !== null) {
    mapStack.clearMarkers();
    mapStack.wemapMap.setPoiSelected([destination.poiId]);
    return;
  }

  mapStack.wemapMap.setPoiSelected([]);
  mapStack.setDestination(destination.position.lat, destination.position.lng, destination.level);
}

let vps = createVpsSource();

// --- Flow -------------------------------------------------------------------

function currentPosition(): Coordinates | null {
  const position = readPose(pose).position;
  return position
    ? new Coordinates(position.latitude, position.longitude, null, position.level)
    : null;
}

function withLevel(position: Coordinates, level: number | null): Coordinates {
  return new Coordinates(position.lat, position.lng, null, level);
}

/** A scan failure the sheet can present with the design's two-line notice. */
class ScanFailure extends Error {
  readonly title: string;

  constructor(title: string, body: string) {
    super(body);
    this.title = title;
  }
}

async function startScan(): Promise<void> {
  error = null;
  scanError = null;
  scanning = true;
  scanCancelled = false;
  render();

  try {
    // iOS gates motion/orientation sensors behind a user gesture — this runs
    // inside the scan button's click handler.
    if (!(await requestSensorPermissions())) {
      throw new ScanFailure(
        'Sensors unavailable',
        'Motion and orientation access is required to locate you.'
      );
    }

    await scanView.expand();

    if (!running) {
      await vps.start();
      running = true;
    }

    const located = await vps.startScan();

    if (scanCancelled) {
      return;
    }

    if (!located) {
      throw new ScanFailure(
        'Nothing recognisable in view',
        'Point at a shop front, a sign or a distinctive facade — blank walls and floors cannot be matched.'
      );
    }

    scanView.hide();
  } catch (caught) {
    console.error('[scan]', caught);
    scanError =
      caught instanceof ScanFailure
        ? { title: caught.title, body: caught.message }
        : { title: 'Scan failed', body: caught instanceof Error ? caught.message : String(caught) };
    await vps.stopScan();

    // Keep the viewfinder up so a retry is one tap away; a user who already
    // has a fix goes back to the map.
    if (currentPosition()) {
      scanView.hide();
    }
  } finally {
    scanning = false;
    render();
  }
}

async function cancelScan(): Promise<void> {
  scanCancelled = true;
  scanError = null;
  await vps.stopScan(true);
  scanning = false;

  scanView.hide();

  render();
}

function setDestination(
  position: Coordinates,
  labels: { name: string; detail: string; levelEditable: boolean; poiId: number | null }
): void {
  clearRoute();
  destination = {
    ...labels,
    level: typeof position.level === 'number' ? position.level : null,
    levelOptions: levelOptions(),
    position,
  };

  drawDestination();
  render();
}

function clearDestination(): void {
  clearRoute();
  destination = null;
  mapStack.clearMarkers();
  mapStack.wemapMap.setPoiSelected([]);
  render();
}

function clearRoute(): void {
  itinerary = null;
  stepDistanceTable = new Map();
  itineraryInfo = new ItineraryInfoManager();
  MapMatching.clearItinerary();
  mapStack.clearRoute();
}

async function computeRoute(): Promise<void> {
  const origin = currentPosition();

  if (!origin || !destination) {
    return;
  }

  calculatingRoute = true;
  error = null;
  render();

  try {
    const [best] = await router.directions(origin, destination.position, 'WALK');

    if (!best) {
      throw new Error('No walking route to that destination.');
    }

    itinerary = best;
    stepDistanceTable = stepDistances(best);
    // Snap incoming poses onto the route, and feed the same route to the
    // guidance manager that turns a position into "turn right in 12 m".
    MapMatching.setItinerary(best);
    itineraryInfo.itinerary = best;
    mapStack.setRoute(best, ROUTE_STYLE);
  } catch (routeError) {
    console.error('[router]', routeError);
    error = routeError instanceof Error ? routeError.message : String(routeError);
  } finally {
    calculatingRoute = false;
    render();
  }
}

async function applySettings(values: SettingsValues): Promise<void> {
  const emmidChanged = values.emmid !== settingsValues.emmid;
  const credentialsChanged = emmidChanged || values.token !== settingsValues.token;
  settingsValues = values;
  MapMatchingHandler.useStrict = values.useStrict;

  if (!credentialsChanged) {
    render();
    return;
  }

  try {
    await core.init({ emmid: values.emmid, token: values.token });
  } catch (initError) {
    console.warn('[core] re-init failed, keeping previous configuration:', initError);
    error = 'Could not apply those credentials.';
    render();
    return;
  }

  // The source resolved its VPS endpoint from the old livemap configuration at
  // construction, so new credentials need a new source — not just a new map.
  // Build it before disposing the old one: a missing endpoint throws here, and
  // a half-torn-down app would leave nothing to scan with.
  let replacement: VPSLocationSource;

  try {
    replacement = createVpsSource();
  } catch (sourceError) {
    console.error('[VPSLocationSource] could not be rebuilt:', sourceError);
    error = 'This livemap has no visual positioning configured.';
    render();
    return;
  }

  await vps.dispose();
  vps = replacement;

  // Everything the old venue produced is stale: the fix, the route, the camera.
  await scanView.destroy();
  scanView = createScanView();
  running = false;
  scanning = false;
  scanCancelled = true;
  scanError = null;
  pose = {};
  locationState = 'no_positioning';
  clearRoute();

  if (emmidChanged) {
    clearDestination();
    mapStack.destroy();
    mapStack = createMapStack();
  }

  render();
}

// --- Rendering --------------------------------------------------------------

function navigationView(): NavigationView | null {
  const position = currentPosition();

  if (!itinerary || !destination || !position) {
    return null;
  }

  const info = itineraryInfo.getInfo(position);

  if (!info) {
    return null;
  }

  const lost = locationState === 'no_positioning';
  const state = describeLocationState(locationState);

  const stepDistance = info.nextStep ? stepDistanceTable.get(info.nextStep) : undefined;

  return {
    instruction: stepInstruction(info.nextStep),
    // Metres of route left before the turn, not a straight line to it. A
    // position we no longer trust cannot honestly carry a "in 12 m" at all.
    distanceToStep:
      lost || stepDistance === undefined
        ? null
        : Math.max(0, stepDistance - info.traveledDistance),
    remainingDistance: info.remainingDistance,
    // `traveledPercentage` is a 0–1 ratio, not a percentage number.
    progress: info.traveledPercentage,
    arrived: !lost && info.remainingDistance < ARRIVAL_REMAINING_M,
    destinationName: destination.name,
    drift: state.suggestScan
      ? { tone: lost ? ('lost' as const) : ('degraded' as const), label: state.hint }
      : null,
  };
}

let renderScheduled = false;

/**
 * Coalesce UI updates to one per frame.
 *
 * `onUpdate` fires on every device-orientation event — around 60 times a
 * second — and rendering synchronously on each one leaves no main-thread time
 * for maplibre's gesture handling, which silently drops map taps.
 */
function requestRender(): void {
  if (renderScheduled) {
    return;
  }

  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function render(): void {
  // The map container carries the state, so the SDK's own user marker can be
  // restyled per state from CSS alone (`styles.css`, `[data-location-state]`).
  mapEl.dataset.locationState = running ? locationState : 'no_positioning';

  const state = describeLocationState(locationState);
  pill.render(state, running && !scanning, scanning);

  if (destination) {
    destination.levelOptions = levelOptions();
  }

  sheet.render({
    running,
    located: currentPosition() !== null,
    scanning,
    scanError,
    destination,
    calculatingRoute,
    navigation: navigationView(),
    currentLevel: mapStack.wemapMap.getLevel(),
    error,
  });

  locateBtn.disabled = currentPosition() === null;
}

render();


