from fastapi import FastAPI, APIRouter, UploadFile, File, Form, Header, HTTPException, BackgroundTasks, Request, Depends
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
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
import json
import logging
import os
import re
import uuid

import pymupdf as fitz
from toc import parse_toc
import bcrypt
import jwt
import secrets
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
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "").strip()
if S3_ENDPOINT and not S3_ENDPOINT.startswith(("http://", "https://")):
    S3_ENDPOINT = "https://" + S3_ENDPOINT
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


# ---------------------------------------------------------------- accounts
# Each customer is a workspace. Everything a workspace owns (flipbooks, files,
# branding, stats) is tagged owner_hash = "ws:<workspace id>".

TERMS_VERSION = "2026-10-26"
TOKEN_DAYS = 30
JWT_SECRET: Optional[str] = os.environ.get("JWT_SECRET") or None

PLANS = {
    "free":     {"label": "Free",      "flipbooks": 3,    "libraries": 0, "embed": True, "ai_search": False, "storage_mb": 200,   "remove_badge": False},
    "premium":  {"label": "Premium",   "flipbooks": 50,   "libraries": 3, "embed": True, "ai_search": True,  "storage_mb": 5000,  "remove_badge": True},
    "pro_plus": {"label": "Pro Plus",  "flipbooks": None, "libraries": None, "embed": True, "ai_search": True, "storage_mb": 50000, "remove_badge": True},
    "demo":     {"label": "Free demo", "flipbooks": None, "libraries": None, "embed": True, "ai_search": True, "storage_mb": 50000, "remove_badge": True},
}
# Accounts that get the full-feature demo plan on sign-up (comma separated emails)
DEMO_ACCOUNTS = {e.strip().lower() for e in os.environ.get("DEMO_ACCOUNTS", "").split(",") if e.strip()}


def ws_owner(workspace_id: str) -> str:
    return f"ws:{workspace_id}"


def make_token(user_id: str, workspace_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)
    return jwt.encode({"uid": user_id, "ws": workspace_id, "exp": exp}, JWT_SECRET, algorithm="HS256")


def read_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return jwt.decode(authorization[7:].strip(), JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


async def require_owner(authorization: Optional[str] = Header(None)) -> str:
    claims = read_token(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="Please sign in again")
    return ws_owner(claims["ws"])


def optional_owner(authorization: Optional[str]) -> Optional[str]:
    claims = read_token(authorization)
    return ws_owner(claims["ws"]) if claims else None


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "workspace"


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)
    workspace: str = Field(min_length=1, max_length=80)
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def must_accept(cls, v):
        if not v:
            raise ValueError("Please accept the Terms of Service and Privacy Policy")
        return v


class LoginIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=128)


async def account_view(user: dict, ws: dict) -> dict:
    plan = PLANS.get(ws.get("plan", "free"), PLANS["free"])
    return {
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
        "workspace": {"id": ws["id"], "name": ws["name"], "slug": ws["slug"], "plan": ws.get("plan", "free"), "plan_label": plan["label"], "limits": plan},
    }


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
    color2: str = Field("#44546A", max_length=9)
    website: str = Field("", max_length=500)
    font: Literal["Inter", "Roboto", "Georgia"] = "Inter"
    theme: Literal["dark", "light"] = "dark"
    stripe: str = Field("", max_length=500)
    footer: str = Field("", max_length=200)

    @field_validator("color", "color2")
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
    tz: str = Field("", max_length=64)
    seconds: float = Field(0, ge=0, le=120)


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
        "toc": fb.get("toc", []),
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


# One conversion at a time keeps memory low on small servers when many PDFs arrive together.
convert_lock = asyncio.Semaphore(int(os.environ.get("CONVERT_CONCURRENCY", "1")))


async def convert_job(fid: str, data: bytes, ohash: str):
    async with convert_lock:
        await _convert(fid, data, ohash)


async def _convert(fid: str, data: bytes, ohash: str):
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
            text = re.sub(r"\s+", " ", page.get_text()).strip()
            await db.pagetext.update_one({"flipbook_id": fid, "page": i}, {"$set": {"text": text[:20000]}}, upsert=True)
            pages.append(await store_file(img, "image/jpeg", "jpg", f"pages/{fid}", ohash))
            thumbs.append(await store_file(th, "image/jpeg", "jpg", f"pages/{fid}", ohash))
            await db.flipbooks.update_one({"id": fid}, {"$set": {"pages_done": i + 1}})
        try:
            toc = await asyncio.to_thread(parse_toc, doc)
        except Exception:
            toc = []
        doc.close()
        await db.flipbooks.update_one({"id": fid}, {"$set": {"toc": toc}})
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


@api.post("/auth/signup")
async def signup(body: SignupIn):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
    base = slugify(body.workspace)
    slug, n = base, 1
    while await db.workspaces.find_one({"slug": slug}, {"_id": 1}):
        n += 1
        slug = f"{base}-{n}"
    now = now_iso()
    user = {"id": uuid.uuid4().hex, "name": body.name.strip(), "email": email,
            "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
            "terms_version": TERMS_VERSION, "terms_accepted_at": now, "created_at": now}
    ws = {"id": uuid.uuid4().hex, "name": body.workspace.strip(), "slug": slug,
          "plan": "demo" if email in DEMO_ACCOUNTS else "free", "owner_user_id": user["id"], "created_at": now}
    try:
        await db.users.insert_one(dict(user))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
    await db.workspaces.insert_one(dict(ws))
    await db.members.insert_one({"workspace_id": ws["id"], "user_id": user["id"], "role": "owner", "created_at": now})
    return {"token": make_token(user["id"], ws["id"]), **(await account_view(user, ws))}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.strip().lower()}, {"_id": 0})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    member = await db.members.find_one({"user_id": user["id"]}, {"_id": 0})
    ws = await db.workspaces.find_one({"id": member["workspace_id"]}, {"_id": 0}) if member else None
    if not ws:
        raise HTTPException(status_code=403, detail="No workspace is linked to this account")
    return {"token": make_token(user["id"], ws["id"]), **(await account_view(user, ws))}


@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    claims = read_token(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="Please sign in again")
    user = await db.users.find_one({"id": claims["uid"]}, {"_id": 0})
    ws = await db.workspaces.find_one({"id": claims["ws"]}, {"_id": 0})
    if not user or not ws:
        raise HTTPException(status_code=401, detail="Please sign in again")
    return await account_view(user, ws)


@api.get("/brand")
async def read_brand(ohash: str = Depends(require_owner)):
    brand = await get_brand(ohash)
    return Brand(**brand).model_dump() if brand else Brand().model_dump()


@api.put("/brand")
async def save_brand(body: Brand, ohash: str = Depends(require_owner)):
    await db.brands.update_one({"owner_hash": ohash}, {"$set": {**body.model_dump(), "owner_hash": ohash}}, upsert=True)
    return body.model_dump()


@api.post("/flipbooks")
async def create_flipbook(background: BackgroundTasks, file: UploadFile = File(...), title: str = Form(""), ohash: str = Depends(require_owner)):
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
async def list_flipbooks(ohash: str = Depends(require_owner)):
    brand = await get_brand(ohash)
    items = await db.flipbooks.find({"owner_hash": ohash, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(500)
    stats = {s["flipbook_id"]: s.get("views", 0) async for s in db.stats.find({"flipbook_id": {"$in": [f["id"] for f in items]}}, {"_id": 0, "flipbook_id": 1, "views": 1})}
    return [{**public_view(f, brand), "views": stats.get(f["id"], 0)} for f in items]


@api.post("/flipbooks/{fid}/track")
async def track(fid: str, body: TrackEvent, authorization: Optional[str] = Header(None)):
    fb = await db.flipbooks.find_one({"id": fid, "is_deleted": False}, {"_id": 0, "owner_hash": 1, "page_count": 1})
    if not fb:
        raise HTTPException(status_code=404, detail="Flipbook not found")
    if optional_owner(authorization) == fb["owner_hash"]:
        return {"ok": True, "skipped": "owner"}
    pages = [p for p in body.pages if 0 <= p < fb.get("page_count", 0)]
    inc = {f"pages.{p}": 1 for p in pages}
    if body.seconds:
        inc["seconds"] = round(body.seconds, 1)
    if body.open:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        inc.update({"views": 1, f"days.{day}": 1, f"sources.{body.source}": 1})
        region = region_of(body.tz)
        if region:
            inc[f"regions.{region}"] = 1
        try:
            res = await db.visitors.update_one({"flipbook_id": fid, "visitor": body.visitor}, {"$setOnInsert": {"at": now_iso()}}, upsert=True)
            if res.upserted_id:
                inc["unique"] = 1
        except DuplicateKeyError:
            pass
    if pages or body.seconds:
        upd = {"$set": {"last": now_iso()}}
        if pages:
            upd["$addToSet"] = {"pages": {"$each": pages}}
        if body.seconds:
            upd["$inc"] = {"seconds": round(body.seconds, 1)}
        await db.visitors.update_one({"flipbook_id": fid, "visitor": body.visitor}, upd)
    if inc:
        await db.stats.update_one({"flipbook_id": fid}, {"$inc": inc}, upsert=True)
    return {"ok": True}


# Readers' country from the browser time zone: no IP lookup, nothing personal stored.
TZ_COUNTRY = {
    "Asia/Kolkata": "India", "Asia/Calcutta": "India", "Asia/Dubai": "UAE", "Asia/Singapore": "Singapore",
    "Asia/Muscat": "Oman", "Asia/Qatar": "Qatar", "Asia/Riyadh": "Saudi Arabia", "Asia/Bahrain": "Bahrain",
    "Asia/Kuwait": "Kuwait", "Asia/Kathmandu": "Nepal", "Asia/Colombo": "Sri Lanka", "Asia/Dhaka": "Bangladesh",
    "Asia/Hong_Kong": "Hong Kong", "Asia/Tokyo": "Japan", "Asia/Shanghai": "China", "Asia/Kuala_Lumpur": "Malaysia",
    "Asia/Jakarta": "Indonesia", "Asia/Bangkok": "Thailand", "Asia/Seoul": "South Korea", "Asia/Manila": "Philippines",
    "Europe/London": "United Kingdom", "Europe/Dublin": "Ireland", "Europe/Paris": "France", "Europe/Berlin": "Germany",
    "Europe/Amsterdam": "Netherlands", "Europe/Zurich": "Switzerland", "Europe/Luxembourg": "Luxembourg",
    "Europe/Madrid": "Spain", "Europe/Rome": "Italy", "Europe/Stockholm": "Sweden", "Africa/Johannesburg": "South Africa",
    "Africa/Nairobi": "Kenya", "Africa/Lagos": "Nigeria", "Indian/Mauritius": "Mauritius", "America/Toronto": "Canada",
    "America/Vancouver": "Canada", "Pacific/Auckland": "New Zealand",
}


def region_of(tz: str) -> str:
    tz = (tz or "").strip()
    if not re.fullmatch(r"[A-Za-z_]+(/[A-Za-z_+-]+){0,2}", tz):
        return ""
    if tz in TZ_COUNTRY:
        return TZ_COUNTRY[tz]
    area = tz.split("/")[0]
    if area == "America" and tz.split("/")[-1] in {"New_York", "Chicago", "Denver", "Los_Angeles", "Phoenix", "Detroit", "Anchorage"}:
        return "United States"
    if area == "Australia":
        return "Australia"
    return {"Europe": "Europe (other)", "Asia": "Asia (other)", "Africa": "Africa", "America": "Americas", "Pacific": "Pacific"}.get(area, "Other")


@api.get("/flipbooks/{fid}/stats")
async def get_stats(fid: str, ohash: str = Depends(require_owner)):
    fb = await owned_flipbook(fid, ohash)
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
async def get_flipbook(fid: str, authorization: Optional[str] = Header(None)):
    fb = await db.flipbooks.find_one({"id": fid, "is_deleted": False}, {"_id": 0})
    if not fb:
        raise HTTPException(status_code=404, detail="Flipbook not found")
    view = public_view(fb, await get_brand(fb["owner_hash"]))
    view["is_owner"] = optional_owner(authorization) == fb["owner_hash"]
    return view


@api.put("/flipbooks/{fid}")
async def update_flipbook(fid: str, body: FlipbookUpdate, ohash: str = Depends(require_owner)):
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
async def delete_flipbook(fid: str, ohash: str = Depends(require_owner)):
    await owned_flipbook(fid, ohash)
    await db.flipbooks.update_one({"id": fid}, {"$set": {"is_deleted": True}})
    await db.files.update_many({"storage_path": {"$regex": f"^{APP_NAME}/pages/{fid}/"}}, {"$set": {"is_deleted": True}})
    return {"ok": True}


@api.post("/media")
async def upload_media(file: UploadFile = File(...), ohash: str = Depends(require_owner)):
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


# ---------------------------------------------------------------- libraries
# A library is a public, branded shelf of a workspace's flipbooks (e.g. a
# monthly newsletter archive) with search across every page.

MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}
MONTH_ABBR = {m[:3]: i for m, i in MONTHS.items()}
MONTH_NAMES = {i: m.capitalize() for m, i in MONTHS.items()}


def guess_issue(name: str) -> dict:
    """'Monthly Communique_October 2026' -> label October 2026, date 2026-10.
    Anything that isn't a plain monthly issue is marked as a special edition."""
    base = re.sub(r"\.pdf$", "", name, flags=re.I)
    m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_\-.,]*((?:19|20)\d{2})", base, re.I)
    if not m:
        return {"label": clean_title(base), "date": "", "special": True, "kind": "Special edition"}
    month, year = MONTH_ABBR[m.group(1).lower()], int(m.group(2))
    when = f"{MONTH_NAMES[month]} {year}"
    special = not re.search(r"monthly", base, re.I)
    kind = ""
    if special:
        words = [w for w in re.sub(r"[_\-]+", " ", base[:m.start()]).split() if w.lower() not in ("sdu", "communique", "the")]
        words = [w if w.isupper() else w.lower() for w in words]
        kind = (" ".join(words) + " edition").strip()
        kind = kind[0].upper() + kind[1:] if words else "Special edition"
    return {"label": when, "date": f"{year:04d}-{month:02d}", "special": special, "kind": kind}


def clean_title(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_]+", " ", t)).strip()[:150]


class LibraryItem(BaseModel):
    flipbook_id: str = Field(max_length=40)
    label: str = Field("", max_length=120)
    date: str = Field("", pattern=r"^(\d{4}-\d{2})?$")
    special: bool = False
    kind: str = Field("", max_length=60)


class LibraryIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subtitle: str = Field("", max_length=300)


class LibraryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    subtitle: Optional[str] = Field(None, max_length=300)
    items: Optional[List[LibraryItem]] = Field(None, max_length=500)
    pitch_title: Optional[str] = Field(None, max_length=80)
    pitch_text: Optional[str] = Field(None, max_length=400)
    offer_credentials: Optional[bool] = None


class AddItem(BaseModel):
    flipbook_id: str = Field(max_length=40)
    filename: str = Field("", max_length=300)


async def workspace_plan(ohash: str) -> dict:
    ws = await db.workspaces.find_one({"id": ohash.split(":", 1)[1]}, {"_id": 0, "plan": 1}) if ohash.startswith("ws:") else None
    return PLANS.get((ws or {}).get("plan", "free"), PLANS["free"])


async def owned_library(lid: str, ohash: str) -> dict:
    lib = await db.libraries.find_one({"id": lid, "is_deleted": False}, {"_id": 0})
    if not lib or lib["owner_hash"] != ohash:
        raise HTTPException(status_code=404, detail="Library not found")
    return lib


def sort_items(items: list) -> list:
    return sorted(items, key=lambda i: (i.get("date") or "0000-00", not i.get("special")), reverse=True)


async def library_view(lib: dict, public: bool) -> dict:
    ids = [i["flipbook_id"] for i in lib.get("items", [])]
    books = {b["id"]: b async for b in db.flipbooks.find({"id": {"$in": ids}, "is_deleted": False},
                                                          {"_id": 0, "id": 1, "title": 1, "status": 1, "thumbs": 1, "pages": 1, "page_count": 1, "pages_done": 1, "toc": 1, "page_width": 1, "page_height": 1})}
    items = []
    for it in sort_items(lib.get("items", [])):
        b = books.get(it["flipbook_id"])
        if not b or (public and b["status"] != "ready"):
            continue
        items.append({**it, "status": b["status"], "page_count": b.get("page_count", 0), "pages_done": b.get("pages_done", 0),
                      "cover": (b.get("pages") or [""])[0], "thumb": (b.get("thumbs") or [""])[0],
                      "aspect": (b.get("page_width") or 595) / max(b.get("page_height") or 842, 1),
                      "toc": b.get("toc", []) if public else [], "title": b["title"]})
    plan = await workspace_plan(lib["owner_hash"])
    brand = await get_brand(lib["owner_hash"])
    return {"id": lib["id"], "slug": lib["slug"], "title": lib["title"], "subtitle": lib.get("subtitle", ""),
            "items": items, "brand": Brand(**brand).model_dump() if brand else Brand().model_dump(),
            "show_badge": not plan["remove_badge"], "updated_at": lib.get("updated_at", lib["created_at"]),
            "pitch_title": lib.get("pitch_title", ""), "pitch_text": lib.get("pitch_text", ""),
            "offer_credentials": bool(lib.get("offer_credentials"))}


@api.get("/libraries")
async def list_libraries(ohash: str = Depends(require_owner)):
    libs = await db.libraries.find({"owner_hash": ohash, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [await library_view(l, public=False) for l in libs]


@api.post("/libraries")
async def create_library(body: LibraryIn, ohash: str = Depends(require_owner)):
    plan = await workspace_plan(ohash)
    count = await db.libraries.count_documents({"owner_hash": ohash, "is_deleted": False})
    if plan["libraries"] is not None and count >= plan["libraries"]:
        raise HTTPException(status_code=403, detail="Libraries are available on the Premium and Pro Plus plans")
    base = slugify(body.title)
    slug, n = base, 1
    while await db.libraries.find_one({"slug": slug}, {"_id": 1}):
        n += 1
        slug = f"{base}-{n}"
    lib = {"id": uuid.uuid4().hex[:12], "slug": slug, "owner_hash": ohash, "title": body.title.strip(),
           "subtitle": body.subtitle.strip(), "items": [], "is_deleted": False, "created_at": now_iso()}
    await db.libraries.insert_one(dict(lib))
    return await library_view(lib, public=False)


@api.get("/libraries/{lid}")
async def get_library(lid: str, ohash: str = Depends(require_owner)):
    return await library_view(await owned_library(lid, ohash), public=False)


@api.put("/libraries/{lid}")
async def update_library(lid: str, body: LibraryUpdate, ohash: str = Depends(require_owner)):
    lib = await owned_library(lid, ohash)
    changes = {}
    if body.title is not None:
        changes["title"] = body.title.strip()
    if body.subtitle is not None:
        changes["subtitle"] = body.subtitle.strip()
    for k in ("pitch_title", "pitch_text"):
        v = getattr(body, k)
        if v is not None:
            changes[k] = v.strip()
    if body.offer_credentials is not None:
        changes["offer_credentials"] = body.offer_credentials
    if body.items is not None:
        mine = {b["id"] async for b in db.flipbooks.find({"id": {"$in": [i.flipbook_id for i in body.items]}, "owner_hash": ohash}, {"_id": 0, "id": 1})}
        changes["items"] = [i.model_dump() for i in body.items if i.flipbook_id in mine]
    changes["updated_at"] = now_iso()
    await db.libraries.update_one({"id": lid}, {"$set": changes})
    lib.update(changes)
    search_cache.pop(lib["slug"], None)
    return await library_view(lib, public=False)


@api.post("/libraries/{lid}/items")
async def add_library_item(lid: str, body: AddItem, ohash: str = Depends(require_owner)):
    lib = await owned_library(lid, ohash)
    await owned_flipbook(body.flipbook_id, ohash)
    items = [i for i in lib.get("items", []) if i["flipbook_id"] != body.flipbook_id]
    items.append({"flipbook_id": body.flipbook_id, **guess_issue(body.filename or body.flipbook_id)})
    await db.libraries.update_one({"id": lid}, {"$set": {"items": items, "updated_at": now_iso()}})
    lib["items"] = items
    search_cache.pop(lib["slug"], None)
    return await library_view(lib, public=False)


@api.delete("/libraries/{lid}")
async def delete_library(lid: str, ohash: str = Depends(require_owner)):
    lib = await owned_library(lid, ohash)
    await db.libraries.update_one({"id": lid}, {"$set": {"is_deleted": True}})
    search_cache.pop(lib["slug"], None)
    return {"ok": True}


@api.get("/libraries/{lid}/stats")
async def library_stats(lid: str, ohash: str = Depends(require_owner)):
    lib = await owned_library(lid, ohash)
    meta = {i["flipbook_id"]: i for i in lib.get("items", [])}
    ids = list(meta)
    stats = {s["flipbook_id"]: s async for s in db.stats.find({"flipbook_id": {"$in": ids}}, {"_id": 0})}
    readers: Dict[str, list] = {}
    async for v in db.visitors.find({"flipbook_id": {"$in": ids}}, {"_id": 0, "flipbook_id": 1, "visitor": 1, "pages": 1, "seconds": 1}):
        readers.setdefault(v["flipbook_id"], []).append(v)
    today = datetime.now(timezone.utc).date()
    span = [(today - timedelta(days=i)).isoformat() for i in range(29, -1, -1)]
    days = {d: 0 for d in span}
    regions: Dict[str, int] = {}
    rows, people = [], set()
    for fid in ids:
        s, rs = stats.get(fid, {}), readers.get(fid, [])
        for d in span:
            days[d] += s.get("days", {}).get(d, 0)
        for k, n in s.get("regions", {}).items():
            regions[k] = regions.get(k, 0) + n
        people.update(r["visitor"] for r in rs)
        pages = s.get("pages", {})
        top = sorted(((int(k), n) for k, n in pages.items()), key=lambda x: -x[1])[:3]
        it = meta[fid]
        rows.append({"flipbook_id": fid, "label": f"{it.get('kind')}, {it.get('label')}" if it.get("special") else it.get("label", ""),
                     "date": it.get("date", ""), "views": s.get("views", 0), "readers": len(rs),
                     "avg_pages": round(sum(len(r.get("pages", [])) for r in rs) / len(rs), 1) if rs else 0,
                     "avg_seconds": round(sum(r.get("seconds", 0) for r in rs) / len(rs)) if rs else 0,
                     "top_pages": [{"page": p, "views": n} for p, n in top]})
    useful: Dict[str, int] = {}
    async for r in db.reactions.find({"flipbook_id": {"$in": ids}}, {"_id": 0, "flipbook_id": 1}):
        useful[r["flipbook_id"]] = useful.get(r["flipbook_id"], 0) + 1
    for r in rows:
        r["useful"] = useful.get(r["flipbook_id"], 0)
    rows.sort(key=lambda r: r["date"], reverse=True)
    all_readers = [r for rs in readers.values() for r in rs]
    return {
        "views": sum(r["views"] for r in rows), "readers": len(people),
        "pages_read": sum(len(r.get("pages", [])) for r in all_readers),
        "avg_seconds": round(sum(r.get("seconds", 0) for r in all_readers) / len(all_readers)) if all_readers else 0,
        "days": [{"date": d, "views": days[d]} for d in span],
        "regions": sorted(({"name": k, "views": n} for k, n in regions.items()), key=lambda r: -r["views"]),
        "items": rows,
        "subscribers": await db.subscribers.count_documents({"library_id": lid}),
        "useful": sum(useful.values()),
    }


# ---------------------------------------------------------------- "Was this useful?"
class UsefulIn(BaseModel):
    flipbook_id: str = Field(max_length=40)
    visitor: str = Field(pattern=r"^[a-f0-9]{16,64}$")
    on: bool = True


@api.post("/public/libraries/{slug}/useful")
async def mark_useful(slug: str, body: UsefulIn):
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0, "items": 1})
    if not lib or body.flipbook_id not in {i["flipbook_id"] for i in lib.get("items", [])}:
        raise HTTPException(status_code=404, detail="Issue not found")
    key = {"flipbook_id": body.flipbook_id, "visitor": body.visitor}
    if body.on:
        await db.reactions.update_one(key, {"$setOnInsert": {"at": now_iso()}}, upsert=True)
    else:
        await db.reactions.delete_one(key)
    return {"ok": True}


# Share links point here so LinkedIn and WhatsApp show the issue's cover and title,
# then the visitor is sent on to the library itself.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://flipcraft.onrender.com").rstrip("/")


@api.get("/share/{slug}")
async def share_page(slug: str, request: Request, issue: str = "", page: int = 0):
    import html as h
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0})
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    view = await library_view(lib, public=True)
    brand = view["brand"].get("name") or ""
    it = next((i for i in view["items"] if i["flipbook_id"] == issue), None) or (view["items"][0] if view["items"] else None)
    target = f"{FRONTEND_URL}/library/{slug}"
    title = f"{view['title']}" + (f" | {brand}" if brand else "")
    desc = view.get("pitch_text") or view.get("subtitle") or f"Every issue of {view['title']}, searchable in one place."
    image = ""
    if issue and it:
        target += f"?issue={it['flipbook_id']}" + (f"&page={page}" if page > 1 else "")
        name = f"{it['kind']}, {it['label']}" if it.get("special") and it.get("date") else it["label"]
        title = f"{view['title']}: {name}" + (f" | {brand}" if brand else "")
        heads = [s["section"] for s in (it.get("toc") or [])][:5]
        if heads:
            desc = "In this issue: " + ", ".join(heads) + "."
    if it and it.get("cover"):
        image = str(request.base_url).rstrip("/") + "/api/files/" + it["cover"]
        if request.headers.get("x-forwarded-proto") == "https":
            image = image.replace("http://", "https://", 1)
    e = lambda v: h.escape(v, quote=True)
    body = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="article"><meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{e(target)}">
{f'<meta property="og:image" content="{e(image)}">' if image else ''}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url={e(target)}">
</head><body><p><a href="{e(target)}">Open {e(view['title'])}</a></p>
<script>location.replace({json.dumps(target)})</script></body></html>"""
    return HTMLResponse(body)


# ---------------------------------------------------------------- add to home screen
# Each library can be saved to a phone's home screen as its own app: a manifest
# for Android/Chrome and a square brand icon (also used as the iPhone icon).
icon_cache: Dict[str, bytes] = {}


def make_icon(logo_file: Optional[Path], color: str, size: int) -> bytes:
    from PIL import Image
    import io
    hexv = (color or "#204262").lstrip("#")
    try:
        bg = tuple(int(hexv[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        bg = (32, 66, 98)
    img = Image.new("RGBA", (size, size), bg + (255,))
    if logo_file and logo_file.exists():
        try:
            logo = Image.open(logo_file).convert("RGBA")
            alpha = logo.getchannel("A")
            white = Image.new("RGBA", logo.size, (255, 255, 255, 255))
            white.putalpha(alpha)  # logo drawn in white, like the library header
            box = int(size * 0.62)  # stays inside the safe zone of round/maskable icons
            white.thumbnail((box, box), Image.LANCZOS)
            img.alpha_composite(white, ((size - white.width) // 2, (size - white.height) // 2))
        except Exception:
            pass
    out = io.BytesIO()
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out.getvalue()


@api.get("/icon/{slug}/{size}.png")
async def library_icon(slug: str, size: int):
    if size not in (180, 192, 512):
        raise HTTPException(status_code=404, detail="Icon not found")
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0, "owner_hash": 1})
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    brand = await get_brand(lib["owner_hash"]) or {}
    key = f"{slug}:{size}:{brand.get('logo', '')}:{brand.get('color', '')}"
    if key not in icon_cache:
        local = None
        if brand.get("logo"):
            local = CACHE_DIR / hashlib.sha1(brand["logo"].encode()).hexdigest()
            if not local.exists():
                try:
                    await asyncio.to_thread(download_to, brand["logo"], local)
                except Exception:
                    local = None
        icon_cache[key] = await asyncio.to_thread(make_icon, local, brand.get("color") or "#204262", size)
    return Response(icon_cache[key], media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/manifest/{slug}.webmanifest")
async def library_manifest(slug: str, request: Request):
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0, "owner_hash": 1, "title": 1})
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    brand = await get_brand(lib["owner_hash"]) or {}
    name = brand.get("name") or ""
    short = "".join(w[0] for w in re.findall(r"[A-Z][a-z]*", name.replace("LLP", "")) if w)[:4]
    base = str(request.base_url).rstrip("/")
    if request.headers.get("x-forwarded-proto") == "https":
        base = base.replace("http://", "https://", 1)
    words = lib["title"].split()
    manifest = {
        "name": f"{short} {lib['title']}".strip() if short else lib["title"],
        "short_name": (words[-1] if len(lib["title"]) > 12 else lib["title"])[:12],
        "start_url": f"{FRONTEND_URL}/library/{slug}",
        "scope": f"{FRONTEND_URL}/library/{slug}",
        "id": f"{FRONTEND_URL}/library/{slug}",
        "display": "standalone",
        "background_color": "#0a1626",
        "theme_color": "#0a1626",
        "icons": [{"src": f"{base}/api/icon/{slug}/{n}.png", "sizes": f"{n}x{n}", "type": "image/png", "purpose": "any maskable"} for n in (192, 512)],
    }
    return JSONResponse(manifest, media_type="application/manifest+json")


# ---------------------------------------------------------------- subscribers (leads)
class SubscribeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    organisation: str = Field("", max_length=160)
    phone: str = Field("", max_length=40)
    interests: List[str] = Field(default_factory=list, max_length=12)
    message: str = Field("", max_length=1000)
    issue: str = Field("", max_length=40)
    website: str = Field("", max_length=200)  # honeypot: people never see this field
    wants_credentials: bool = False


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
subscribe_hits: Dict[str, list] = {}


@api.post("/public/libraries/{slug}/subscribe")
async def subscribe(slug: str, body: SubscribeIn, request: Request):
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0, "id": 1, "owner_hash": 1})
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    if body.website:
        return {"ok": True}
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    now = datetime.now(timezone.utc).timestamp()
    hits = [t for t in subscribe_hits.get(ip, []) if now - t < 3600]
    if len(hits) >= 8:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    subscribe_hits[ip] = hits + [now]
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    # A repeat sign-up only adds to what we know; it never blanks earlier answers.
    doc = {"name": body.name.strip(), "updated_at": now_iso()}
    for k in ("organisation", "phone", "message", "issue"):
        v = getattr(body, k).strip()
        if v:
            doc[k] = v
    upd = {"$set": doc, "$setOnInsert": {"id": uuid.uuid4().hex[:12], "owner_hash": lib["owner_hash"], "status": "new", "created_at": now_iso()}}
    if body.wants_credentials:
        doc["wants_credentials"] = True
    interests = [i.strip()[:60] for i in body.interests if i.strip()]
    if interests:
        upd["$addToSet"] = {"interests": {"$each": interests}}
    await db.subscribers.update_one({"library_id": lib["id"], "email": email}, upd, upsert=True)
    return {"ok": True}


@api.get("/libraries/{lid}/subscribers")
async def list_subscribers(lid: str, ohash: str = Depends(require_owner)):
    await owned_library(lid, ohash)
    return await db.subscribers.find({"library_id": lid}, {"_id": 0}).sort("created_at", -1).to_list(5000)


class SubscriberUpdate(BaseModel):
    status: Literal["new", "contacted", "added"]


@api.put("/libraries/{lid}/subscribers/{sid}")
async def update_subscriber(lid: str, sid: str, body: SubscriberUpdate, ohash: str = Depends(require_owner)):
    await owned_library(lid, ohash)
    res = await db.subscribers.update_one({"library_id": lid, "id": sid}, {"$set": {"status": body.status}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    return {"ok": True}


@api.delete("/libraries/{lid}/subscribers/{sid}")
async def delete_subscriber(lid: str, sid: str, ohash: str = Depends(require_owner)):
    await owned_library(lid, ohash)
    await db.subscribers.delete_one({"library_id": lid, "id": sid})
    return {"ok": True}


@api.get("/public/libraries/{slug}")
async def public_library(slug: str):
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0})
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    return await library_view(lib, public=True)


# Search: page texts for a library are loaded once and kept in memory for a few minutes.
search_cache: Dict[str, dict] = {}
STOP = {"the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "are", "what", "how", "about", "with", "by", "from", "at", "be"}


async def library_pages(slug: str) -> Optional[dict]:
    hit = search_cache.get(slug)
    if hit and (datetime.now(timezone.utc) - hit["at"]).total_seconds() < 600:
        return hit
    lib = await db.libraries.find_one({"slug": slug, "is_deleted": False}, {"_id": 0})
    if not lib:
        return None
    meta = {i["flipbook_id"]: i for i in lib.get("items", [])}
    ready = {b["id"]: b async for b in db.flipbooks.find({"id": {"$in": list(meta)}, "is_deleted": False, "status": "ready"}, {"_id": 0, "id": 1, "thumbs": 1})}
    pages = [{**p, "text": clean_page_text(p["text"])} async for p in db.pagetext.find({"flipbook_id": {"$in": list(ready)}}, {"_id": 0})]
    entry = {"at": datetime.now(timezone.utc), "meta": meta, "ready": ready, "pages": pages}
    search_cache[slug] = entry
    return entry


HEADER_NOISE = re.compile(r"(?i)monthly communique\s*\|\s*[a-z]+\s+\d{4}|page \d+ of \d+|bengalurua?\s*\|\s*a?mumbai")


def clean_page_text(text: str) -> str:
    text = re.sub(r"[\uf000-\uf0ff\u2022\u25aa\u25cf\u27a2]", " ", text)  # PDF bullet glyphs
    return re.sub(r"\s+", " ", HEADER_NOISE.sub(" ", text)).strip()


def make_snippet(text: str, terms: List[str], width: int = 220) -> str:
    low = text.lower()
    pos = min([low.find(t) for t in terms if low.find(t) >= 0] or [0])
    start = max(0, pos - width // 3)
    snip = text[start:start + width]
    return ("…" if start else "") + snip.strip() + ("…" if start + width < len(text) else "")


@api.get("/public/libraries/{slug}/search")
async def search_library(slug: str, q: str = ""):
    q = q.strip()[:120]
    if len(q) < 2:
        return {"query": q, "results": []}
    data = await library_pages(slug)
    if data is None:
        raise HTTPException(status_code=404, detail="Library not found")
    words = [w for w in re.findall(r"[a-z0-9][a-z0-9\-\.]*", q.lower()) if w not in STOP] or [q.lower()]
    phrase = q.lower()
    scored = []
    for p in data["pages"]:
        low = p["text"].lower()
        hits = [low.count(w) for w in words]
        if not all(hits):
            continue
        score = sum(min(h, 5) for h in hits) + (8 if phrase in low else 0) - (4 if p["page"] == 0 else 0)
        scored.append((score, p))
    scored.sort(key=lambda x: (-x[0], data["meta"].get(x[1]["flipbook_id"], {}).get("date", "")), reverse=False)
    results = []
    for score, p in scored[:30]:
        m = data["meta"].get(p["flipbook_id"], {})
        thumbs = data["ready"].get(p["flipbook_id"], {}).get("thumbs", [])
        results.append({"flipbook_id": p["flipbook_id"], "page": p["page"], "label": m.get("label", ""), "kind": m.get("kind", ""),
                        "date": m.get("date", ""), "thumb": thumbs[p["page"]] if p["page"] < len(thumbs) else "",
                        "snippet": make_snippet(p["text"], words), "score": round(score, 1)})
    return {"query": q, "terms": words, "results": results}


# Related pages: other issues that share this page's most distinctive terms (TF-IDF, no AI).
RELATED_STOP = STOP | {m for m in MONTHS} | {"page", "communique", "monthly", "dated", "vide", "shall", "also", "such", "which", "under",
                                             "have", "been", "will", "this", "that", "into", "their", "there", "where", "other", "notified",
                                             "notification", "circular", "rules", "rule", "section", "provided", "issued", "regard", "case"}


def _terms(text: str) -> List[str]:
    return [w for w in re.findall(r"[a-z][a-z0-9\-]{2,}", text.lower()) if w not in RELATED_STOP]


def build_vectors(data: dict) -> dict:
    import math
    docs = {}
    df: Dict[str, int] = {}
    for p in data["pages"]:
        if p["page"] == 0:
            continue  # cover pages repeat the contents list
        tf: Dict[str, int] = {}
        for w in _terms(p["text"]):
            tf[w] = tf.get(w, 0) + 1
        docs[(p["flipbook_id"], p["page"])] = tf
        for w in tf:
            df[w] = df.get(w, 0) + 1
    n = max(len(docs), 1)
    vecs = {}
    for key, tf in docs.items():
        v = {w: (1 + math.log(c)) * math.log(n / df[w]) for w, c in tf.items() if 1 < df[w] < n * 0.35}
        top = dict(sorted(v.items(), key=lambda x: -x[1])[:40])
        norm = math.sqrt(sum(x * x for x in top.values())) or 1
        vecs[key] = {w: x / norm for w, x in top.items()}
    return vecs


@api.get("/public/libraries/{slug}/related")
async def related_pages(slug: str, flipbook_id: str, page: int = 1):
    data = await library_pages(slug)
    if data is None:
        raise HTTPException(status_code=404, detail="Library not found")
    if "vectors" not in data:
        data["vectors"] = await asyncio.to_thread(build_vectors, data)
    vecs = data["vectors"]
    pages = [page, page + 1] if page > 0 else [1]
    q: Dict[str, float] = {}
    for pg in pages:
        for w, x in vecs.get((flipbook_id, pg), {}).items():
            q[w] = q.get(w, 0) + x
    if not q:
        return {"results": []}
    scored = []
    for (fid, pg), v in vecs.items():
        if fid == flipbook_id:
            continue
        shared = [w for w in q if w in v]
        if len(shared) < 2:
            continue
        s = sum(q[w] * v[w] for w in shared)
        scored.append((s, fid, pg, sorted(shared, key=lambda w: -q[w] * v[w])[:3]))
    scored.sort(key=lambda x: -x[0])
    out, per_issue = [], {}
    texts = {(p["flipbook_id"], p["page"]): p["text"] for p in data["pages"]}
    for s, fid, pg, terms in scored:
        if s < 0.1 or per_issue.get(fid, 0) >= 1:
            continue
        per_issue[fid] = 1
        m = data["meta"].get(fid, {})
        thumbs = data["ready"].get(fid, {}).get("thumbs", [])
        out.append({"flipbook_id": fid, "page": pg, "label": m.get("label", ""), "kind": m.get("kind", ""),
                    "thumb": thumbs[pg] if pg < len(thumbs) else "", "terms": terms,
                    "snippet": make_snippet(texts.get((fid, pg), ""), terms, 150), "score": round(s, 3)})
        if len(out) >= 4:
            break
    return {"results": out}


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
    global JWT_SECRET
    if not JWT_SECRET:
        # one stable signing secret per deployment, kept in the database
        doc = await db.settings.find_one({"_id": "jwt_secret"})
        if not doc:
            try:
                await db.settings.insert_one({"_id": "jwt_secret", "value": secrets.token_urlsafe(48)})
            except DuplicateKeyError:
                pass
            doc = await db.settings.find_one({"_id": "jwt_secret"})
        JWT_SECRET = doc["value"]
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.workspaces.create_index("id", unique=True)
    await db.workspaces.create_index("slug", unique=True)
    await db.members.create_index([("workspace_id", 1), ("user_id", 1)], unique=True)
    await db.libraries.create_index("slug", unique=True)
    await db.libraries.create_index("owner_hash")
    await db.subscribers.create_index([("library_id", 1), ("email", 1)], unique=True)
    await db.reactions.create_index([("flipbook_id", 1), ("visitor", 1)], unique=True)
    await db.pagetext.create_index([("flipbook_id", 1), ("page", 1)], unique=True)
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
