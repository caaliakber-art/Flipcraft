# FlipCraft iteration 4: reader analytics (track/stats/list views), hard_cover and overlay autoplay persistence
import os
import secrets
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PDF_PATH = "/tmp/sample.pdf"
OWNER = secrets.token_hex(24)
OTHER = secrets.token_hex(24)


def H(k):
    return {"X-Owner-Key": k}


@pytest.fixture(scope="module")
def book():
    with open(PDF_PATH, "rb") as f:
        r = requests.post(f"{API}/flipbooks", headers=H(OWNER), files={"file": ("TEST_analytics.pdf", f, "application/pdf")}, timeout=60)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    for _ in range(60):
        g = requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()
        if g["status"] != "processing":
            break
        time.sleep(1)
    assert g["status"] == "ready"
    yield g
    requests.delete(f"{API}/flipbooks/{fid}", headers=H(OWNER), timeout=30)


def stats(fid, key=OWNER):
    return requests.get(f"{API}/flipbooks/{fid}/stats", headers=H(key), timeout=30)


# Defaults
def test_hard_cover_default_true_and_zero_stats(book):
    assert book["hard_cover"] is True
    s = stats(book["id"])
    assert s.status_code == 200
    d = s.json()
    assert d["views"] == 0 and d["unique"] == 0
    assert d["sources"] == {"link": 0, "embed": 0}
    assert len(d["days"]) == 30 and all(x["views"] == 0 for x in d["days"])
    assert d["pages"] == [0] * book["page_count"]


# Tracking: open/unique/sources/pages
def test_track_open_unique_sources_pages(book):
    fid = book["id"]
    v1, v2 = secrets.token_hex(12), secrets.token_hex(12)
    for body in [
        {"visitor": v1, "open": True, "pages": [0], "source": "link"},
        {"visitor": v1, "open": True, "pages": [0], "source": "link"},
        {"visitor": v2, "open": True, "pages": [0], "source": "embed"},
        {"visitor": v1, "pages": [1, 2]},
        {"visitor": v1, "pages": [99, -1]},
    ]:
        r = requests.post(f"{API}/flipbooks/{fid}/track", json=body, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
    d = stats(fid).json()
    assert d["views"] == 3
    assert d["unique"] == 2
    assert d["sources"] == {"link": 2, "embed": 1}
    assert d["days"][-1]["views"] == 3
    assert d["pages"][:3] == [3, 1, 1]
    assert sum(d["pages"]) == 5


def test_track_owner_skipped(book):
    fid = book["id"]
    before = stats(fid).json()
    r = requests.post(f"{API}/flipbooks/{fid}/track", headers=H(OWNER), json={"visitor": secrets.token_hex(12), "open": True, "pages": [0]}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("skipped") == "owner"
    assert stats(fid).json() == before


@pytest.mark.parametrize("body", [
    {"visitor": "xyz", "open": True},
    {"visitor": "ABCDEF0123456789", "open": True},
    {"visitor": "a" * 15},
    {"visitor": "a" * 65},
    {"visitor": "a" * 20, "pages": [1, 2, 3]},
    {"visitor": "a" * 20, "source": "email"},
    {},
])
def test_track_invalid_422(book, body):
    r = requests.post(f"{API}/flipbooks/{book['id']}/track", json=body, timeout=30)
    assert r.status_code == 422


def test_track_unknown_book_404():
    r = requests.post(f"{API}/flipbooks/doesnotexist/track", json={"visitor": "a" * 20, "open": True}, timeout=30)
    assert r.status_code == 404


def test_stats_owner_only(book):
    assert stats(book["id"], OTHER).status_code == 404
    assert requests.get(f"{API}/flipbooks/{book['id']}/stats", timeout=30).status_code == 401  # missing key -> 401 by design


def test_list_includes_views(book):
    r = requests.get(f"{API}/flipbooks", headers=H(OWNER), timeout=30)
    assert r.status_code == 200
    item = next(x for x in r.json() if x["id"] == book["id"])
    assert item["views"] == stats(book["id"]).json()["views"]
    assert isinstance(item["views"], int)


# hard_cover + overlay autoplay persistence
def test_put_hard_cover_and_autoplay(book):
    fid = book["id"]
    ov = [{"id": "TESTyt1", "page": 0, "type": "youtube", "x": 10, "y": 10, "w": 40, "h": 30, "src": "https://youtu.be/dQw4w9WgXcQ", "autoplay": True},
          {"id": "TESTyt2", "page": 1, "type": "youtube", "x": 10, "y": 10, "w": 40, "h": 30, "src": "https://youtu.be/dQw4w9WgXcQ"}]
    r = requests.put(f"{API}/flipbooks/{fid}", headers=H(OWNER), json={"hard_cover": False, "overlays": ov}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["hard_cover"] is False
    g = requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()
    assert g["hard_cover"] is False
    by = {o["id"]: o for o in g["overlays"]}
    assert by["TESTyt1"]["autoplay"] is True
    assert by["TESTyt2"]["autoplay"] is False
    # other fields untouched by hard_cover-only update
    r = requests.put(f"{API}/flipbooks/{fid}", headers=H(OWNER), json={"hard_cover": True}, timeout=30)
    g = requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()
    assert g["hard_cover"] is True and len(g["overlays"]) == 2


def test_put_hard_cover_invalid_type(book):
    r = requests.put(f"{API}/flipbooks/{book['id']}", headers=H(OWNER), json={"hard_cover": "maybe"}, timeout=30)
    assert r.status_code == 422


def test_put_by_other_404(book):
    r = requests.put(f"{API}/flipbooks/{book['id']}", headers=H(OTHER), json={"hard_cover": False}, timeout=30)
    assert r.status_code == 404
