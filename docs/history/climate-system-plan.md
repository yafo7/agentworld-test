# Climate System Implementation History

Status: archived and non-authoritative.

This document records the climate implementation milestone. Current ownership
and dependency rules are documented in `AGENTS.md` and
`docs/architecture.md`. The items in the final section are backlog ideas, not
approved work.

## Implemented Baseline

The ESC panel exposes two climate sources:

- `manual`: weather, hour (0-23), and month (1-12) remain deterministic for
  visual review.
- `realtime`: the browser clock supplies local date, hour, month, and timezone.
  Location is requested only after the player explicitly selects weather sync.

Both sources project through the provider-neutral `WorldClimateState` contract.
`WorldClimateSystem` coordinates mode, clock refresh, explicit location access,
weather lookup, place-name lookup, cache fallback, and presentation updates.

The presentation includes sky, fog, sun direction and intensity, hemisphere
lighting, seasonal tint, and local rain/snow particles. Climate does not mutate
world-object persistence or story time.

## Privacy And Failure Policy

- `BrowserClockAdapter` reads device time without requesting permission.
- `BrowserLocationAdapter` runs only after an explicit player action.
- Weather and place-name providers receive rounded coordinates through separate
  adapters.
- Coordinates are not persisted, cached, sent to AI, or included in analytics.
- `ClimateCache` stores weather without coordinates for 30 minutes.
- Provider, permission, and network failures use cached weather when valid and
  otherwise fall back to clear weather.
- The city label is session-only.

## Historical Design Shape

```text
manual controls ---------+
                         +-> WorldClimateState -> environment presentation
browser clock -----------+
explicit location action -> weather/place adapters
```

## Known Follow-Up Architecture Work

`WorldClimatePresenter` still inherits `ManualClimateController`, so the visual
adapter is not yet a fully pure presentation sink. That is migration debt, not
an invitation to create another climate state owner.

## Uncommitted Backlog Ideas

- A separate island calendar or effective-visit-day model.
- Lightweight pet reactions to weather and time.
- Additional night readability, emissive, and particle-quality tuning.

These ideas require explicit product scope before implementation.
