import re
import time
from typing import Iterable
from urllib.parse import urljoin, urlparse


USER_AGENT = "ETA-Travel-Collector/1.0 (+https://eta.local)"
REQUEST_DELAY_SECONDS = 0.4
TIMEOUT_SECONDS = 8

SPECIALTY_KEYWORDS = [
    "africa",
    "arctic",
    "antarctica",
    "safari",
    "expedition",
    "luxury",
    "cruise",
    "adventure",
    "family",
    "group travel",
]


def normalize_domain(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url if url.startswith("http") else f"https://{url}")
    return parsed.netloc.lower().replace("www.", "")


def _fetch(url: str) -> str:
    time.sleep(REQUEST_DELAY_SECONDS)
    import requests
    res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_SECONDS)
    res.raise_for_status()
    return res.text


def _extract_text(html: str) -> str:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(" ", strip=True)


def _candidate_links(base_url: str, html: str) -> Iterable[str]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a[href]"):
        href = (a.get("href") or "").strip()
        text = (a.get_text(" ", strip=True) or "").lower()
        lower_href = href.lower()
        if any(k in text or k in lower_href for k in ["about", "team", "destination", "service"]):
            yield urljoin(base_url, href)


def _find_owner(text: str) -> str:
    patterns = [
        r"(?:founder|owner|ceo|president|director)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})",
        r"led by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return "Not listed"


def _find_employees(text: str) -> str:
    patterns = [
        r"(\d{1,4})\s+(?:employees|team members|travel agents|advisors)",
        r"team of\s+(\d{1,4})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return "Not listed"


def _find_specialties(text: str) -> str:
    lowered = text.lower()
    matches = [word for word in SPECIALTY_KEYWORDS if word in lowered]
    return ", ".join(sorted(set(matches))) if matches else "Not listed"


def enrich_company(website: str, fallback_location: str = "") -> dict:
    if not website or not website.startswith("http"):
        return {
            "owner": "Not listed",
            "employees": "Not listed",
            "specialties": "Not listed",
            "location": fallback_location or "Not listed",
        }

    try:
        homepage = _fetch(website)
        pages = [homepage]
        for link in list(_candidate_links(website, homepage))[:4]:
            try:
                pages.append(_fetch(link))
            except Exception:
                continue

        corpus = " ".join(_extract_text(page) for page in pages)
        owner = _find_owner(corpus)
        employees = _find_employees(corpus)
        specialties = _find_specialties(corpus)

        return {
            "owner": owner,
            "employees": employees,
            "specialties": specialties,
            "location": fallback_location or "Not listed",
        }
    except Exception:
        return {
            "owner": "Not listed",
            "employees": "Not listed",
            "specialties": "Not listed",
            "location": fallback_location or "Not listed",
        }
