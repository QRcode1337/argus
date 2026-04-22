# Argus Repair & Refactor Plan

## Phase 1: Weather Radar & Map Overlay Fixes
- **Remove "ZOOM LEVEL NOT SUPPORTED"**: Locate all instances of this text/overlay in the codebase (likely in Cesium or Leaflet layers) and remove them completely to prevent them from ever reapplying.
- **Decouple Radar Toggle**: Fix the "weather reader/radar" toggle so that it no longer incorrectly controls the zoom overlay state.
- **Fix Rainviewer Integration**: Inspect the `Rainviewer` layer implementation. Ensure the tile URLs, timestamps, and layer configurations are correct so the satellite weather map renders over America properly again.

## Phase 2: UI Cleanup (Epic Fury Mode)
- **Remove Popups**: Delete or hide the Left Box and Bottom Box that appear when Epic Fury Mode is activated.
- **Consolidate Info**: Append the Epic Fury specific tracking information and data to the Primary Left Bar, integrating it smoothly with the existing UI instead of relying on overlays.

## Phase 3: Button Placement & News Navigation
- **Move GDELT Digest Button**: Locate the "PNEUMA" button in the UI components and move the "Generate GDELT Digest" button next to it. Ensure the layout and styling match.
- **News Navigation**: Update the onClick handler for news items. Extract the geolocation data (lat/lng or bounding box) from the news item and use the map API (Cesium `flyTo` or Leaflet `flyTo`/`panTo`) to navigate the camera to the covered region.
