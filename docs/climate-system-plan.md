# Chii Island Climate Plan

## Current Baseline

The ESC panel owns a manual climate mode with three independent controls:

- Weather: clear, cloudy, rain, snow, or fog.
- Hour: 0-23.
- Month: 1-12.

`WorldClimateSystem` owns the current climate state and mode. `WorldClimatePresenter` maps that state to sky color, fog, sun direction and intensity, hemisphere lighting, seasonal tint, and local rain/snow particles. The selected state is stored in browser-local settings and does not change world-object persistence or gameplay state.

## Implemented Real-World Sync

Keep one climate state contract and add a second state source instead of building a separate renderer path:

```text
Manual controls ─┐
                 ├─> ClimateState ─> environment presentation
Device time ─────┤
Location ────────┤
Weather adapter ─┘
```

Source modes:

- `manual`: current ESC values remain authoritative and make art/debug review reproducible.
- `realtime`: device time supplies date/hour/month/timezone; an explicitly permitted location and `OpenMeteoWeatherAdapter` supply local weather.

The realtime source gracefully falls back to cached weather or clear weather when geolocation, network access, or weather data is unavailable. The public API requires no browser credential. Coordinates are rounded for the request and are not persisted.

Calendar story progress and the visual clock remain separate. A chapter or island day may advance through gameplay without rewriting the real-world weather source.

Implemented boundaries:

1. Manual mode remains the visual acceptance baseline.
2. `WorldClimateState` is shared by manual and realtime sources.
3. `BrowserClockAdapter` synchronizes device time without requesting permission.
4. `BrowserLocationAdapter` runs only after an explicit UI action.
5. `WeatherPort` isolates Open-Meteo response and WMO-code mapping.
6. `ClimateCache` stores weather only, never coordinates.

## Next Milestones

1. Add `IslandCalendar` as a separate effective-visit-day and story clock.
2. Add lightweight weather/time reactions to pet bubbles and activity suggestions without hard-locking gameplay.
3. Tune night readability, tagged emissive objects, and particle quality as separate presentation work.
