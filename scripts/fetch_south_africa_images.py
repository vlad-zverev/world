from __future__ import annotations

import argparse
import json
import mimetypes
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional


USER_AGENT = "LariliAtlas/1.0 (local travel research project)"


def fetch_json(url: str) -> dict[str, object]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected response from {url}")
    return payload


def download(url: str, destination: Path) -> str:
    for attempt in range(3):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                content_type = response.headers.get_content_type()
                suffix = mimetypes.guess_extension(content_type) or Path(urllib.parse.urlparse(url).path).suffix or ".jpg"
                target = destination.with_suffix(".jpg" if suffix == ".jpe" else suffix)
                target.write_bytes(response.read())
            return target.name
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            time.sleep(3)
    raise RuntimeError(f"Unable to download {url}")


def page_images(titles: list[str]) -> dict[str, dict[str, str]]:
    decoded_titles = [urllib.parse.unquote(title) for title in titles]
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "pageimages|info",
        "inprop": "url",
        "piprop": "thumbnail",
        "pithumbsize": "720",
        "redirects": "1",
        "titles": "|".join(decoded_titles),
    })
    payload = fetch_json(f"https://en.wikipedia.org/w/api.php?{query}")
    query_data = payload.get("query")
    if not isinstance(query_data, dict):
        raise ValueError("Wikipedia query returned no data")
    aliases: dict[str, str] = {}
    for key in ("normalized", "redirects"):
        values = query_data.get(key)
        if isinstance(values, list):
            for value in values:
                if isinstance(value, dict) and isinstance(value.get("from"), str) and isinstance(value.get("to"), str):
                    aliases[value["from"]] = value["to"]
    pages = query_data.get("pages")
    if not isinstance(pages, list):
        raise ValueError("Wikipedia query returned no pages")
    pages_by_title = {str(page.get("title")): page for page in pages if isinstance(page, dict)}
    result: dict[str, dict[str, str]] = {}
    for original, decoded in zip(titles, decoded_titles, strict=True):
        resolved = decoded
        while resolved in aliases:
            resolved = aliases[resolved]
        page = pages_by_title.get(resolved)
        thumbnail = page.get("thumbnail") if isinstance(page, dict) else None
        if isinstance(thumbnail, dict) and isinstance(thumbnail.get("source"), str):
            result[original] = {
                "source": thumbnail["source"],
                "page": str(page.get("canonicalurl", f"https://en.wikipedia.org/wiki/{urllib.parse.quote(resolved)}")),
            }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Wikipedia lead images for South Africa destination cards.")
    parser.add_argument("data", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.data.read_text(encoding="utf-8"))
    destinations = payload.get("destinations")
    if not isinstance(destinations, list):
        raise ValueError(f"Invalid destination data in {args.data}")
    args.output_directory.mkdir(parents=True, exist_ok=True)

    titles = [str(destination["wikiTitle"]) for destination in destinations if isinstance(destination, dict)]
    images = page_images(titles)
    failures: list[str] = []
    for destination in destinations:
        if not isinstance(destination, dict):
            continue
        destination_id = str(destination["id"])
        title = str(destination["wikiTitle"])
        try:
            image_data: Optional[dict[str, str]] = images.get(title)
            if image_data is None:
                raise ValueError("No thumbnail returned")
            existing_files = sorted(args.output_directory.glob(f"{destination_id}.*"))
            if existing_files:
                file_name = existing_files[0].name
            else:
                file_name = download(image_data["source"], args.output_directory / destination_id)
            destination["image"] = f"assets/places/za/{file_name}"
            destination["imageAlt"] = f"{destination['name']} landscape"
            destination["imageSourceUrl"] = image_data["page"]
            destination["imageCredit"] = "Wikipedia / Wikimedia Commons"
            print(f"Fetched {destination_id}: {file_name}")
            time.sleep(0.2)
        except (OSError, ValueError, KeyError) as error:
            failures.append(f"{destination_id}: {error}")

    args.data.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if failures:
        raise RuntimeError("Image fetch failures:\n" + "\n".join(failures))
    print(f"Updated {len(destinations)} destinations in {args.data}")


if __name__ == "__main__":
    main()
