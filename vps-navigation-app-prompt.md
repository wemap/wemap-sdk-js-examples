# Prompt: build a Wemap VPS indoor navigation app

Paste everything below the line into the agent that will build the app. It is
written to be framework-agnostic; the last section pins it to the Wemap
JavaScript SDK when that is the target.

The reference implementation of this spec is `apps/examples/combined.html` +
`apps/examples/src/combined.ts` in `wemap-sdk-js`.

---

## What you are building

A single-screen mobile navigation app for **indoor** venues (malls, stations,
airports, campuses). The user opens it, scans their surroundings with the
camera, picks a destination on a map, and walks there with turn-by-turn
guidance. It must feel like a finished consumer app, not a debug console: no
raw coordinate dumps, no `alert()`, no wall of toggles.

## Background you need before designing the flow

**VPS (Visual Positioning System)** locates the user from a **camera image**.
The device sends a photo of the surroundings to a server, which matches it
against a 3D map of the venue and returns a precise position *and* a heading.
This is how indoor positioning works where GPS does not: inside a building GPS
is unusable (tens of metres of error, or nothing at all), and the venue's floor
plan needs metre-level accuracy to be useful.

Three consequences shape the entire UX:

1. **The camera is the sensor.** Locating requires the user to point the camera
   at the environment. A scan works on visually distinctive things — signs,
   shop fronts, facades, architectural detail. It fails on blank walls, floors,
   ceilings, crowds and darkness. The UI must ask for the right gesture
   ("sweep slowly across signs and shop fronts"), not just spin a loader.
2. **A fix decays as the user walks.** Between scans, position is carried by
   **PDR** (pedestrian dead reckoning — step detection from the phone's motion
   sensors) plus the device's compass. PDR drifts: the further the user walks
   since the last camera fix, the less the position can be trusted. The app
   must therefore express *confidence*, not just position.
3. **Scanning can happen without the user.** A **background scan** re-runs VPS
   on its own every ~30 s while the app is open, silently refreshing the fix.
   For that to work the camera must stay **running** — but it does not have to
   stay *visible*. Capture never goes through layout (frames are drawn from the
   video's intrinsic size, and no calibration is derived from the displayed
   one), so a `display: none` preview still feeds the scan. Hide the camera
   between scans and show a small label while one runs, so the user knows the
   camera is working without a preview taking up the screen.

**Location state** is the SDK's own summary of confidence, derived from the
distance walked since the last successful scan. Three values, and the whole UI
reacts to them:

| State | Meaning | What the UI does |
| --- | --- | --- |
| `accurate` | Fresh fix | Brand-coloured user marker, calm UI |
| `degraded` | Drifted since the last scan | Amber marker with a pulsing halo, "Approximate position" + a **Rescan** call to action |
| `no_positioning` | Position no longer trustworthy | Grey marker, no heading cone, "Position lost" + rescan |

Also in play:

- **Map matching** snaps the (noisy) position onto the computed route, so the
  user marker follows the corridor instead of cutting through walls.
- **Indoor levels**: the venue map has floors. The displayed floor follows the
  user's own floor automatically; a floor switcher lets them look elsewhere.
  A route can cross floors (stairs, elevators, escalators) and the guidance must
  say so ("Take the stairs up to level 2").

## The user flow

One screen. Map fills everything above a bottom sheet; the camera surface
floats over the map. The bottom sheet is a small state machine — exactly one
card at a time.

### 1. Welcome (nothing started)

- Sheet: title, one sentence explaining that the camera locates them, one
  primary button **"Scan to locate me"**, plus a discreet **Settings** button.
- Map is live and pannable already.

### 2. Scanning

- Tapping scan asks for motion/orientation permission **inside the tap
  handler** (iOS only grants it from a user gesture), then starts the camera.
- The camera surface expands to fill the map area: live preview, a viewfinder
  frame, a one-line instruction ("Hold the phone upright and sweep slowly across
  signs, shop fronts and facades"), and a **×** to cancel.
- Sheet mirrors the state ("Scanning your surroundings…"). No progress bar —
  the duration is unpredictable.
- **Success**: the camera surface is hidden — the camera itself keeps running
  for the background scan — the map flies to the user, and the marker appears.
- **Failure**: an inline error in the sheet, phrased as something to *do*
  ("Nothing recognisable in view — try a more detailed scene"), camera stays
  expanded so a retry is one tap away. Never an alert dialog.
- **Cancel**: no error at all; the camera surface goes away.

### 3. Pick a destination

- Sheet: "Pick a destination — tap a point of interest on the map, or anywhere
  on it to drop a custom destination."
- Tapping a **point of interest** selects it: the card shows its name, address,
  and its floor as **read-only** text — the venue already knows which floor the
  POI is on, so the user must not be asked to correct it.
- Tapping **empty map** drops a pin: the card shows the coordinates and an
  **editable** floor field (the only place a floor is worth asking about, since
  a bare coordinate carries none).
- A destination may be picked *before* the user has located themselves. Do not
  refuse the tap: show the destination card with its primary button reading
  **"Scan to locate me"** instead of "Start navigation".

### 4. Navigating

- Primary button computes a walking route from the current position to the
  destination, draws it on the map, frames it once (and never again — later
  updates must not fight the user's panning), and enables map matching.
- Sheet becomes the guidance card:
  - a large manoeuvre icon + instruction ("Turn right onto Hall B", "Take the
    elevator up to level 2", "Arrive at your destination");
  - distance to that manoeuvre ("In 12 m");
  - a progress bar;
  - remaining distance and walking time;
  - **End navigation**.
- Everything above refreshes on each position update.
- The status pill stays visible throughout: if the state degrades mid-route, the
  pill turns amber and offers **Rescan**, and the marker changes with it. This
  is the single most important interaction in the app — a user who has drifted
  must be nudged, not silently misled.
- Tapping the status pill at any time starts a new scan.
- While a background scan runs, show a small label ("Refreshing position…") and
  nothing else. No preview, no camera taking over the screen; it must not
  interrupt.

### 5. Arrival

- Under ~8 m of route still to walk — the distance remaining *along the
  itinerary*, never a straight-line radius to the destination — replace the
  guidance card with "You have arrived" and a
  single **Done** button that clears the route and the destination.

## Rules that are not negotiable

- **Never stop the camera** while positioning is on — the VPS request loop
  breaks out the moment the camera is no longer `started`, and a cold start
  costs a second of unusable auto-exposure frames. Hiding the preview
  (`display: none`) is fine; stopping the stream is not.
- **Errors are inline and actionable**, in the sheet. No alerts, no error codes,
  no stack traces in the UI (log those to the console).
- **The location state drives three surfaces at once**: the user marker, the
  status pill, and whether a rescan is offered. Never show a confident blue dot
  for a degraded fix.
- **One card at a time** in the sheet. A destination card and guidance card must
  never be on screen together.
- **Touch targets ≥ 44 px**, safe-area padding at the bottom, layout sized in
  `dvh` so the sheet is not hidden by mobile browser chrome.
- **Respect `prefers-reduced-motion`**: no pulsing halo for those users.
- Settings (venue id, API token, strict map matching) live behind a **Settings**
  button, not on the main screen. They exist for demos, not for end users.
  Changing the venue or token **rebuilds the positioning source**, not just the
  map: the VPS endpoint is read from the venue configuration when the source is
  constructed, so an old source keeps scanning against the old venue.

## Explicitly out of scope

Search, favourites, accounts, offline maps, AR arrows in the camera view,
multi-stop routes, accessibility-mode routing (wheelchair), analytics. Keep the
app to the one flow above.

