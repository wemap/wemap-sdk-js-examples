/**
 * MapLibre GL JS v6 bootstrap, shared by every page that mounts a map.
 *
 * v6 ships its worker as a separate ES module that in turn imports a shared
 * chunk (`maplibre-gl-shared.mjs`), and resolves both internally via
 * `import.meta.url`. Bundlers can't follow that, so the map fails at runtime
 * with a 404 (`maplibre-gl-worker.mjs`, or `maplibre-gl-shared.mjs` once the
 * worker loads). Handing MapLibre the worker URL explicitly fixes it: Vite's
 * `?worker&url` bundles the worker — inlining the shared chunk into a single
 * self-contained asset — and returns its final URL. (Plain `?url` is not
 * enough: it emits the worker verbatim, leaving the shared import to 404.)
 *
 * Import this for its side effects before the first `new maplibregl.Map(...)`.
 * It also pulls in the MapLibre stylesheet so pages only need this one import.
 */
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
// `@wemap/map` ships its styles as a separate stylesheet (the library build
// extracts CSS rather than injecting it), so consumers must import it once.
// Doing it here means every page that mounts a map gets the marker, cluster and
// user-location styling. Without this the styles only appear in dev (where the
// aliased source `index.ts` side-effect-imports them) and vanish from the
// production bundle once tree-shaking drops that import.
import '@wemap/map/style.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
