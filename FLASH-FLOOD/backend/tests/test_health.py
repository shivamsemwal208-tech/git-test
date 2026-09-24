def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "FlashGuard API"
    assert body["data_status"] == "DEMO"


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DEMO"
    assert "running" in body["message"]