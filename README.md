# Larili Atlas

The first MVP of a personal travel intelligence guide to Africa. It includes:

- an interactive map built from real country boundaries;
- a South Africa drill-down with nine province boundaries, six highlighted regions and 29 point destinations;
- map layers for travel score, women’s safety, running infrastructure, LGBTQ+ friendliness, self-drive, remote work, and nature;
- search, visa access, a daily-budget slider, grouped map-focus layers, month suitability, and grouped sorting by every available parameter across 55 detailed profiles;
- 70 source fields per profile, covering travel, logistics, health, digital work, budgets, and activities;
- English-normalized country context, highlights, constraints, visas, health, transport, and connectivity fields;
- monthly suitability plus 1991–2020 average daytime highs for a capital or main travel hub;
- sourced women’s-safety and LGBTQ+ equality indicators, plus a transparent running-infrastructure composite;
- map modes for every scored field, budget, suggested stay, population, area, daytime temperature, and religion mix;
- device-local favorites;
- quick comparison for up to three countries;
- responsive desktop and mobile layouts.

Selecting South Africa opens the country map at the same size as the Africa map. Destination markers open place cards with access, connectivity, difficulty, accessibility, 4×4 guidance, suggested time, nearby combinations, local imagery and an editorial world-class score.

Run locally:

```bash
python3 -m http.server 8000
```

The site is then available at `http://127.0.0.1:8000/`.

Country profiles are maintained directly in `data/countries.json`. The file is the runtime source of truth and does not require an import or build step.

Refresh the local South Africa destination images from Wikipedia/Wikimedia:

```bash
python3 scripts/fetch_south_africa_images.py \
  data/south-africa-destinations.json \
  assets/places/za
```

Country boundaries and temperature reference points use Natural Earth data. Monthly daytime highs use NASA POWER MERRA-2 climatology. Women’s scores use the Georgetown WPS Index 2025/26; LGBTQ+ scores use the 2026 Equaldex Equality Index and legal-status data processed by Our World in Data. Running infrastructure is an editorial composite of roads, tourist ease, safety, heat comfort, and maps/payments. Visa and other dynamic travel data must be rechecked before booking.
