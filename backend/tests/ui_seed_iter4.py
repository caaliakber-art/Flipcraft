import os, time, json, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
K = "d00d" * 12
H = {"X-Owner-Key": K}
with open("/tmp/sample.pdf", "rb") as f:
    fid = requests.post(f"{API}/flipbooks", headers=H, files={"file": ("TEST_ui_analytics.pdf", f, "application/pdf")}).json()["id"]
for _ in range(60):
    g = requests.get(f"{API}/flipbooks/{fid}").json()
    if g["status"] != "processing":
        break
    time.sleep(1)
with open("/tmp/test.mp4", "rb") as f:
    m = requests.post(f"{API}/media", headers=H, files={"file": ("TEST.mp4", f, "video/mp4")}).json()
ov = [
    {"id": "vid1", "page": 1, "type": "video", "x": 10, "y": 10, "w": 60, "h": 40, "src": m["path"], "autoplay": True},
    {"id": "yt1", "page": 2, "type": "youtube", "x": 10, "y": 55, "w": 60, "h": 35, "src": "https://youtu.be/dQw4w9WgXcQ", "autoplay": True},
]
r = requests.put(f"{API}/flipbooks/{fid}", headers=H, json={"overlays": ov})
print(json.dumps({"fid": fid, "media": m, "put": r.status_code, "pages": g["page_count"]}))
