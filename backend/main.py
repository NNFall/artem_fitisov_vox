import asyncio
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import aiohttp
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Path as ApiPath, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import Call, SessionLocal
from voximplant.apiclient import VoximplantAPI

BASE_DIR = Path(__file__).resolve().parent
LOG_PATH = BASE_DIR / "backend.log"
RECORDINGS_DIR = BASE_DIR / "recordings"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"), logging.StreamHandler()],
)
logger = logging.getLogger("artem_fitisov_backend")

load_dotenv(BASE_DIR / ".env")

PROJECT_NAME = "artem_fitisov"
BACKEND_WEBHOOK_SECRET = os.getenv("BACKEND_WEBHOOK_SECRET", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_ADMIN_CHAT_ID = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "").strip()
TELEGRAM_USER_CHAT_IDS_STR = os.getenv("TELEGRAM_USER_CHAT_IDS", "")
GOOGLE_APPS_SCRIPT_WEBHOOK_URL = os.getenv("GOOGLE_APPS_SCRIPT_WEBHOOK_URL", "").strip()
RECORDINGS_TTL_DAYS = int(os.getenv("RECORDINGS_TTL_DAYS", "30"))
CLEANUP_INTERVAL_HOURS = int(os.getenv("CLEANUP_INTERVAL_HOURS", "24"))
DELIVERY_RETRY_ATTEMPTS = max(1, int(os.getenv("DELIVERY_RETRY_ATTEMPTS", "3")))
DELIVERY_RETRY_DELAY_MS = max(100, int(os.getenv("DELIVERY_RETRY_DELAY_MS", "700")))
DOWNLOAD_RETRY_ATTEMPTS = max(1, int(os.getenv("DOWNLOAD_RETRY_ATTEMPTS", "3")))
DOWNLOAD_RETRY_DELAY_MS = max(100, int(os.getenv("DOWNLOAD_RETRY_DELAY_MS", "1200")))
VOXIMPLANT_CREDENTIALS_FILE_PATH = os.getenv("VOXIMPLANT_CREDENTIALS_FILE_PATH", "").strip()

RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

bot: Optional[Bot] = None
if TELEGRAM_BOT_TOKEN:
    bot = Bot(
        token=TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
else:
    logger.warning("TELEGRAM_BOT_TOKEN is not configured. Telegram delivery is disabled.")

scheduler = AsyncIOScheduler()
voximplant_api_client: Optional[VoximplantAPI] = None

if VOXIMPLANT_CREDENTIALS_FILE_PATH:
    try:
        voximplant_api_client = VoximplantAPI(VOXIMPLANT_CREDENTIALS_FILE_PATH)
        logger.info("Voximplant credentials loaded from %s", VOXIMPLANT_CREDENTIALS_FILE_PATH)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to initialize VoximplantAPI from credentials file")


class CallStartedPayload(BaseModel):
    session_id: str
    project: str = PROJECT_NAME
    script_name: Optional[str] = None
    caller_phone: Optional[str] = None
    connected_at_utc: Optional[str] = None


class CallFinishedPayload(BaseModel):
    session_id: str
    duration: Optional[int] = None
    summary: Optional[str] = None
    finished_at_utc: Optional[str] = None
    status: Optional[str] = None


class RecordingReadyPayload(BaseModel):
    session_id: str
    project: str = PROJECT_NAME
    script_name: Optional[str] = None
    recording_url: str
    recording_status: Optional[str] = None
    recording_error: Optional[str] = None


class CallReportPayload(BaseModel):
    report_type: str
    text: str
    call_id: Optional[str] = None


class FinalizePayload(BaseModel):
    session_id: str
    project: str = PROJECT_NAME
    script_name: Optional[str] = None
    exported_at_utc: Optional[str] = None
    finalization_reason: Optional[str] = None
    model: Optional[str] = None
    caller_phone: Optional[str] = None
    client_phone: Optional[str] = None
    client_name: Optional[str] = None
    call_duration_sec: Optional[int] = None
    telephony_cost_rub: Optional[float] = None
    websocket_duration_sec: Optional[float] = None
    websocket_cost_rub: Optional[float] = None
    voximplant_total_rub: Optional[float] = None
    ai_cost_usd: Optional[float] = None
    ai_cost_rub: Optional[float] = None
    total_cost_rub: Optional[float] = None
    summary: Optional[str] = None
    call_goal: Optional[str] = None
    manager_offer: Optional[str] = None
    outcome: Optional[str] = None
    next_step: Optional[str] = None
    dialogue_text: Optional[str] = None
    recording_status: Optional[str] = None
    recording_url: Optional[str] = None
    recording_error: Optional[str] = None
    usage: dict[str, Any] = Field(default_factory=dict)
    summary_fields: dict[str, Any] = Field(default_factory=dict)
    dialogue_items: list[dict[str, Any]] = Field(default_factory=list)
    admin_report_html: Optional[str] = None
    summary_report_html: Optional[str] = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def safe_text(value: Any) -> str:
    return "" if value is None else str(value)


def safe_float(value: Any) -> Optional[float]:
    if value in ("", None):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def safe_int(value: Any) -> Optional[int]:
    if value in ("", None):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def to_json_text(value: Any) -> Optional[str]:
    if value in (None, "", [], {}):
        return None
    return json.dumps(value, ensure_ascii=False)


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    text = safe_text(value).strip()
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def normalize_chat_ids(raw_value: str) -> list[str]:
    normalized = safe_text(raw_value).replace(";", ",").replace("\n", ",")
    return [item.strip() for item in normalized.split(",") if item.strip()]


def dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def backoff_seconds(base_delay_ms: int, attempt: int) -> float:
    return (base_delay_ms * attempt) / 1000.0


async def wait_before_retry(base_delay_ms: int, attempt: int):
    await asyncio.sleep(backoff_seconds(base_delay_ms, attempt))


def get_admin_chat_ids() -> list[str]:
    return normalize_chat_ids(TELEGRAM_ADMIN_CHAT_ID)


def get_summary_chat_ids() -> list[str]:
    return dedupe(get_admin_chat_ids() + normalize_chat_ids(TELEGRAM_USER_CHAT_IDS_STR))


def require_webhook_secret(request: Request):
    if not BACKEND_WEBHOOK_SECRET:
        return

    supplied = request.headers.get("X-Webhook-Secret", "").strip()
    if supplied != BACKEND_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="invalid webhook secret")


def get_or_create_call(db: Session, session_id: str) -> Call:
    db_call = db.query(Call).filter(Call.voximplant_session_id == session_id).first()
    if db_call:
        return db_call

    db_call = Call(
        voximplant_session_id=session_id,
        status="started",
        started_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(db_call)
    db.flush()
    return db_call


def set_if_value(obj: Any, field_name: str, value: Any):
    if value in ("", None):
        return
    setattr(obj, field_name, value)


QUESTION_MARKS_RE = re.compile(r"^[\s?]+$")


def display_or_default(value: Any, default: str = "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e") -> str:
    text = safe_text(value).strip()
    if not text:
        return default
    if QUESTION_MARKS_RE.fullmatch(text):
        return default
    return text


def is_diagnostic_finalize(payload: "FinalizePayload") -> bool:
    session_id = safe_text(payload.session_id).strip().lower()
    script_name = safe_text(payload.script_name).strip().lower()
    return session_id.startswith("manual-test-") or script_name in {"manual", "test", "debug"}


DEFAULT_NOT_SPECIFIED = "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e"
DEFAULT_UNKNOWN = "\u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e"
DEFAULT_NO_DIALOGUE = "\u0420\u0435\u043f\u043b\u0438\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b."

def render_admin_report(payload: FinalizePayload) -> str:
    usage_text = safe_text(payload.usage).strip() or "{}"
    lines = [
        "<b>\u0417\u0432\u043e\u043d\u043e\u043a \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d</b>",
        f"<b>\u041d\u043e\u043c\u0435\u0440:</b> {display_or_default(payload.client_phone or payload.caller_phone or DEFAULT_UNKNOWN, DEFAULT_UNKNOWN)}",
        f"<b>\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c:</b> {safe_text(payload.call_duration_sec or 0)} \u0441\u0435\u043a",
        f"<b>\u0422\u0435\u043b\u0435\u0444\u043e\u043d\u0438\u044f:</b> {safe_text(payload.voximplant_total_rub or payload.telephony_cost_rub or 0)} \u0440\u0443\u0431",
        f"<b>AI:</b> {safe_text(payload.ai_cost_rub or 0)} \u0440\u0443\u0431 ({safe_text(payload.ai_cost_usd or 0)} USD)",
        f"<b>\u0418\u0442\u043e\u0433\u043e\u0432\u0430\u044f \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c:</b> {safe_text(payload.total_cost_rub or payload.voximplant_total_rub or payload.telephony_cost_rub or 0)} \u0440\u0443\u0431",
    ]

    if payload.recording_url:
        lines.append(f"<b>\u0417\u0430\u043f\u0438\u0441\u044c:</b> {payload.recording_url}")

    lines.extend(
        [
            "",
            "<b>\u0422\u043e\u043a\u0435\u043d\u044b:</b>",
            usage_text,
            "",
            "<b>\u0414\u0438\u0430\u043b\u043e\u0433:</b>",
            display_or_default(payload.dialogue_text or DEFAULT_NO_DIALOGUE, DEFAULT_NO_DIALOGUE),
        ]
    )
    return "\n".join(lines)

def render_summary_report(payload: FinalizePayload) -> str:
    lines = [
        "<b>\u041d\u043e\u0432\u044b\u0439 \u0437\u0432\u043e\u043d\u043e\u043a (\u0441\u0443\u043c\u043c\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044f)</b>",
        f"<b>\u041d\u043e\u043c\u0435\u0440:</b> {display_or_default(payload.client_phone or payload.caller_phone or DEFAULT_UNKNOWN, DEFAULT_UNKNOWN)}",
        f"<b>\u0418\u043c\u044f:</b> {display_or_default(payload.client_name, DEFAULT_NOT_SPECIFIED)}",
        f"<b>\u0417\u0430\u043f\u0440\u043e\u0441:</b> {display_or_default(payload.call_goal, DEFAULT_NOT_SPECIFIED)}",
        f"<b>\u0427\u0442\u043e \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u043b\u0438:</b> {display_or_default(payload.manager_offer, DEFAULT_NOT_SPECIFIED)}",
        f"<b>\u0418\u0442\u043e\u0433:</b> {display_or_default(payload.outcome, DEFAULT_NOT_SPECIFIED)}",
        f"<b>\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433:</b> {display_or_default(payload.next_step, DEFAULT_NOT_SPECIFIED)}",
    ]
    if payload.recording_url:
        lines.append(f"<b>\u0417\u0430\u043f\u0438\u0441\u044c:</b> {payload.recording_url}")
    lines.extend(["", f"<b>\u041a\u0440\u0430\u0442\u043a\u043e:</b> {display_or_default(payload.summary, DEFAULT_NOT_SPECIFIED)}"])
    return "\n".join(lines)

async def send_telegram_text(chat_ids: list[str], html_text: str) -> tuple[str, Optional[str]]:
    if not chat_ids:
        return "no_recipients", None
    if not html_text:
        return "empty_message", None
    if bot is None:
        return "skipped_no_bot", None

    errors: list[str] = []
    for chat_id in chat_ids:
        sent = False
        last_error_text = ""
        for attempt in range(1, DELIVERY_RETRY_ATTEMPTS + 1):
            try:
                await bot.send_message(chat_id=chat_id, text=html_text, disable_web_page_preview=True)
                sent = True
                break
            except Exception as exc:  # noqa: BLE001
                last_error_text = str(exc)
                logger.warning(
                    "Telegram send failed for chat=%s attempt=%s/%s: %s",
                    chat_id,
                    attempt,
                    DELIVERY_RETRY_ATTEMPTS,
                    last_error_text,
                )
                if attempt < DELIVERY_RETRY_ATTEMPTS:
                    await wait_before_retry(DELIVERY_RETRY_DELAY_MS, attempt)
        if not sent:
            errors.append(f"{chat_id}: {last_error_text or 'unknown_error'}")

    if errors and len(errors) == len(chat_ids):
        return "error", "; ".join(errors)
    if errors:
        return "partial", "; ".join(errors)
    return "sent", None


async def send_to_google_sheets(payload: dict[str, Any]) -> tuple[str, Optional[str]]:
    if not GOOGLE_APPS_SCRIPT_WEBHOOK_URL:
        return "skipped_no_url", None

    last_error = ""
    for attempt in range(1, DELIVERY_RETRY_ATTEMPTS + 1):
        try:
            timeout = aiohttp.ClientTimeout(total=25)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(GOOGLE_APPS_SCRIPT_WEBHOOK_URL, json=payload) as response:
                    response_text = await response.text()
                    if response.status >= 400:
                        last_error = f"HTTP {response.status}: {response_text[:1000]}"
                        logger.warning(
                            "Google Sheets sync failed attempt=%s/%s: %s",
                            attempt,
                            DELIVERY_RETRY_ATTEMPTS,
                            last_error,
                        )
                    else:
                        return "sent", response_text[:4000]
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "Google Sheets sync network error attempt=%s/%s: %s",
                attempt,
                DELIVERY_RETRY_ATTEMPTS,
                last_error,
            )

        if attempt < DELIVERY_RETRY_ATTEMPTS:
            await wait_before_retry(DELIVERY_RETRY_DELAY_MS, attempt)

    return "error", last_error or "sync_failed"


def guess_recording_extension(url: str) -> str:
    parsed_path = urlparse(url).path.lower()
    for extension in (".mp3", ".wav", ".ogg", ".m4a"):
        if parsed_path.endswith(extension):
            return extension
    return ".mp3"


async def download_recording(url: str, session_id: str) -> tuple[str, Optional[str], Optional[str]]:
    extension = guess_recording_extension(url)
    file_path = RECORDINGS_DIR / f"{session_id}{extension}"
    auth_headers: dict[str, str] = {}

    if voximplant_api_client and "voximplant-records-secure" in safe_text(url):
        try:
            auth_headers["Authorization"] = voximplant_api_client.build_auth_header()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to build authorization header for recording download session=%s: %s",
                session_id,
                str(exc),
            )

    last_error = ""
    for attempt in range(1, DOWNLOAD_RETRY_ATTEMPTS + 1):
        try:
            timeout = aiohttp.ClientTimeout(total=60)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, headers=auth_headers) as response:
                    if response.status >= 400:
                        last_error = f"HTTP {response.status}"
                    else:
                        data = await response.read()
                        if not data:
                            last_error = "empty_recording_file"
                        else:
                            file_path.write_bytes(data)
                            return "downloaded", str(file_path), None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "Recording download failed session=%s attempt=%s/%s: %s",
                session_id,
                attempt,
                DOWNLOAD_RETRY_ATTEMPTS,
                last_error,
            )

        if attempt < DOWNLOAD_RETRY_ATTEMPTS:
            await wait_before_retry(DOWNLOAD_RETRY_DELAY_MS, attempt)

    return "download_error", None, last_error or "download_failed"


async def persist_recording_download(session_id: str, url: str):
    status, local_path, error_text = await download_recording(url, session_id)
    db = SessionLocal()
    try:
        db_call = db.query(Call).filter(Call.voximplant_session_id == session_id).first()
        if not db_call:
            return
        if local_path:
            db_call.local_recording_path = local_path
        if error_text:
            db_call.last_error = error_text
        if db_call.recording_status in (None, "", "not_started", "requested_not_confirmed"):
            db_call.recording_status = status
        db_call.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


async def cleanup_old_recordings():
    logger.info("Starting scheduled cleanup of old recordings")
    cutoff = time.time() - (RECORDINGS_TTL_DAYS * 86400)
    removed_files = 0
    db = SessionLocal()

    try:
        for file_path in RECORDINGS_DIR.iterdir():
            if not file_path.is_file():
                continue
            if file_path.stat().st_mtime >= cutoff:
                continue

            file_path.unlink(missing_ok=True)
            removed_files += 1

            session_id = file_path.stem
            db_call = db.query(Call).filter(Call.voximplant_session_id == session_id).first()
            if db_call:
                db_call.local_recording_path = None
                db_call.updated_at = datetime.utcnow()

        db.commit()
        logger.info("Cleanup finished, removed %s recordings", removed_files)
    except Exception:  # noqa: BLE001
        logger.exception("Cleanup failed")
    finally:
        db.close()


def fill_call_from_finalize(db_call: Call, payload: FinalizePayload):
    now = datetime.utcnow()

    set_if_value(db_call, "project", payload.project)
    set_if_value(db_call, "script_name", payload.script_name)
    set_if_value(db_call, "model", payload.model)
    set_if_value(db_call, "caller_phone", payload.caller_phone)
    set_if_value(db_call, "client_phone", payload.client_phone)
    set_if_value(db_call, "client_name", payload.client_name)

    exported_at = parse_iso_datetime(payload.exported_at_utc)
    if exported_at:
        db_call.exported_at = exported_at

    if not db_call.connected_at:
        db_call.connected_at = exported_at or now

    db_call.finished_at = now
    db_call.updated_at = now
    db_call.status = payload.finalization_reason or "finalized"

    db_call.duration = safe_int(payload.call_duration_sec)
    db_call.telephony_cost_rub = safe_float(payload.telephony_cost_rub)
    db_call.websocket_duration_sec = safe_float(payload.websocket_duration_sec)
    db_call.websocket_cost_rub = safe_float(payload.websocket_cost_rub)
    db_call.voximplant_total_rub = safe_float(payload.voximplant_total_rub)
    db_call.ai_cost_usd = safe_float(payload.ai_cost_usd)
    db_call.ai_cost_rub = safe_float(payload.ai_cost_rub)
    db_call.total_cost_rub = safe_float(payload.total_cost_rub)

    set_if_value(db_call, "summary", payload.summary)
    set_if_value(db_call, "call_goal", payload.call_goal)
    set_if_value(db_call, "manager_offer", payload.manager_offer)
    set_if_value(db_call, "outcome", payload.outcome)
    set_if_value(db_call, "next_step", payload.next_step)
    set_if_value(db_call, "dialogue_text", payload.dialogue_text)

    set_if_value(db_call, "recording_status", payload.recording_status)
    set_if_value(db_call, "recording_url", payload.recording_url)
    set_if_value(db_call, "recording_error", payload.recording_error)

    db_call.usage_json = to_json_text(payload.usage)
    db_call.summary_fields_json = to_json_text(payload.summary_fields)
    db_call.dialogue_items_json = to_json_text(payload.dialogue_items)
    db_call.admin_report_html = payload.admin_report_html or render_admin_report(payload)
    db_call.summary_report_html = payload.summary_report_html or render_summary_report(payload)
    db_call.raw_payload_json = to_json_text(payload.model_dump(mode="json"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Artem Fitisov backend starting")
    scheduler.add_job(cleanup_old_recordings, "interval", hours=CLEANUP_INTERVAL_HOURS)
    scheduler.start()
    yield
    logger.info("Artem Fitisov backend stopping")
    scheduler.shutdown()
    if bot is not None:
        await bot.session.close()


app = FastAPI(title="Artem Fitisov Backend", lifespan=lifespan)


@app.get("/")
def read_root():
    return {"service": "artem_fitisov_backend", "status": "ok", "time_utc": datetime.utcnow().isoformat()}


@app.get("/healthz")
def healthcheck():
    return {"ok": True, "time_utc": datetime.utcnow().isoformat()}


@app.get("/calls")
def list_calls(
    secret: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    if not BACKEND_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="admin api disabled")
    if secret != BACKEND_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="invalid secret")

    calls = db.query(Call).order_by(Call.started_at.desc()).limit(limit).all()
    return [call.as_dict() for call in calls]


@app.get("/calls/{session_id}")
def get_call(
    session_id: str = ApiPath(..., min_length=3),
    secret: str = Query(default=""),
    db: Session = Depends(get_db),
):
    if not BACKEND_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="admin api disabled")
    if secret != BACKEND_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="invalid secret")

    db_call = db.query(Call).filter(Call.voximplant_session_id == session_id).first()
    if not db_call:
        raise HTTPException(status_code=404, detail="call not found")
    return db_call.as_dict()


@app.post("/webhook/voximplant/call_started")
async def call_started(
    payload: CallStartedPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    require_webhook_secret(request)

    db_call = get_or_create_call(db, payload.session_id)
    set_if_value(db_call, "project", payload.project)
    set_if_value(db_call, "script_name", payload.script_name)
    set_if_value(db_call, "caller_phone", payload.caller_phone)

    connected_at = parse_iso_datetime(payload.connected_at_utc)
    if connected_at:
        db_call.connected_at = connected_at
    if not db_call.started_at:
        db_call.started_at = datetime.utcnow()
    db_call.updated_at = datetime.utcnow()
    db_call.status = db_call.status or "started"
    db.commit()

    return {"status": "success", "session_id": payload.session_id}


@app.post("/webhook/voximplant/call_finished")
async def call_finished(
    payload: CallFinishedPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    require_webhook_secret(request)

    db_call = get_or_create_call(db, payload.session_id)
    if payload.duration is not None:
        db_call.duration = safe_int(payload.duration)
    set_if_value(db_call, "summary", payload.summary)
    db_call.finished_at = parse_iso_datetime(payload.finished_at_utc) or datetime.utcnow()
    db_call.updated_at = datetime.utcnow()
    db_call.status = payload.status or "finished"
    db.commit()

    return {"status": "success", "session_id": payload.session_id}


@app.post("/webhook/voximplant/recording_ready")
async def recording_ready(
    payload: RecordingReadyPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    require_webhook_secret(request)

    db_call = get_or_create_call(db, payload.session_id)
    set_if_value(db_call, "project", payload.project)
    set_if_value(db_call, "script_name", payload.script_name)
    db_call.recording_url = payload.recording_url
    db_call.recording_status = payload.recording_status or "ready"
    set_if_value(db_call, "recording_error", payload.recording_error)
    db_call.updated_at = datetime.utcnow()
    db.commit()

    asyncio.create_task(persist_recording_download(payload.session_id, payload.recording_url))
    return {"status": "success", "session_id": payload.session_id}


@app.post("/webhook/voximplant/report")
async def legacy_report(
    payload: CallReportPayload,
    request: Request,
):
    require_webhook_secret(request)

    if payload.report_type == "ADMIN_REPORT":
        status, error_text = await send_telegram_text(get_admin_chat_ids(), payload.text)
    elif payload.report_type == "SUMMARY_REPORT":
        status, error_text = await send_telegram_text(get_summary_chat_ids(), payload.text)
    else:
        raise HTTPException(status_code=400, detail="unknown report_type")

    return {"status": status, "error": error_text}


@app.post("/webhook/voximplant/google_sheets")
async def legacy_google_sheets(
    request: Request,
):
    require_webhook_secret(request)
    payload = await request.json()
    status, response_text = await send_to_google_sheets(payload)
    return {"status": status, "response": response_text}


@app.post("/webhook/voximplant/finalize")
async def finalize_call(
    payload: FinalizePayload,
    request: Request,
    db: Session = Depends(get_db),
):
    require_webhook_secret(request)

    db_call = get_or_create_call(db, payload.session_id)
    fill_call_from_finalize(db_call, payload)
    db.commit()

    if payload.recording_url:
        asyncio.create_task(persist_recording_download(payload.session_id, payload.recording_url))

    if is_diagnostic_finalize(payload):
        admin_status, admin_error = "skipped_diagnostic", None
        summary_status, summary_error = "skipped_diagnostic", None
    else:
        admin_status, admin_error = await send_telegram_text(
            get_admin_chat_ids(),
            db_call.admin_report_html or render_admin_report(payload),
        )
        summary_status, summary_error = await send_telegram_text(
            get_summary_chat_ids(),
            db_call.summary_report_html or render_summary_report(payload),
        )

    sheets_payload = payload.model_dump(mode="json")
    sheets_status, sheets_response = await send_to_google_sheets(sheets_payload)

    db_call.telegram_admin_status = admin_status
    db_call.telegram_summary_status = summary_status
    db_call.google_sheets_status = sheets_status
    db_call.google_sheets_response = sheets_response

    error_parts = [part for part in [admin_error, summary_error] if part]
    if sheets_status == "error" and sheets_response:
        error_parts.append(sheets_response)
    db_call.last_error = " | ".join(error_parts) if error_parts else None
    db_call.updated_at = datetime.utcnow()
    db.commit()

    return {
        "status": "success",
        "session_id": payload.session_id,
        "telegram_admin_status": admin_status,
        "telegram_summary_status": summary_status,
        "google_sheets_status": sheets_status,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
