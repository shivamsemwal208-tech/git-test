def test_locations_endpoint(client):
    response = client.get("/api/v1/locations")
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "DEMO"
    assert len(body["locations"]) == 9
    ids = [loc["id"] for loc in body["locations"]]
    assert "dehradun" in ids
    assert "nainital" in ids


def test_locations_have_required_fields(client):
    response = client.get("/api/v1/locations")
    locations = response.json()["locations"]
    for loc in locations:
        assert {"id", "name", "district", "latitude", "longitude", "elevation"}.issubset(loc)
        assert loc["latitude"] > 0
        assert loc["longitude"] > 0