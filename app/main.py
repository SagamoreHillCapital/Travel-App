from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db import get_conn, init_db
from extractor import enrich_company, normalize_domain
from providers import collect_candidates, enabled_providers

app = FastAPI(title="ETA Travel Discovery")


class SearchRequest(BaseModel):
    location: str
    company_type: str = "all"
    specialty: str = ""
    offset: int = 0
    limit: int = 50


class TriageRequest(BaseModel):
    domain: str
    status: str
    notes: str = ""


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/providers")
def providers_status():
    return enabled_providers()


@app.post("/search")
def search(req: SearchRequest):
    candidates = collect_candidates(req.location, req.company_type, req.specialty, req.offset, req.limit)

    with get_conn() as conn:
        rejected_domains = {
            row["domain"]
            for row in conn.execute("SELECT domain FROM companies WHERE triage_status = 'rejected'").fetchall()
        }

        results = []
        for candidate in candidates:
            domain = normalize_domain(candidate.website)
            if not domain or domain in rejected_domains:
                continue

            existing = conn.execute("SELECT * FROM companies WHERE domain = ?", (domain,)).fetchone()
            if existing:
                results.append(dict(existing))
                continue

            company = {
                "domain": domain,
                "name": candidate.name,
                "website": candidate.website,
                "snippet": candidate.snippet,
                "location": candidate.location,
                "owner": "Not listed",
                "employees": "Not listed",
                "specialties": "Not listed",
                "triage_status": "open",
                "notes": "",
            }
            conn.execute(
                """
                INSERT OR IGNORE INTO companies (domain, name, website, snippet, location, owner, employees, specialties, triage_status, notes)
                VALUES (:domain, :name, :website, :snippet, :location, :owner, :employees, :specialties, :triage_status, :notes)
                """,
                company,
            )
            results.append(company)

    return {"items": results[: req.limit], "offset": req.offset, "limit": req.limit}


@app.post("/triage")
def triage(req: TriageRequest):
    if req.status not in {"open", "maybe", "good", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM companies WHERE domain = ?", (req.domain,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Company not found")

        owner, employees, specialties = row["owner"], row["employees"], row["specialties"]

        if req.status in {"maybe", "good"} and owner == "Not listed" and employees == "Not listed" and specialties == "Not listed":
            enriched = enrich_company(row["website"], row["location"])
            owner = enriched["owner"]
            employees = enriched["employees"]
            specialties = enriched["specialties"]

        conn.execute(
            """
            UPDATE companies
            SET triage_status = ?, notes = ?, owner = ?, employees = ?, specialties = ?, updated_at = CURRENT_TIMESTAMP
            WHERE domain = ?
            """,
            (req.status, req.notes, owner, employees, specialties, req.domain),
        )
        updated = conn.execute("SELECT * FROM companies WHERE domain = ?", (req.domain,)).fetchone()

    return {"item": dict(updated)}


@app.get("/board")
def board():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM companies").fetchall()
    return {"items": [dict(r) for r in rows]}


static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/")
def root():
    return FileResponse(static_path / "index.html")
