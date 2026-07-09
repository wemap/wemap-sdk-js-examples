/**
 * Smoke-test page for content search — search API + POI visibility whitelist.
 */
import { boundsToDelta, core, type PinpointManager } from '@wemap/core';
import { WemapMap } from '@wemap/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMMID = '31668';
const EVENT_LOG_LIMIT = 12;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-container">
    <h1>@wemap/map — Content search</h1>
    <p>Livemap <strong>${EMMID}</strong>. Search pinpoints, filter the map, click for full entity.</p>
    <div id="controls" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.75rem 0;position:relative;z-index:2">
      <input id="search-query" type="search" placeholder="Search pinpoints…" style="min-width:14rem;padding:.4rem .6rem;border:1px solid #cbd5e0;border-radius:4px" />
      <button type="button" id="btn-search" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Search</button>
      <button type="button" id="btn-clear" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Clear filter</button>
      <button type="button" id="btn-hide-all" style="padding:.4rem .8rem;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;background:#fff">Hide all</button>
    </div>
    <div id="map" style="width:100%;height:60vh;border-radius:8px"></div>
    <p id="readout" style="margin-top:.5rem;color:#4a5568;font-size:.875rem"></p>
    <div style="display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:.75rem">
      <section style="border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;background:#f8fafc">
        <h2 style="font-size:.9rem;margin:0 0 .5rem 0;color:#1a365d">Search results</h2>
        <p id="search-meta" style="margin:0 0 .35rem 0;color:#4a5568;font-size:.8rem">No search yet.</p>
        <pre id="search-results-log" style="margin:0;max-height:180px;overflow:auto;color:#1f2937;font-size:.75rem;font-family:monospace;white-space:pre-wrap"></pre>
      </section>
      <section style="border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;background:#f8fafc">
        <h2 style="font-size:.9rem;margin:0 0 .5rem 0;color:#1a365d">Pinpoint cache</h2>
        <p id="cache-meta" style="margin:0 0 .35rem 0;color:#4a5568;font-size:.8rem"></p>
        <pre id="cache-log" style="margin:0;max-height:180px;overflow:auto;color:#1f2937;font-size:.75rem;font-family:monospace;white-space:pre-wrap"></pre>
      </section>
      <section style="border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;background:#f8fafc">
        <h2 style="font-size:.9rem;margin:0 0 .5rem 0;color:#1a365d">Events</h2>
        <pre id="event-log" style="margin:0;max-height:180px;overflow:auto;color:#1f2937;font-size:.75rem;font-family:monospace;white-space:pre-wrap"></pre>
      </section>
    </div>
    <p id="click-log" style="margin-top:.25rem;color:#1a365d;font-size:.875rem;font-family:monospace;white-space:pre-wrap"></p>
  </div>
`;

const readout = document.querySelector<HTMLParagraphElement>('#readout')!;
const clickLog = document.querySelector<HTMLParagraphElement>('#click-log')!;
const searchMeta = document.querySelector<HTMLParagraphElement>('#search-meta')!;
const searchResultsLog = document.querySelector<HTMLPreElement>('#search-results-log')!;
const cacheMeta = document.querySelector<HTMLParagraphElement>('#cache-meta')!;
const cacheLog = document.querySelector<HTMLPreElement>('#cache-log')!;
const eventLog = document.querySelector<HTMLPreElement>('#event-log')!;
const searchInput = document.querySelector<HTMLInputElement>('#search-query')!;

let map: WemapMap | null = null;
let pinpointManager: PinpointManager | null = null;
let latestSearchItems: Array<{ id: number; name: string }> = [];
const events: string[] = [];

function pushEvent(message: string): void {
  events.unshift(`${new Date().toLocaleTimeString()} · ${message}`);
  events.splice(EVENT_LOG_LIMIT);
  eventLog.textContent = events.join('\n');
}

function renderSearchResults(): void {
  if (!latestSearchItems.length) {
    searchMeta.textContent = 'No result set.';
    searchResultsLog.textContent = '';

    return;
  }

  searchMeta.textContent = `${latestSearchItems.length} result(s) in current set`;
  searchResultsLog.textContent = latestSearchItems
    .map((item, index) => `${index + 1}. #${item.id} — ${item.name}`)
    .join('\n');
}

function renderCache(): void {
  const entries = pinpointManager?.getLoadedPinpoints() ?? [];
  const cachedBbox = pinpointManager?.getCachedBbox() ?? null;

  cacheMeta.textContent = `Loaded in cache: ${entries.length}`;
  cacheLog.textContent = [
    cachedBbox
      ? `cachedBbox: [${cachedBbox.toArray().map((v: number) => v.toFixed(5)).join(', ')}]`
      : 'cachedBbox: none',
    '',
    ...entries.slice(0, 50).map((item) => `#${item.id} — ${item.name}`),
    ...(entries.length > 50 ? [`... and ${entries.length - 50} more`] : []),
  ].join('\n');
}

function setReadout(extra = ''): void {
  if (!map) {
    return;
  }

  const visible = map.getPoiVisible();
  const visibleLabel =
    visible === null ? 'all' : visible.length ? `[${visible.join(', ')}]` : '[]';

  readout.textContent =
    `level: ${map.getLevel() ?? '—'} · visible: ${visibleLabel}${extra ? ` · ${extra}` : ''}`;
}

async function runSearch(): Promise<void> {
  if (!map || !pinpointManager) {
    return;
  }

  const query = searchInput.value.trim();

  if (!query) {
    setReadout('enter a search term');

    return;
  }

  setReadout('searching…');

  try {
    const { items } = await pinpointManager.search({
      query,
      ...boundsToDelta(map.getBounds()),
      level: map.getLevel() ?? undefined,
    });

    latestSearchItems = items.map((item) => ({ id: item.id, name: item.name }));
    renderSearchResults();
    map.setPoiVisible(items.map((item) => item.id));
    renderCache();
    pushEvent(`search "${query}" -> ${items.length} result(s)`);
    setReadout(`${items.length} result(s)`);
  } catch (error) {
    pushEvent(`search error "${query}"`);
    setReadout(`search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  await core.init({ emmid: EMMID, token: 'WEMAP_TOKEN' });
  pinpointManager = core.createPinpointManager();
  map = new WemapMap({ container: 'map' });

  map.on('moveend', () => {
    setReadout();
    renderCache();
    pushEvent('map moveend');
  });
  map.on('load', () => {
    setReadout();
    renderCache();
    pushEvent('map load');
  });
  map.onLevelChange((level) => {
    setReadout(`level changed to ${level ?? '—'}`);
    renderCache();
    pushEvent(`level change -> ${level ?? '—'}`);
  });
  map.onPoiClick((event) => {
    clickLog.textContent = [
      `id: ${event.pinpoint.id}`,
      `name: ${event.pinpoint.name}`,
      `address: ${event.pinpoint.address ?? '—'}`,
      `lngLat: ${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`,
    ].join('\n');
    renderCache();
    pushEvent(`poi click #${event.pinpoint.id} (${event.pinpoint.name})`);
  });

  document.querySelector('#btn-search')!.addEventListener('click', () => {
    void runSearch();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      void runSearch();
    }
  });
  document.querySelector('#btn-clear')!.addEventListener('click', () => {
    map?.setPoiVisible(null);
    pushEvent('filter cleared (visible = null)');
    setReadout('filter cleared');
  });
  document.querySelector('#btn-hide-all')!.addEventListener('click', () => {
    map?.setPoiVisible([]);
    pushEvent('filter set to [] (hide all)');
    setReadout('all hidden');
  });

  renderSearchResults();
  renderCache();
}

main().catch((error) => {
  readout.textContent = `Failed to load example: ${error.message}`;
  console.error(error);
});
