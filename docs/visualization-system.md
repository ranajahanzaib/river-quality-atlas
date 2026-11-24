# Visualization system

The interface uses restrained dark and light palettes, compact source labels and tabular numerals for measurements. The map uses MapLibre GL JS with OpenStreetMap tile attribution and a deck.gl ScatterplotLayer. Station requests are restricted to the visible viewport and capped at 8,000 points; users can zoom into dense areas. The station directory and search are accessible alternatives to point selection.

Concentration and discharge are drawn in an SVG scatter plot. Both axes use log coordinates for positive values. Source-flagged points receive a distinct color and a tooltip preserves date, source flag, unit and detection limit. The chart reports paired observations and the number excluded from positive log coordinates. No lines are drawn between sampling dates.

Dark and light themes are switchable and persisted locally. Reduced-motion preferences are respected. The map remains dependent on network tile access; the rest of the application can display source data state without a basemap.
