# FlipCraft backend regression tests: flipbooks (upload/convert/list/get/update/delete), media, files (Range), brand
import io
import os
import secrets
import time

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PDF_PATH = "/tmp/sample.pdf"

KEY_A = secrets.token_hex(24)
KEY_B = secrets.token_hex(24)


def H(k):
    return {"X-Owner-Key": k}


@pytest.fixture(scope="module")
def ready_book():
    with open(PDF_PATH, "rb") as f:
        r = requests.post(f"{API}/flipbooks", headers=H(KEY_A), files={"file": ("TEST_sample.pdf", f, "application/pdf")}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "processing"
    assert data["title"] == "TEST_sample"
    fid = data["id"]
    for _ in range(60):
        g = requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()
        if g["status"] != "processing":
            break
        time.sleep(1)
    assert g["status"] == "ready", g
    yield g
    requests.delete(f"{API}/flipbooks/{fid}", headers=H(KEY_A), timeout=30)


# --- Health
def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200 and r.json()["message"] == "FlipCraft API"


# --- Flipbook create + conversion
def test_conversion_ready(ready_book):
    b = ready_book
    assert b["page_count"] == len(b["pages"]) == len(b["thumbs"]) > 0
    assert b["pages_done"] == b["page_count"]
    assert all(p.startswith("flipcraft/pages/") for p in b["pages"] + b["thumbs"])
    assert b["page_width"] > 0 and b["page_height"] > 0
    assert "owner_hash" not in b and "_id" not in b


def test_reject_non_pdf():
    r = requests.post(f"{API}/flipbooks", headers=H(KEY_A), files={"file": ("x.pdf", b"hello world", "application/pdf")}, timeout=30)
    assert r.status_code == 400


def test_reject_missing_and_short_key():
    with open(PDF_PATH, "rb") as f:
        pdf = f.read()
    r1 = requests.post(f"{API}/flipbooks", files={"file": ("a.pdf", pdf, "application/pdf")}, timeout=30)
    r2 = requests.post(f"{API}/flipbooks", headers=H("short"), files={"file": ("a.pdf", pdf, "application/pdf")}, timeout=30)
    assert r1.status_code == 401 and r2.status_code == 401


# --- List / Get ownership
def test_list_only_own(ready_book):
    a = requests.get(f"{API}/flipbooks", headers=H(KEY_A), timeout=30).json()
    b = requests.get(f"{API}/flipbooks", headers=H(KEY_B), timeout=30).json()
    assert any(x["id"] == ready_book["id"] for x in a)
    assert not any(x["id"] == ready_book["id"] for x in b)


def test_list_without_key_401():
    assert requests.get(f"{API}/flipbooks", timeout=30).status_code == 401


def test_get_public_is_owner(ready_book):
    fid = ready_book["id"]
    assert requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()["is_owner"] is False
    assert requests.get(f"{API}/flipbooks/{fid}", headers=H(KEY_B), timeout=30).json()["is_owner"] is False
    assert requests.get(f"{API}/flipbooks/{fid}", headers=H(KEY_A), timeout=30).json()["is_owner"] is True


def test_get_public_with_overlong_key(ready_book):
    # public endpoint should not fail for garbage key
    r = requests.get(f"{API}/flipbooks/{ready_book['id']}", headers=H("a" * 200), timeout=30)
    assert r.status_code == 200, f"public GET with long key returned {r.status_code}"
    assert r.json()["is_owner"] is False


def test_get_unknown_404():
    assert requests.get(f"{API}/flipbooks/doesnotexist", timeout=30).status_code == 404


# --- Update
def test_update_owner_and_persist(ready_book):
    fid = ready_book["id"]
    ov = [
        {"id": "l1", "page": 0, "type": "link", "x": 10, "y": 10, "w": 20, "h": 10, "url": "https://example.com", "label": "Ex"},
        {"id": "y1", "page": 1, "type": "youtube", "x": 10, "y": 30, "w": 50, "h": 30, "src": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        {"id": "bad", "page": 999, "type": "link", "x": 1, "y": 1, "w": 1, "h": 1, "url": "https://x.com"},
    ]
    r = requests.put(f"{API}/flipbooks/{fid}", headers=H(KEY_A), json={"title": "TEST_renamed", "overlays": ov, "sound": False}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("is_owner") is True  # Editor relies on this after save
    g = requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()
    assert g["title"] == "TEST_renamed" and g["sound"] is False
    assert {o["id"] for o in g["overlays"]} == {"l1", "y1"}


def test_update_other_key_404(ready_book):
    r = requests.put(f"{API}/flipbooks/{ready_book['id']}", headers=H(KEY_B), json={"title": "hack"}, timeout=30)
    assert r.status_code == 404


def test_update_js_url_422(ready_book):
    ov = [{"id": "x", "page": 0, "type": "link", "x": 1, "y": 1, "w": 5, "h": 5, "url": "javascript:alert(1)"}]
    r = requests.put(f"{API}/flipbooks/{ready_book['id']}", headers=H(KEY_A), json={"overlays": ov}, timeout=30)
    assert r.status_code == 422


def test_update_empty_title_422(ready_book):
    r = requests.put(f"{API}/flipbooks/{ready_book['id']}", headers=H(KEY_A), json={"title": ""}, timeout=30)
    assert r.status_code == 422


# --- Media + files
def _png():
    b = io.BytesIO()
    Image.new("RGB", (40, 20), (255, 0, 0)).save(b, "PNG")
    return b.getvalue()


def test_media_image_upload_and_serve_range():
    png = _png()
    r = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("TEST_logo.png", png, "image/png")}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["kind"] == "image" and d["path"].startswith("flipcraft/media/image/")
    full = requests.get(f"{API}/files/{d['path']}", timeout=60)
    assert full.status_code == 200 and full.content == png
    assert full.headers["content-type"].startswith("image/png")
    part = requests.get(f"{API}/files/{d['path']}", headers={"Range": "bytes=0-9"}, timeout=60)
    assert part.status_code == 206 and part.content == png[:10]
    assert part.headers["content-range"] == f"bytes 0-9/{len(png)}"
    suffix = requests.get(f"{API}/files/{d['path']}", headers={"Range": "bytes=-5"}, timeout=60)
    assert suffix.status_code == 206 and suffix.content == png[-5:]


def test_media_video_upload():
    data = open("/tmp/real.mp4", "rb").read() if os.path.exists("/tmp/real.mp4") else b"\x00\x00\x00\x18ftypmp42" + b"0" * 100
    r = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("TEST_v.mp4", data, "video/mp4")}, timeout=60)
    assert r.status_code == 200 and r.json()["kind"] == "video"
    assert r.json()["path"].startswith("flipcraft/media/video/")


# --- Media sniffing / nosniff header
def test_media_sniff_mismatch_400():
    r = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("TEST_x.png", b"just some text bytes", "image/png")}, timeout=30)
    assert r.status_code == 400, r.text
    r2 = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("TEST_x.mp4", b"plain text not video" * 5, "video/mp4")}, timeout=30)
    assert r2.status_code == 400
    r3 = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("TEST_x.jpg", _png(), "image/jpeg")}, timeout=30)
    assert r3.status_code == 400


def test_files_nosniff_header(ready_book):
    r = requests.get(f"{API}/files/{ready_book['pages'][0]}", timeout=60)
    assert r.status_code == 200
    assert r.headers.get("x-content-type-options") == "nosniff"
    part = requests.get(f"{API}/files/{ready_book['pages'][0]}", headers={"Range": "bytes=0-3"}, timeout=60)
    assert part.status_code == 206 and part.headers.get("x-content-type-options") == "nosniff"


# --- Overlay src validation
@pytest.mark.parametrize("ov", [
    {"type": "youtube", "src": "https://evil.com/watch?v=1"},
    {"type": "youtube", "src": "javascript:alert(1)"},
    {"type": "youtube", "src": "https://youtube.com.evil.com/x"},
    {"type": "image", "src": "https://evil.com/a.png"},
    {"type": "image", "src": "flipcraft/pages/abc/x.jpg"},
    {"type": "video", "src": ""},
])
def test_overlay_src_validation_422(ready_book, ov):
    body = {"overlays": [{"id": "v", "page": 0, "x": 1, "y": 1, "w": 5, "h": 5, **ov}]}
    r = requests.put(f"{API}/flipbooks/{ready_book['id']}", headers=H(KEY_A), json=body, timeout=30)
    assert r.status_code == 422, r.text


def test_overlay_valid_vimeo_and_media(ready_book):
    up = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("TEST_i.png", _png(), "image/png")}, timeout=60).json()
    ov = [
        {"id": "vm", "page": 0, "type": "youtube", "x": 1, "y": 1, "w": 5, "h": 5, "src": "https://vimeo.com/76979871"},
        {"id": "yb", "page": 0, "type": "youtube", "x": 1, "y": 1, "w": 5, "h": 5, "src": "https://youtu.be/dQw4w9WgXcQ"},
        {"id": "im", "page": 0, "type": "image", "x": 1, "y": 1, "w": 5, "h": 5, "src": up["path"]},
    ]
    r = requests.put(f"{API}/flipbooks/{ready_book['id']}", headers=H(KEY_A), json={"overlays": ov}, timeout=30)
    assert r.status_code == 200, r.text
    assert {o["id"] for o in requests.get(f"{API}/flipbooks/{ready_book['id']}", timeout=30).json()["overlays"]} == {"vm", "yb", "im"}


def test_media_reject_other_type_and_nokey():
    r = requests.post(f"{API}/media", headers=H(KEY_A), files={"file": ("x.html", b"<b>x</b>", "text/html")}, timeout=30)
    assert r.status_code == 400
    r2 = requests.post(f"{API}/media", files={"file": ("x.png", _png(), "image/png")}, timeout=30)
    assert r2.status_code == 401


def test_files_unknown_404():
    assert requests.get(f"{API}/files/flipcraft/nope.jpg", timeout=30).status_code == 404


# --- Brand
def test_brand_default_and_save():
    k = secrets.token_hex(24)
    d = requests.get(f"{API}/brand", headers=H(k), timeout=30).json()
    assert d == {"name": "", "logo": "", "color": "#3B82F6", "website": ""}
    body = {"name": "TEST_Brand", "logo": "", "color": "#FF0000", "website": "https://acme.test"}
    assert requests.put(f"{API}/brand", headers=H(k), json=body, timeout=30).status_code == 200
    assert requests.get(f"{API}/brand", headers=H(k), timeout=30).json() == body
    # other key unaffected
    assert requests.get(f"{API}/brand", headers=H(KEY_B), timeout=30).json()["name"] != "TEST_Brand"


def test_brand_validation():
    k = secrets.token_hex(24)
    assert requests.put(f"{API}/brand", headers=H(k), json={"color": "red"}, timeout=30).status_code == 422
    assert requests.put(f"{API}/brand", headers=H(k), json={"website": "javascript:alert(1)"}, timeout=30).status_code == 422
    assert requests.get(f"{API}/brand", timeout=30).status_code == 401


# --- Delete (separate book)
def test_delete_soft():
    with open(PDF_PATH, "rb") as f:
        r = requests.post(f"{API}/flipbooks", headers=H(KEY_A), files={"file": ("TEST_del.pdf", f, "application/pdf")}, timeout=60)
    fid = r.json()["id"]
    assert requests.delete(f"{API}/flipbooks/{fid}", headers=H(KEY_B), timeout=30).status_code == 404
    d = requests.delete(f"{API}/flipbooks/{fid}", headers=H(KEY_A), timeout=30)
    assert d.status_code == 200 and d.json() == {"ok": True}
    assert requests.get(f"{API}/flipbooks/{fid}", timeout=30).status_code == 404
    lst = requests.get(f"{API}/flipbooks", headers=H(KEY_A), timeout=30).json()
    assert not any(x["id"] == fid for x in lst)


def test_delete_marks_page_files_deleted():
    with open(PDF_PATH, "rb") as f:
        fid = requests.post(f"{API}/flipbooks", headers=H(KEY_A), files={"file": ("TEST_del2.pdf", f, "application/pdf")}, timeout=60).json()["id"]
    for _ in range(60):
        g = requests.get(f"{API}/flipbooks/{fid}", timeout=30).json()
        if g["status"] != "processing":
            break
        time.sleep(1)
    assert g["status"] == "ready"
    paths = [g["pages"][0], g["thumbs"][0], g["pages"][-1]]
    assert requests.get(f"{API}/files/{paths[0]}", timeout=60).status_code == 200
    assert requests.delete(f"{API}/flipbooks/{fid}", headers=H(KEY_A), timeout=30).status_code == 200
    for p in paths:
        assert requests.get(f"{API}/files/{p}", timeout=60).status_code == 404, p
