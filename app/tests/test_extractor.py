from extractor import _find_employees, _find_owner, _find_specialties, normalize_domain


def test_normalize_domain_strips_www():
    assert normalize_domain("https://www.example.com/about") == "example.com"


def test_extractors_best_effort():
    text = "Founder: Jane Smith. We are a team of 42 travel agents offering arctic expedition trips."
    assert _find_owner(text) == "Jane Smith"
    assert _find_employees(text) == "42"
    assert "arctic" in _find_specialties(text)
