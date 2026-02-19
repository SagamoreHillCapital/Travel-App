import os
from dataclasses import dataclass
from typing import Callable
from urllib.parse import quote_plus


from extractor import normalize_domain


@dataclass
class Candidate:
    name: str
    website: str
    snippet: str
    location: str


def _flag(name: str) -> bool:
    return os.getenv(name, "0") == "1"


def enabled_providers() -> dict[str, bool]:
    return {
        "google_places": _flag("PROVIDER_GOOGLE_PLACES"),
        "web_search": _flag("PROVIDER_WEB_SEARCH"),
        "demo": _flag("PROVIDER_DEMO") or True,
    }


DEMO_DATA = [
    {
        "name": "Boston Polar Expeditions",
        "website": "https://example-polar-boston.com",
        "snippet": "Small-group Arctic and Antarctica journeys.",
        "location": "Boston, MA",
        "type": "tour operator",
    },
    {
        "name": "Harbor City Travel Advisors",
        "website": "https://example-harbortravel.com",
        "snippet": "Retail agency focused on family and cruise itineraries.",
        "location": "Boston, MA",
        "type": "retail travel agency",
    },
]

for i in range(1, 75):
    DEMO_DATA.append(
        {
            "name": f"Demo Travel Company {i}",
            "website": f"https://demo-travel-{i}.example.com",
            "snippet": "Demo dataset record for ETA review queue.",
            "location": "Boston, MA" if i % 2 else "Cambridge, MA",
            "type": "tour operator" if i % 3 else "retail travel agency",
        }
    )


def _filter_candidates(items: list[dict], location: str, company_type: str, specialty: str) -> list[Candidate]:
    specialty_l = specialty.lower().strip()
    out: list[Candidate] = []
    for item in items:
        if location.lower() not in item["location"].lower() and location.lower() not in item["name"].lower():
            continue
        if company_type != "all" and item.get("type") != company_type:
            continue
        if specialty_l and specialty_l not in item.get("snippet", "").lower():
            continue
        out.append(
            Candidate(
                name=item["name"],
                website=item["website"],
                snippet=item.get("snippet", ""),
                location=item.get("location", "Not listed"),
            )
        )
    return out


def demo_provider(location: str, company_type: str, specialty: str, offset: int, limit: int) -> list[Candidate]:
    items = _filter_candidates(DEMO_DATA, location, company_type, specialty)
    return items[offset : offset + limit]


def google_places_provider(location: str, company_type: str, specialty: str, offset: int, limit: int) -> list[Candidate]:
    key = os.getenv("GOOGLE_PLACES_API_KEY", "")
    if not key:
        return []

    q = f"{company_type} {location} {specialty}".strip()
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    import requests
    res = requests.get(url, params={"query": q, "key": key}, timeout=8)
    res.raise_for_status()
    results = res.json().get("results", [])

    candidates = []
    for row in results[offset : offset + limit]:
        name = row.get("name", "Unknown")
        website = f"https://www.google.com/maps/place/?q=place_id:{row.get('place_id', '')}"
        loc = row.get("formatted_address", location)
        candidates.append(Candidate(name=name, website=website, snippet="Google Places result", location=loc))
    return candidates


def web_search_provider(location: str, company_type: str, specialty: str, offset: int, limit: int) -> list[Candidate]:
    key = os.getenv("BRAVE_SEARCH_API_KEY", "")
    if not key:
        return []

    q = quote_plus(f"{company_type} {location} {specialty}".strip())
    url = f"https://api.search.brave.com/res/v1/web/search?q={q}&count={limit}&offset={offset}"
    headers = {"Accept": "application/json", "X-Subscription-Token": key}
    import requests
    res = requests.get(url, headers=headers, timeout=8)
    res.raise_for_status()
    data = res.json().get("web", {}).get("results", [])

    candidates = []
    for row in data:
        candidates.append(
            Candidate(
                name=row.get("title", "Unknown"),
                website=row.get("url", ""),
                snippet=row.get("description", ""),
                location=location,
            )
        )
    return candidates


def collect_candidates(location: str, company_type: str, specialty: str, offset: int, limit: int) -> list[Candidate]:
    providers: list[Callable[..., list[Candidate]]] = []
    flags = enabled_providers()

    if flags["google_places"]:
        providers.append(google_places_provider)
    if flags["web_search"]:
        providers.append(web_search_provider)
    if flags["demo"]:
        providers.append(demo_provider)

    collected: list[Candidate] = []
    seen = set()
    for provider in providers:
        for candidate in provider(location, company_type, specialty, offset, limit):
            domain = normalize_domain(candidate.website)
            if not domain or domain in seen:
                continue
            seen.add(domain)
            collected.append(candidate)
            if len(collected) >= limit:
                return collected
    return collected
