from __future__ import annotations

import json
import math
import re
import unittest
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]


class CountryDatabaseTests(unittest.TestCase):
    def test_country_database_is_the_direct_runtime_source(self) -> None:
        payload = json.loads((ROOT / "data" / "countries.json").read_text(encoding="utf-8"))

        self.assertEqual(payload["meta"]["source"], "Larili Atlas curated country dataset")
        self.assertIn("Edit this file directly", payload["meta"]["maintenance"])
        self.assertEqual(payload["meta"]["countryCount"], len(payload["countries"]))

    def test_country_database_has_no_cyrillic_content(self) -> None:
        content = (ROOT / "data" / "countries.json").read_text(encoding="utf-8")

        self.assertIsNone(re.search(r"[А-Яа-яЁё]", content))

    def test_no_country_data_build_pipeline_remains(self) -> None:
        maintained_scripts = {
            path.name for path in (ROOT / "scripts").glob("*.py") if path.is_file()
        }

        self.assertEqual(maintained_scripts, {"fetch_south_africa_images.py"})


class ProfileEnrichmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        payload = json.loads((ROOT / "data" / "countries.json").read_text(encoding="utf-8"))
        cls.countries = payload["countries"]

    def test_every_country_has_new_scores(self) -> None:
        self.assertEqual(len(self.countries), 55)
        for country in self.countries:
            for field in ("womenSafety", "runningInfrastructure", "gayFriendly"):
                with self.subTest(country=country["iso2"], field=field):
                    self.assertIsInstance(country[field], (int, float))
                    self.assertGreaterEqual(country[field], 0)
                    self.assertLessEqual(country[field], 10)
            self.assertTrue(country["sameSexActs"])

    def test_visa_placeholders_are_resolved(self) -> None:
        for country in self.countries:
            with self.subTest(country=country["iso2"]):
                self.assertNotEqual(country["visaRussia"], "Check current rules")
                self.assertNotEqual(country["visaChile"], "Check current rules")

    def test_south_africa_is_visa_free_for_both_passports(self) -> None:
        south_africa = next(country for country in self.countries if country["iso2"] == "ZA")
        self.assertEqual(south_africa["visaRussiaScore"], 10)
        self.assertEqual(south_africa["visaChileScore"], 10)
        self.assertIn("Visa-free", south_africa["visaRussia"])

    def test_new_scores_are_available_as_map_focus_options(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        for field in ("womenSafety", "runningInfrastructure", "gayFriendly"):
            with self.subTest(field=field):
                self.assertIn(f'value="{field}"', html)
                self.assertIn(f"{field}:", script)

    def test_daytime_temperature_uses_cool_to_hot_color_direction(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn(
            "100 - ((daytimeTemperature(country) - minimum) / (maximum - minimum)) * 100",
            script,
        )


class SouthAfricaDestinationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = json.loads(
            (ROOT / "data" / "south-africa-destinations.json").read_text(encoding="utf-8")
        )
        cls.destinations = cls.payload["destinations"]
        cls.airports = cls.payload["airports"]

    def test_south_africa_has_at_least_twenty_destinations(self) -> None:
        self.assertGreaterEqual(len(self.destinations), 20)
        self.assertEqual(self.payload["meta"]["destinationCount"], len(self.destinations))
        self.assertGreaterEqual(sum(place["kind"] == "region" for place in self.destinations), 5)

    def test_every_destination_has_a_must_visit_priority(self) -> None:
        scores = self.payload["mustVisitScores"]
        self.assertEqual(set(scores), {place["id"] for place in self.destinations})
        self.assertLessEqual(min(scores.values()), 4.5)
        self.assertGreaterEqual(max(scores.values()), 9.5)
        for place_id, score in scores.items():
            with self.subTest(place=place_id):
                self.assertGreaterEqual(score, 0)
                self.assertLessEqual(score, 10)

    def test_destination_cards_have_complete_planning_data(self) -> None:
        required = {
            "gettingThere", "connectivity", "connectivityScore", "difficulty",
            "difficultyScore", "accessibility", "accessibilityScore", "fourByFour",
            "recommendedTime", "combineWith", "worldClass", "image", "sourceUrl",
        }
        identifiers = {place["id"] for place in self.destinations}
        self.assertEqual(len(identifiers), len(self.destinations))
        for place in self.destinations:
            with self.subTest(place=place["id"]):
                self.assertFalse(required - set(place))
                self.assertTrue(set(place["combineWith"]) <= identifiers)
                self.assertTrue((ROOT / place["image"]).is_file())
                self.assertGreaterEqual(place["worldClass"]["score"], 0)
                self.assertLessEqual(place["worldClass"]["score"], 10)

    def test_drakensberg_and_durban_have_expanded_place_coverage(self) -> None:
        identifiers = {place["id"] for place in self.destinations}
        expected = {
            "royal-natal-amphitheatre",
            "cathedral-peak-didima",
            "monks-cowl",
            "giants-castle",
            "ushaka-marine-world",
            "moses-mabhida",
            "umhlanga-promenade",
            "durban-botanic-gardens",
        }
        self.assertTrue(expected <= identifiers)
        for place in self.destinations:
            if place["id"] in expected:
                with self.subTest(place=place["id"]):
                    self.assertGreaterEqual(len(place["gettingThere"]), 180)

    def test_four_by_four_need_uses_green_to_red_scale(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("function fourByFourNeedScore", script)
        self.assertIn("'4×4 need'", script)
        self.assertIn("scoreColor(100 - fourByFourScore * 10)", script)
        self.assertIn("Green: not needed · red: required", script)

    def test_empty_four_by_four_fact_is_hidden_but_useful_notes_remain(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        royal_natal = next(
            place for place in self.destinations if place["id"] == "royal-natal-amphitheatre"
        )
        self.assertIn("function shouldShowFourByFour", script)
        self.assertIn("['not required', 'not applicable', 'no 4×4']", script)
        self.assertIn("const fourByFourFact = shouldShowFourByFour", script)
        self.assertIn("high clearance can help", royal_natal["fourByFour"])

    def test_place_names_link_to_google_maps(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("function googleMapsUrl", script)
        self.assertIn("https://www.google.com/maps/search/?api=1&query=", script)
        self.assertIn("Open ${escapeHtml(place.name)} in Google Maps", script)

    def test_place_hover_uses_collision_aware_smooth_map_focus(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("function southAfricaSafeZoom", script)
        self.assertIn("function southAfricaLabelsOverlap", script)
        self.assertIn("requestAnimationFrame(tick)", script)
        self.assertIn("marker.addEventListener('pointerenter'", script)
        self.assertIn("resetSouthAfricaViewBox", script)
        self.assertIn("centered ? 0.5 : horizontalAnchor", script)
        self.assertIn("x: centered ? targetX", script)
        self.assertIn("y: centered ? targetY", script)
        self.assertIn("focusSouthAfricaPlace(selectedPlace.id, pinLayout, true)", script)
        self.assertIn("if (state.selectedPlaceId) return;", script)
        self.assertIn("southAfricaFocusPoint = null;\n    els.mapFocusClose.hidden = true;", script)
        self.assertIn("duration = 1050", script)
        self.assertIn("animateSouthAfricaViewBox(southAfricaBaseViewBox, 1250)", script)
        self.assertIn("if (state.mapNavigationMode === 'auto' && !state.selectedPlaceId) resetSouthAfricaViewBox()", script)
        self.assertIn("function distanceToSegment", script)
        self.assertIn("function releaseDistantSouthAfricaHover", script)
        self.assertIn("manualMapDrag?.dragging || state.selectedPlaceId", script)
        self.assertIn("distanceToSegment(pointer, southAfricaHoverOrigin, markerPosition) > 90", script)
        self.assertIn("els.africaMap.onpointermove = state.mapNavigationMode === 'auto' ? releaseDistantSouthAfricaHover : null", script)
        self.assertIn("hoveredPlace?.kind === 'region'", script)
        self.assertIn("halo?.getBoundingClientRect()", script)
        self.assertIn("currentPlace?.kind !== 'region' || nextPlace?.kind === 'region'", script)
        self.assertIn('id="mapFocusClose"', html)
        self.assertIn("function closePlaceFocus", script)
        self.assertIn(".map-focus-close", styles)
        self.assertIn("pointer-events: none", styles)
        self.assertIn("#africaMap.map-auto-navigation .destination-zone .zone-halo { pointer-events: all; }", styles)
        self.assertIn("#africaMap.map-focus-active .place-map-label", styles)
        self.assertIn("--map-label-scale", styles)

    def test_south_africa_map_supports_manual_and_auto_navigation(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('data-map-navigation="manual"', html)
        self.assertIn('data-map-navigation="auto"', html)
        self.assertIn("mapNavigationMode: 'manual'", script)
        self.assertIn("function handleManualMapWheel", script)
        self.assertIn("function handleManualMapPointerDown", script)
        self.assertIn("function handleManualMapPointerMove", script)
        self.assertIn("function mapDragNavigationEnabled", script)
        self.assertIn("['manual', 'auto'].includes(state.mapNavigationMode)", script)
        self.assertIn("dragging: false", script)
        self.assertIn("Math.hypot(deltaX, deltaY) <= 4", script)
        self.assertIn("setPointerCapture", script)
        pointer_move_start = script.index("function handleManualMapPointerMove")
        pointer_capture = script.index("setPointerCapture", pointer_move_start)
        pointer_up_start = script.index("function finishManualMapDrag")
        self.assertLess(pointer_capture, pointer_up_start)
        self.assertIn("manualDragConsumedClick", script)
        self.assertIn("{ passive: false }", script)
        self.assertIn("if (state.mapNavigationMode === 'auto') focusSouthAfricaPlace", script)
        self.assertIn(".map-manual-navigation", styles)
        self.assertIn(".map-auto-navigation.map-dragging", styles)
        self.assertIn("cursor: grab", styles)

    def test_displaced_pin_stems_contract_as_map_zooms(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn("function pinDisplacementFactor", script)
        self.assertIn("function pinPositionAtZoom", script)
        self.assertIn("function updateSouthAfricaPinDisplacements", script)
        self.assertIn('data-nearest="${nearest.toFixed(2)}"', script)
        self.assertIn('class="map-pin-body"', script)
        self.assertIn("updateSouthAfricaPinDisplacements(zoom)", script)
        self.assertIn("pinPositionAtZoom(layout, currentZoom)", script)
        self.assertIn("southAfricaViewBoxFor(center, zoom, centered, initialCenter)", script)
        self.assertNotIn("keepDisplaced", script)
        self.assertIn(".map-pin-body", styles)

    def test_province_map_and_country_drilldown_are_wired(self) -> None:
        provinces = json.loads(
            (ROOT / "data" / "south-africa-provinces.geojson").read_text(encoding="utf-8")
        )
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertEqual(len(provinces["features"]), 9)
        self.assertIn("renderSouthAfricaMap", script)
        self.assertIn("renderPlaceDetail", script)
        self.assertIn('id="mapBackButton"', html)

    def test_main_airports_have_route_and_origin_context(self) -> None:
        destination_ids = {place["id"] for place in self.destinations}
        self.assertGreaterEqual(len(self.airports), 8)
        self.assertEqual(self.payload["meta"]["airportCount"], len(self.airports))
        self.assertTrue({"JNB", "CPT", "DUR", "MQP"} <= {airport["code"] for airport in self.airports})
        for airport in self.airports:
            with self.subTest(airport=airport["code"]):
                self.assertTrue(airport["topOriginCountry"])
                self.assertGreater(airport["directRoutes"], 0)
                self.assertTrue(set(airport["connections"]) <= destination_ids)
                self.assertTrue(airport["sourceUrl"].startswith("https://"))

    def test_airports_and_place_batteries_are_wired(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn("renderAirportDetail", script)
        self.assertIn("selectAirport", script)
        self.assertIn("place-fact-battery", script)
        self.assertIn(".airport-marker", styles)
        self.assertIn(".place-fact-battery", styles)

    def test_south_africa_pin_layout_has_no_overlapping_click_targets(self) -> None:
        pins = [
            {"id": place["id"], "coordinates": place["coordinates"]}
            for place in self.destinations
            if place["kind"] != "region"
        ] + [
            {"id": airport["id"], "coordinates": airport["coordinates"]}
            for airport in self.airports
        ]

        def project(coordinates: list[float]) -> tuple[float, float]:
            longitude, latitude = coordinates
            return (
                48 + ((longitude - 16.0) / 17.4) * 664,
                72 + ((-21.8 - latitude) / 13.4) * 530,
            )

        anchors = {pin["id"]: project(pin["coordinates"]) for pin in pins}
        ranked = sorted(
            pins,
            key=lambda pin: (
                -sum(
                    other["id"] != pin["id"]
                    and math.dist(anchors[pin["id"]], anchors[other["id"]]) < 58
                    for other in pins
                ),
                pin["id"],
            ),
        )
        occupied: list[tuple[float, float]] = []
        displaced_count = 0
        for pin in ranked:
            anchor = anchors[pin["id"]]
            seed = 0
            for character in pin["id"]:
                seed = ((seed * 31) + ord(character)) % 360
            chosen: Optional[tuple[float, float]] = (
                anchor
                if all(math.dist(anchor, position) >= 29 for position in occupied)
                else None
            )
            if chosen is None:
                for radius in (18, 30, 42, 54, 66, 78, 90):
                    for step in range(24):
                        angle = math.radians(seed + step * 137.5)
                        candidate = (
                            max(48, min(712, anchor[0] + math.cos(angle) * radius)),
                            max(62, min(602, anchor[1] + math.sin(angle) * radius)),
                        )
                        if all(math.dist(candidate, position) >= 29 for position in occupied):
                            chosen = candidate
                            break
                    if chosen is not None:
                        break
            self.assertIsNotNone(chosen, pin["id"])
            assert chosen is not None
            if math.dist(anchor, chosen) > 1:
                displaced_count += 1
            occupied.append(chosen)

        for index, position in enumerate(occupied):
            for other in occupied[index + 1:]:
                self.assertGreaterEqual(math.dist(position, other), 29)

        self.assertGreater(displaced_count, 0)
        self.assertLess(displaced_count, len(pins))

        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn('class="point-stem"', script)
        self.assertIn('class="point-anchor"', script)
        self.assertIn("const minimumDistance = 29", script)
        self.assertIn("const stem = displaced ?", script)


class InterfaceRegressionTests(unittest.TestCase):
    def test_larili_atlas_brand_asset_is_integrated(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        logo = ROOT / "assets" / "brand" / "larili-atlas-neon.png"
        self.assertIn("Larili Atlas", html)
        self.assertNotIn("Dark Atlas", html)
        self.assertIn("assets/brand/larili-atlas-neon.png", html)
        self.assertTrue(logo.is_file())
        self.assertGreater(logo.stat().st_size, 10_000)

    def test_shortlist_uses_trip_planning_signals(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("'Remote', country.remoteWork", script)
        self.assertIn("'Tourist ease', country.touristConvenience", script)
        self.assertIn("staySignalChip(country)", script)
        self.assertNotIn("'Women', country.womenSafety", script)

    def test_favorite_stars_use_green_active_state(self) -> None:
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".favorite-button.active { border-color: rgba(72,173,104,.72)", styles)
        self.assertIn(".card-icon.favorite-icon.active { border-color: rgba(72,173,104,.68)", styles)

    def test_place_bars_include_their_detailed_copy(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("scoreColor(place.connectivityScore * 10), place.connectivity", script)
        self.assertIn("scoreColor(100 - place.difficultyScore * 10), place.difficulty", script)
        self.assertIn("scoreColor(place.accessibilityScore * 10), place.accessibility", script)
        self.assertNotIn('class="place-info-grid"', script)

    def test_filters_use_custom_dropdowns_and_map_is_larger(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn("initializeCustomSelects", script)
        self.assertIn("custom-select-trigger", script)
        self.assertIn(".custom-select-menu", styles)
        self.assertIn("min-height: 640px", styles)

    def test_sort_by_uses_the_complete_map_metric_catalog(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("const catalog = els.focusSelect.cloneNode(true)", script)
        self.assertIn("seasonality.value = 'seasonality'", script)
        self.assertIn("field === 'religion'", script)
        self.assertIn("Daily budget · lowest first", script)
        self.assertIn("Daytime temperature · coolest first", script)

    def test_removed_interface_components_leave_no_dead_css(self) -> None:
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertNotIn(".metric-tabs", styles)
        self.assertNotIn(".place-info-grid", styles)


if __name__ == "__main__":
    unittest.main()
