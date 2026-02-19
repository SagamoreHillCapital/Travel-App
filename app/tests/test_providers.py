from providers import demo_provider, enabled_providers


def test_demo_provider_boston_tour_operator_returns_results():
    items = demo_provider("Boston", "tour operator", "", 0, 50)
    assert len(items) > 0
    assert any("Boston" in item.location for item in items)


def test_enabled_providers_contains_demo():
    providers = enabled_providers()
    assert providers["demo"] is True
