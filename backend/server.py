from fastapi import FastAPI, APIRouter, UploadFile, File, Form, Header, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Dict, List, Literal, Optional
from pathlib import Path
from datetime import datetime, timedelta, timezone
import asyncio
import hashlib
import logging
import os
import re
import uuid

import pymupdf as fitz
import boto3
from botocore.config import Config as BotoConfig

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# S3-compatible storage (Backblaze B2 by default; works with Cloudflare R2 too)
# B2 endpoint looks like https://s3.us-west-004.backblazeb2.com and its region is the middle part (us-west-004)
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_REGION = os.environ.get("S3_REGION") or (re.search(r"s3\.([a-z0-9-]+)\.backblazeb2\.com", S3_ENDPOINT) or [None, "auto"])[1]
S3_BUCKET = os.environ.get("S3_BUCKET", "flipcraft")
store = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT or None,
    aws_access_key_id=os.environ.get("S3_KEY_ID"),
    aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
    region_name=S3_REGION,
    config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
)
APP_NAME = "flipcraft"
CACHE_DIR = Path("/tmp/flipcraft_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

MAX_PDF = 100 * 1024 * 1024
MAX_VIDEO = 300 * 1024 * 1024
MAX_IMAGE = 15 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg"}
VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv"}


def put_object(path: str, data: bytes, content_type: str) -> dict:
    store.put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    return {"path": path, "size": len(data)}


def download_to(path: str, dest: Path):
    tmp = dest.with_suffix(f".{uuid.uuid4().hex}.part")
    store.download_file(S3_BUCKET, path, str(tmp))
    tmp.rename(dest)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def owner_hash(key: Optional[str]) -> str:
    if not key or len(key) < 32 or len(key) > 128:
        raise HTTPException(status_code=401, detail="Missing or invalid studio key")
    return hashlib.sha256(key.encode()).hexdigest()


async def store_file(data: bytes, content_type: str, ext: str, folder: str, ohash: str, name: str = "", private: bool = False) -> str:
    path = f"{APP_NAME}/{folder}/{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, content_type)
    await db.files.insert_one({
        "id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": name,
        "content_type": content_type, "size": result.get("size", len(data)), "owner_hash": ohash,
        "private": private, "is_deleted": False, "created_at": now_iso(),
    })
    return result["path"]


app = FastAPI()
api = APIRouter(prefix="/api")


class Brand(BaseModel):
    name: str = Field("", max_length=80)
    logo: str = Field("", max_length=500)
    color: str = Field("#3B82F6", max_length=9)
    website: str = Field("", max_length=500)

    @field_validator("color")
    @classmethod
    def check_color(cls, v):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            raise ValueError("Color must be like #1A2B3C")
        return v

    @field_validator("website")
    @classmethod
    def check_site(cls, v):
        if v and not re.match(r"^https?://", v):
            raise ValueError("Website must start with http:// or https://")
        return v


def sniff_ok(data: bytes, ext: str) -> bool:
    head = data[:64]
    checks = {
        "jpg": head.startswith(b"\xff\xd8\xff"), "png": head.startswith(b"\x89PNG"), "gif": head.startswith(b"GIF8"),
        "webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP", "svg": b"<svg" in data[:2048].lower(),
        "mp4": head[4:8] == b"ftyp", "mov": head[4:8] in (b"ftyp", b"moov", b"wide", b"mdat", b"free"),
        "webm": head.startswith(b"\x1a\x45\xdf\xa3"), "ogv": head.startswith(b"OggS"),
    }
    return checks.get(ext, False)


class Overlay(BaseModel):
    id: str = Field(max_length=64)
    page: int = Field(ge=0)
    type: Literal["video", "youtube", "image", "link"]
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    w: float = Field(gt=0, le=100)
    h: float = Field(gt=0, le=100)
    src: str = Field("", max_length=1000)
    url: str = Field("", max_length=1000)
    label: str = Field("", max_length=200)
    autoplay: bool = False
    @field_validator("url")
    @classmethod
    def check_url(cls, v):
        if v and not re.match(r"^(https?://|mailto:|tel:)", v):
            raise ValueError("Links must start with http://, https://, mailto: or tel:")
        return v

    @model_validator(mode="after")
    def check_src(self):
        if self.type == "youtube" and not re.match(r"^https?://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/", self.src):
            raise ValueError("Video links must be from YouTube or Vimeo")
        if self.type in ("image", "video") and not self.src.startswith(f"{APP_NAME}/media/"):
            raise ValueError("Media must be uploaded first")
        return self


class FlipbookUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    overlays: Optional[List[Overlay]] = None
    sound: Optional[bool] = None
    hard_cover: Optional[bool] = None
    download: Optional[Literal["off", "free", "email"]] = None


class TrackEvent(BaseModel):
    visitor: str = Field(pattern=r"^[a-f0-9]{16,64}$")
    pages: List[int] = Field(default_factory=list, max_length=2)
    open: bool = False
    source: Literal["link", "embed"] = "link"
    durations: Dict[int, float] = Field(default_factory=dict, max_length=4)
    finished: bool = False


class LeadIn(BaseModel):
    visitor: str = Field(pattern=r"^[a-f0-9]{16,64}$")
    email: str = Field(max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field("", max_length=120)


def public_view(fb: dict, brand: Optional[dict]) -> dict:
    return {
        "id": fb["id"], "title": fb["title"], "status": fb["status"], "error": fb.get("error"),
        "page_count": fb.get("page_count", 0), "pages_done": fb.get("pages_done", 0),
        "pages": fb.get("pages", []), "thumbs": fb.get("thumbs", []),
        "page_width": fb.get("page_width", 0), "page_height": fb.get("page_height", 0),
        "overlays": fb.get("overlays", []), "sound": fb.get("sound", True), "hard_cover": fb.get("hard_cover", True),
        "download": fb.get("download", "off") if fb.get("pdf_path") else "off", "has_pdf": bool(fb.get("pdf_path")),
        "created_at": fb["created_at"], "updated_at": fb.get("updated_at", fb["created_at"]),
        "brand": Brand(**brand).model_dump() if brand else Brand().model_dump(),
    }


async def get_brand(ohash: str):
    return await db.brands.find_one({"owner_hash": ohash}, {"_id": 0, "owner_hash": 0})


async def owned_flipbook(fid: str, ohash: str) -> dict:
    fb = await db.flipbooks.find_one({"id": fid, "is_deleted": False}, {"_id": 0})
    if not fb or fb["owner_hash"] != ohash:
        raise HTTPException(status_code=404, detail="Flipbook not found")
    return fb


async def convert_job(fid: str, data: bytes, ohash: str):
    try:
        doc = await asyncio.to_thread(fitz.open, stream=data, filetype="pdf")
        count = doc.page_count
        rect = doc[0].rect
        doc.close()
        await db.flipbooks.update_one({"id": fid}, {"$set": {"page_count": count, "page_width": rect.width, "page_height": rect.height}})
        doc = fitz.open(stream=data, filetype="pdf")
        pages, thumbs = [], []
        for i in range(count):
            page = doc[i]
            zoom = 1400 / max(page.rect.width, 1)
            img = await asyncio.to_thread(lambda: page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).tobytes("jpeg", jpg_quality=85))
            tz = 260 / max(page.rect.width, 1)
            th = await asyncio.to_thread(lambda: page.get_pixmap(matrix=fitz.Matrix(tz, tz), alpha=False).tobytes("jpeg", jpg_quality=70))
            pages.append(await store_file(img, "image/jpeg", "jpg", f"pages/{fid}", ohash))
            thumbs.append(await store_file(th, "image/jpeg", "jpg", f"pages/{fid}", ohash))
            await db.flipbooks.update_one({"id": fid}, {"$set": {"pages_done": i + 1}})
        doc.close()
        pdf_path = await store_file(data, "application/pdf", "pdf", f"pages/{fid}", ohash, private=True)
        await db.flipbooks.update_one({"id": fid}, {"$set": {"pages": pages, "thumbs": thumbs, "pdf_path": pdf_path, "status": "ready", "updated_at": now_iso()}})
        if (await db.flipbooks.find_one({"id": fid}, {"is_deleted": 1})).get("is_deleted"):
            await db.files.update_many({"storage_path": {"$regex": f"^{APP_NAME}/pages/{fid}/"}}, {"$set": {"is_deleted": True}})
    except Exception as e:
        logger.exception("PDF conversion failed")
        await db.flipbooks.update_one({"id": fid}, {"$set": {"status": "failed", "error": str(e)[:300]}})


@api.get("/")
async def root():
    return {"message": "FlipCraft API"}


@api.get("/brand")
async def read_brand(x_owner_key: str = Header(None)):
    brand = await get_brand(owner_hash(x_owner_key))
    return Brand(**brand).model_dump() if brand else Brand().model_dump()


@api.put("/brand")
async def save_brand(body: Brand, x_owner_key: str = Header(None)):
    ohash = owner_hash(x_owner_key)
    await db.brands.update_one({"owner_hash": ohash}, {"$set": {**body.model_dump(), "owner_hash": ohash}}, upsert=True)
    return body.model_dump()


@api.post("/flipbooks")
async def create_flipbook(background: BackgroundTasks, file: UploadFile = File(...), title: str = Form(""), x_owner_key: str = Header(None)):
    ohash = owner_hash(x_owner_key)
    data = await file.read()
    if len(data) > MAX_PDF:
        raise HTTPException(status_code=413, detail="PDF is larger than 100 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Please upload a valid PDF file")
    try:
        probe = fitz.open(stream=data, filetype="pdf")
        if probe.page_count == 0:
            raise ValueError("empty")
        probe.close()
    except Exception:
        raise HTTPException(status_code=400, detail="This PDF could not be read")
    fid = uuid.uuid4().hex[:12]
    name = (title or (file.filename or "Untitled").rsplit(".", 1)[0]).strip()[:150] or "Untitled"
    fb = {"id": fid, "title": name, "owner_hash": ohash, "status": "processing", "page_count": 0, "pages_done": 0,
          "pages": [], "thumbs": [], "overlays": [], "sound": True, "is_deleted": False, "created_at": now_iso()}
    await db.flipbooks.insert_one(dict(fb))
    background.add_task(convert_job, fid, data, ohash)
    return public_view(fb, await get_brand(ohash))


@api.get("/flipbooks")
async def list_flipbooks(x_owner_key: str = Header(None)):
    ohash = owner_hash(x_owner_key)
    brand = await get_brand(ohash)
    items = await db.flipbooks.find({"owner_hash": ohash, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(500)
    stats = {s["flipbook_id"]: s.get("views", 0) async for s in db.stats.find({"flipbook_id": {"$in": [f["id"] for f in items]}}, {"_id": 0, "flipbook_id": 1, "views": 1})}
    return [{**public_view(f, brand), "views": stats.get(f["id"], 0)} for f in items]


@api.post("/flipbooks/{fid}/track")
async def track(fid: str, body: TrackEvent, x_owner_key: str = Header(None)):
    fb = await db.flipbooks.find_one({"id": fid, "is_deleted": False}, {"_id": 0, "owner_hash": 1, "page_count": 1})
    if not fb:
        raise HTTPException(status_code=404, detail="Flipbook not found")
    if x_owner_key and 32 <= len(x_owner_key) <= 128 and owner_hash(x_owner_key) == fb["owner_hash"]:
        return {"ok": True, "skipped": "owner"}
    inc = {f"pages.{p}": 1 for p in body.pages if 0 <= p < fb.get("page_count", 0)}
    if body.open:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        inc.update({"views": 1, f"days.{day}": 1, f"sources.{body.source}": 1})
        try:
            res = await db.visitors.update_one({"flipbook_id": fid, "visitor": body.visitor}, {"$setOnInsert": {"at": now_iso()}}, upsert=True)
            if res.upserted_id:
                inc["unique"] = 1
        except DuplicateKeyError:
            pass
    if inc:
        await db.stats.update_one({"flipbook_id": fid}, {"$inc": inc}, upsert=True)
    return {"ok": True}


@api.get("/flipbooks/{fid}/stats")
async def get_stats(fid: str, x_owner_key: str = Header(None)):
    fb = await owned_flipbook(fid, owner_hash(x_owner_key))
    s = await db.stats.find_one({"flipbook_id": fid}, {"_id": 0}) or {}
    today = datetime.now(timezone.utc).date()
    days = s.get("days", {})
    last30 = [{"date": d, "views": days.get(d, 0)} for d in ((today - timedelta(days=i)).isoformat() for i in range(29, -1, -1))]
    pages = s.get("pages", {})
    return {
        "views": s.get("views", 0), "unique": s.get("unique", 0),
        "sources": {"link": s.get("sources", {}).get("link", 0), "embed": s.get("sources", {}).get("embed", 0)},
        "days": last30, "pages": [pages.get(str(i), 0) for i in range(fb.get("page_count", 0))],
    }


@api.get("/flipbooks/{fid}")
async def get_flipbook(fid: str, x_owner_key: str = Header(None)):
    fb = await db.flipbooks.find_one({"id": fid, "is_deleted": False}, {"_id": 0})
    if not fb:
        raise HTTPException(status_code=404, detail="Flipbook not found")
    view = public_view(fb, await get_brand(fb["owner_hash"]))
    view["is_owner"] = bool(x_owner_key) and 32 <= len(x_owner_key) <= 128 and owner_hash(x_owner_key) == fb["owner_hash"]
    return view


@api.put("/flipbooks/{fid}")
async def update_flipbook(fid: str, body: FlipbookUpdate, x_owner_key: str = Header(None)):
    ohash = owner_hash(x_owner_key)
    fb = await owned_flipbook(fid, ohash)
    changes = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if body.overlays is not None:
        changes["overlays"] = [o.model_dump() for o in body.overlays if o.page < max(fb.get("page_count", 0), 1)]
    changes["updated_at"] = now_iso()
    await db.flipbooks.update_one({"id": fid}, {"$set": changes})
    fb.update(changes)
    view = public_view(fb, await get_brand(ohash))
    view["is_owner"] = True
    return view


@api.delete("/flipbooks/{fid}")
async def delete_flipbook(fid: str, x_owner_key: str = Header(None)):
    ohash = owner_hash(x_owner_key)
    await owned_flipbook(fid, ohash)
    await db.flipbooks.update_one({"id": fid}, {"$set": {"is_deleted": True}})
    await db.files.update_many({"storage_path": {"$regex": f"^{APP_NAME}/pages/{fid}/"}}, {"$set": {"is_deleted": True}})
    return {"ok": True}


@api.post("/media")
async def upload_media(file: UploadFile = File(...), x_owner_key: str = Header(None)):
    ohash = owner_hash(x_owner_key)
    ctype = (file.content_type or "").lower()
    if ctype in IMAGE_TYPES:
        kind, ext, limit = "image", IMAGE_TYPES[ctype], MAX_IMAGE
    elif ctype in VIDEO_TYPES:
        kind, ext, limit = "video", VIDEO_TYPES[ctype], MAX_VIDEO
    else:
        raise HTTPException(status_code=400, detail="Only images (JPG, PNG, WEBP, GIF, SVG) or videos (MP4, WEBM, MOV) are allowed")
    data = await file.read()
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"File too large (max {limit // (1024 * 1024)} MB)")
    if not sniff_ok(data, ext):
        raise HTTPException(status_code=400, detail="The file content doesn't match its type")
    path = await store_file(data, ctype, ext, f"media/{kind}", ohash, file.filename or "")
    return {"path": path, "kind": kind}


@api.get("/files/{path:path}")
async def serve_file(path: str, request: Request):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record or record.get("private"):
        raise HTTPException(status_code=404, detail="File not found")
    local = CACHE_DIR / hashlib.sha1(path.encode()).hexdigest()
    if not local.exists():
        await asyncio.to_thread(download_to, path, local)
    size = local.stat().st_size
    ctype = record["content_type"]
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"}
    if ctype == "image/svg+xml":
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    rng = request.headers.get("range")
    m = re.match(r"bytes=(\d*)-(\d*)", rng or "")
    if not m or (not m.group(1) and not m.group(2)):
        return FileResponse(local, media_type=ctype, headers=headers)
    if m.group(1):
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
    else:
        start, end = max(size - int(m.group(2)), 0), size - 1
    end = min(end, size - 1)
    if start > end:
        raise HTTPException(status_code=416, detail="Range not satisfiable")

    def chunks():
        with open(local, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                buf = f.read(min(1024 * 512, left))
                if not buf:
                    break
                left -= len(buf)
                yield buf

    headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(end - start + 1)})
    return StreamingResponse(chunks(), status_code=206, media_type=ctype, headers=headers)


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await asyncio.to_thread(store.head_bucket, Bucket=S3_BUCKET)
        logger.info(f"Storage ready (bucket: {S3_BUCKET})")
    except Exception as e:
        logger.error(f"Storage check failed: {e}")
    await db.flipbooks.create_index("id", unique=True)
    await db.flipbooks.create_index("owner_hash")
    await db.files.create_index("storage_path")
    await db.brands.create_index("owner_hash", unique=True)
    await db.stats.create_index("flipbook_id", unique=True)
    await db.visitors.create_index([("flipbook_id", 1), ("visitor", 1)], unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
