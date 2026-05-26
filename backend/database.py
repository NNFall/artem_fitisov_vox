import os
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{os.path.join(BASE_DIR, 'voximplant.db')}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Call(Base):
    __tablename__ = "calls"

    id = Column(Integer, primary_key=True, index=True)
    voximplant_session_id = Column(String, unique=True, index=True, nullable=False)
    outbound_task_id = Column(Integer, index=True, nullable=True)
    campaign_id = Column(Integer, index=True, nullable=True)
    project = Column(String, default="artem_fitisov", nullable=True)
    script_name = Column(String, nullable=True)
    model = Column(String, nullable=True)

    caller_phone = Column(String, index=True, nullable=True)
    client_phone = Column(String, index=True, nullable=True)
    client_name = Column(String, index=True, nullable=True)

    started_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    connected_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    exported_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    duration = Column(Integer, nullable=True)
    telephony_cost_rub = Column(Float, nullable=True)
    websocket_duration_sec = Column(Float, nullable=True)
    websocket_cost_rub = Column(Float, nullable=True)
    voximplant_total_rub = Column(Float, nullable=True)
    ai_cost_usd = Column(Float, nullable=True)
    ai_cost_rub = Column(Float, nullable=True)
    total_cost_rub = Column(Float, nullable=True)

    summary = Column(Text, nullable=True)
    call_goal = Column(Text, nullable=True)
    manager_offer = Column(Text, nullable=True)
    outcome = Column(Text, nullable=True)
    next_step = Column(Text, nullable=True)
    dialogue_text = Column(Text, nullable=True)

    recording_status = Column(String, nullable=True)
    recording_url = Column(String, nullable=True)
    local_recording_path = Column(String, nullable=True)
    recording_error = Column(Text, nullable=True)

    transcription_status = Column(String, nullable=True)
    transcription_provider = Column(String, nullable=True)
    transcription_model = Column(String, nullable=True)
    transcription_id = Column(String, nullable=True)
    transcription_text = Column(Text, nullable=True)
    transcription_raw_json = Column(Text, nullable=True)
    transcription_error = Column(Text, nullable=True)
    transcription_started_at = Column(DateTime, nullable=True)
    transcription_finished_at = Column(DateTime, nullable=True)

    analysis_status = Column(String, nullable=True)
    analysis_provider = Column(String, nullable=True)
    analysis_model = Column(String, nullable=True)
    analysis_raw_json = Column(Text, nullable=True)
    analysis_error = Column(Text, nullable=True)
    analysis_started_at = Column(DateTime, nullable=True)
    analysis_finished_at = Column(DateTime, nullable=True)

    usage_json = Column(Text, nullable=True)
    summary_fields_json = Column(Text, nullable=True)
    dialogue_items_json = Column(Text, nullable=True)
    admin_report_html = Column(Text, nullable=True)
    summary_report_html = Column(Text, nullable=True)
    raw_payload_json = Column(Text, nullable=True)

    telegram_admin_status = Column(String, nullable=True)
    telegram_summary_status = Column(String, nullable=True)
    google_sheets_status = Column(String, nullable=True)
    google_sheets_response = Column(Text, nullable=True)
    last_error = Column(Text, nullable=True)

    status = Column(String, default="started", nullable=True)

    def as_dict(self):
        return {
            "id": self.id,
            "session_id": self.voximplant_session_id,
            "outbound_task_id": self.outbound_task_id,
            "campaign_id": self.campaign_id,
            "project": self.project,
            "script_name": self.script_name,
            "model": self.model,
            "caller_phone": self.caller_phone,
            "client_phone": self.client_phone,
            "client_name": self.client_name,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "connected_at": self.connected_at.isoformat() if self.connected_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "exported_at": self.exported_at.isoformat() if self.exported_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "duration": self.duration,
            "telephony_cost_rub": self.telephony_cost_rub,
            "websocket_duration_sec": self.websocket_duration_sec,
            "websocket_cost_rub": self.websocket_cost_rub,
            "voximplant_total_rub": self.voximplant_total_rub,
            "ai_cost_usd": self.ai_cost_usd,
            "ai_cost_rub": self.ai_cost_rub,
            "total_cost_rub": self.total_cost_rub,
            "summary": self.summary,
            "call_goal": self.call_goal,
            "manager_offer": self.manager_offer,
            "outcome": self.outcome,
            "next_step": self.next_step,
            "dialogue_text": self.dialogue_text,
            "recording_status": self.recording_status,
            "recording_url": self.recording_url,
            "local_recording_path": self.local_recording_path,
            "recording_error": self.recording_error,
            "transcription_status": self.transcription_status,
            "transcription_provider": self.transcription_provider,
            "transcription_model": self.transcription_model,
            "transcription_id": self.transcription_id,
            "transcription_text": self.transcription_text,
            "transcription_error": self.transcription_error,
            "transcription_started_at": self.transcription_started_at.isoformat() if self.transcription_started_at else None,
            "transcription_finished_at": self.transcription_finished_at.isoformat() if self.transcription_finished_at else None,
            "analysis_status": self.analysis_status,
            "analysis_provider": self.analysis_provider,
            "analysis_model": self.analysis_model,
            "analysis_error": self.analysis_error,
            "analysis_started_at": self.analysis_started_at.isoformat() if self.analysis_started_at else None,
            "analysis_finished_at": self.analysis_finished_at.isoformat() if self.analysis_finished_at else None,
            "telegram_admin_status": self.telegram_admin_status,
            "telegram_summary_status": self.telegram_summary_status,
            "google_sheets_status": self.google_sheets_status,
            "google_sheets_response": self.google_sheets_response,
            "last_error": self.last_error,
            "status": self.status,
        }


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    status = Column(String, default="paused", index=True, nullable=True)
    source_filename = Column(String, nullable=True)
    prompt_context = Column(Text, nullable=True)
    default_max_attempts = Column(Integer, default=1, nullable=True)
    call_delay_seconds = Column(Integer, default=60, nullable=True)
    next_call_after = Column(DateTime, nullable=True)
    created_by_chat_id = Column(String, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    started_at = Column(DateTime, nullable=True)
    paused_at = Column(DateTime, nullable=True)

    def as_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "source_filename": self.source_filename,
            "prompt_context": self.prompt_context,
            "default_max_attempts": self.default_max_attempts,
            "call_delay_seconds": self.call_delay_seconds,
            "next_call_after": self.next_call_after.isoformat() if self.next_call_after else None,
            "created_by_chat_id": self.created_by_chat_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
        }


class OutboundContact(Base):
    __tablename__ = "outbound_contacts"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, index=True, nullable=False)
    phone = Column(String, index=True, nullable=False)
    name = Column(String, index=True, nullable=True)
    company = Column(String, index=True, nullable=True)
    city = Column(String, nullable=True)
    source = Column(String, nullable=True)
    task = Column(Text, nullable=True)
    context = Column(Text, nullable=True)
    preferred_time = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    raw_row_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    def as_dict(self):
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "phone": self.phone,
            "name": self.name,
            "company": self.company,
            "city": self.city,
            "source": self.source,
            "task": self.task,
            "context": self.context,
            "preferred_time": self.preferred_time,
            "timezone": self.timezone,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class OutboundTask(Base):
    __tablename__ = "outbound_tasks"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, index=True, nullable=False)
    contact_id = Column(Integer, index=True, nullable=False)
    phone = Column(String, index=True, nullable=False)
    status = Column(String, default="pending", index=True, nullable=True)
    priority = Column(Integer, default=100, nullable=True)
    scheduled_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    last_attempt_at = Column(DateTime, nullable=True)
    next_attempt_at = Column(DateTime, nullable=True)
    attempt_count = Column(Integer, default=0, nullable=True)
    max_attempts = Column(Integer, default=1, nullable=True)
    voximplant_session_id = Column(String, index=True, nullable=True)
    telegram_chat_id = Column(String, nullable=True)
    telegram_message_id = Column(Integer, nullable=True)
    telegram_message_refs_json = Column(Text, nullable=True)
    start_result_json = Column(Text, nullable=True)
    last_status = Column(String, nullable=True)
    last_status_message = Column(Text, nullable=True)
    last_status_at = Column(DateTime, nullable=True)
    last_status_payload_json = Column(Text, nullable=True)
    result_status = Column(String, nullable=True)
    result_summary = Column(Text, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    def as_dict(self):
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "contact_id": self.contact_id,
            "phone": self.phone,
            "status": self.status,
            "priority": self.priority,
            "scheduled_at": self.scheduled_at.isoformat() if self.scheduled_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "last_attempt_at": self.last_attempt_at.isoformat() if self.last_attempt_at else None,
            "next_attempt_at": self.next_attempt_at.isoformat() if self.next_attempt_at else None,
            "attempt_count": self.attempt_count,
            "max_attempts": self.max_attempts,
            "voximplant_session_id": self.voximplant_session_id,
            "telegram_chat_id": self.telegram_chat_id,
            "telegram_message_id": self.telegram_message_id,
            "telegram_message_refs_json": self.telegram_message_refs_json,
            "last_status": self.last_status,
            "last_status_message": self.last_status_message,
            "last_status_at": self.last_status_at.isoformat() if self.last_status_at else None,
            "result_status": self.result_status,
            "result_summary": self.result_summary,
            "last_error": self.last_error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class OutboundEvent(Base):
    __tablename__ = "outbound_events"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, index=True, nullable=True)
    task_id = Column(Integer, index=True, nullable=True)
    session_id = Column(String, index=True, nullable=True)
    phone = Column(String, index=True, nullable=True)
    stage = Column(String, index=True, nullable=False)
    status = Column(String, index=True, nullable=True)
    message = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=True)

    def as_dict(self):
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "task_id": self.task_id,
            "session_id": self.session_id,
            "phone": self.phone,
            "stage": self.stage,
            "status": self.status,
            "message": self.message,
            "payload_json": self.payload_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


SQLITE_CALLS_COLUMNS = {
    "outbound_task_id": "INTEGER",
    "campaign_id": "INTEGER",
    "project": "TEXT",
    "script_name": "TEXT",
    "model": "TEXT",
    "client_phone": "TEXT",
    "client_name": "TEXT",
    "connected_at": "DATETIME",
    "exported_at": "DATETIME",
    "updated_at": "DATETIME",
    "telephony_cost_rub": "REAL",
    "websocket_duration_sec": "REAL",
    "websocket_cost_rub": "REAL",
    "voximplant_total_rub": "REAL",
    "ai_cost_usd": "REAL",
    "ai_cost_rub": "REAL",
    "total_cost_rub": "REAL",
    "call_goal": "TEXT",
    "manager_offer": "TEXT",
    "outcome": "TEXT",
    "next_step": "TEXT",
    "dialogue_text": "TEXT",
    "recording_status": "TEXT",
    "recording_error": "TEXT",
    "transcription_status": "TEXT",
    "transcription_provider": "TEXT",
    "transcription_model": "TEXT",
    "transcription_id": "TEXT",
    "transcription_text": "TEXT",
    "transcription_raw_json": "TEXT",
    "transcription_error": "TEXT",
    "transcription_started_at": "DATETIME",
    "transcription_finished_at": "DATETIME",
    "analysis_status": "TEXT",
    "analysis_provider": "TEXT",
    "analysis_model": "TEXT",
    "analysis_raw_json": "TEXT",
    "analysis_error": "TEXT",
    "analysis_started_at": "DATETIME",
    "analysis_finished_at": "DATETIME",
    "usage_json": "TEXT",
    "summary_fields_json": "TEXT",
    "dialogue_items_json": "TEXT",
    "admin_report_html": "TEXT",
    "summary_report_html": "TEXT",
    "raw_payload_json": "TEXT",
    "telegram_admin_status": "TEXT",
    "telegram_summary_status": "TEXT",
    "google_sheets_status": "TEXT",
    "google_sheets_response": "TEXT",
    "last_error": "TEXT",
}

SQLITE_EXTRA_COLUMNS = {
    "campaigns": {
        "call_delay_seconds": "INTEGER",
        "next_call_after": "DATETIME",
    },
    "outbound_tasks": {
        "telegram_chat_id": "TEXT",
        "telegram_message_id": "INTEGER",
        "telegram_message_refs_json": "TEXT",
        "last_status": "TEXT",
        "last_status_message": "TEXT",
        "last_status_at": "DATETIME",
        "last_status_payload_json": "TEXT",
    },
}


def ensure_sqlite_columns():
    if engine.url.get_backend_name() != "sqlite":
        return

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        if "calls" in tables:
            existing_columns = {column["name"] for column in inspector.get_columns("calls")}
            for column_name, column_type in SQLITE_CALLS_COLUMNS.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE calls ADD COLUMN {column_name} {column_type}"))

        for table_name, columns in SQLITE_EXTRA_COLUMNS.items():
            if table_name not in tables:
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()
