# Wemap SDK Examples

This directory contains interactive examples demonstrating the features and capabilities of the Wemap SDK for JavaScript. You can find the examples live [here](https://wemap-sdk-js.pages.dev/).

## Overview

These examples showcase various aspects of the Wemap SDK including:
- **@wemap/map**: Snippet-driven maps, indoor levels, and end-to-end navigation via `ExampleMapStack`
- **Location Sources**: GNSS/WiFi and VPS (Visual Positioning System) positioning
- **Map Matching**: Projecting user positions onto routes for accurate navigation
- **Routing**: Route calculation, itinerary management, and navigation

Internal smoke-test harnesses (per-feature manual QA) live in [`apps/debug`](../debug/README.md) and are not published to integrators.

## Getting Started

### Prerequisites

- Node.js
- npm or yarn
- A Wemap account with:
  - An map ID
  - An authentication token

### Installation

```bash
# Install dependencies (this will install the Wemap SDK packages from npm)
npm install
```

That's it!

### Running the Examples

Start the development server:

```bash
npm run dev
```

This will start a local development server (typically at `http://localhost:4200`). Open your browser and navigate to the examples index page.

## Available Examples

### 🎯 Location Sources

#### GNSS WiFi Location Source
**File**: `gnss-location-source.html`

Demonstrates GPS and WiFi-based positioning for outdoor navigation. This example shows:
- GNSS location tracking with WiFi assistance
- Real-time position updates
- PDR (Pedestrian Dead Reckoning) integration
- Optional attitude tracking

**Use Case**: Outdoor navigation, GPS-based tracking

#### VPS Location Source
**File**: `vps-location-source.html`

Test Visual Positioning System (VPS) location source with camera-based positioning. Features:
- Camera-based visual positioning
- Indoor navigation capabilities
- VPS combined with PDR and attitude tracking
- Real-time pose updates (position and orientation)

**Use Case**: Indoor navigation, camera-based positioning

### 🗺️ Map Matching

#### Map Matching
**File**: `map-matching.html`

Example demonstrating map matching functionality for aligning GPS coordinates with map paths. Shows:
- Projecting user positions onto predefined routes
- Route alignment and correction
- Navigation along matched routes

**Use Case**: Improving GPS accuracy by matching positions to known routes

### 🧭 Routing

#### Routing
**File**: `routing.html`

Example demonstrating routing and navigation features including:
- Route calculation between origin and destination
- Multiple travel modes (walking, driving, transit)
- Itinerary management
- Turn-by-turn directions
- Navigation utilities
- PMR (People with Reduced Mobility) support

**Use Case**: Route planning, navigation

### 🔄 Combined Features

#### Combined Features (VPS) — primary `@wemap/map` integration demo
**File**: `combined.html`

Test VPS location source, routing, and navigation with `WemapMap`, `UserLocationLayer`, `DomMarkerLayer`, and `ItineraryLayer` via the shared `ExampleMapStack` helper. This comprehensive example includes:
- VPS location tracking
- Route calculation
- Map matching integration
- Real-time navigation
- Interactive map interface

**Use Case**: Complete indoor navigation solution

#### Combined Features (GNSS)
**File**: `combined-gnss.html`

Test GNSS location source, routing, and navigation features together in a unified interface. Features:
- GNSS/WiFi location tracking
- Route calculation and navigation
- Map matching
- Complete outdoor navigation solution

**Use Case**: Complete outdoor navigation solution

### 🗺️ Map basics

#### Map & Indoor Levels
**File**: `map.html`

Demonstrates `WemapMap` with snippet-driven style, bounds, and indoor floor switching via `setLevel` / `onBuildingChange`.

**Use Case**: Getting started with `@wemap/map`

## Debug harnesses (internal)

Per-feature smoke pages (`user-location`, `dom-marker`, `itinerary`, `poi-interaction`, `content-search`) were moved to [`apps/debug`](../debug/README.md) for SDK manual QA. They are not synced to the public examples repository.

## Configuration

Before running the examples, you need to configure your Wemap credentials. Each example file includes initialization code that you should update:

```typescript
await core.init({
  emmid: 'YOUR_MAP_ID',      // Your map ID
  token: 'YOUR_TOKEN',      // Your authentication token
});
```

Replace `YOUR_MAP_ID` and `YOUR_TOKEN` with your actual Wemap credentials.

## Project Structure

```
.
├── index.html              # Examples index page
├── *.html                  # Individual example pages
├── src/
│   ├── *.ts               # TypeScript source files for each example
│   └── shared/            # ExampleMapStack — shared @wemap/map wiring
├── styles.css             # Shared styles
├── package.json           # Dependencies and scripts
├── package-lock.json      # Dependency lock file
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
```

## SDK Packages Used

These examples utilize the following Wemap SDK packages:

- **@wemap/core**: Core SDK initialization and configuration
- **@wemap/map**: Map wrapper, indoor levels, user location, markers, routes, POI interaction
- **@wemap/positioning**: Location sources and map matching
- **@wemap/routing**: Route calculation and navigation
- **@wemap/camera**: Camera access for VPS features

## Development

### Local Development

The examples use Vite for fast development with hot module replacement. When you run `npm run dev`, changes to the source files will automatically reload in the browser.

### TypeScript

All examples are written in TypeScript but you can use plain JavaScript if you want.

## Troubleshooting

### Camera Not Working
- Ensure you're using HTTPS or localhost
- Check browser permissions for camera access
- Verify camera is not being used by another application

### Device heading not updating
- Ensure you're using a device with a compass
- Check browser permissions for sensor access

### Location Not Updating
- Check browser location permissions
- Ensure GPS/location services are enabled on your device
- For VPS, ensure good lighting and clear visual features

### Route Calculation Fails
- Verify your EMMID and token are correct
- Check network connectivity
- Ensure origin and destination coordinates are valid

## Documentation

For detailed API documentation, visit the main Wemap SDK repository:
- [Wemap SDK Documentation](https://developers.getwemap.com/docs/web/js-sdk/getting-started)

## License

These examples are part of the Wemap SDK and follow the same license as the main SDK.

## Support

For issues, questions, please [contact us](https://getwemap.com/contact)

