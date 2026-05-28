import importlib
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


class WebApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        db_path = Path(cls.tmpdir.name) / "web_api_test.db"
        os.environ.update(
            {
                "DATABASE_URL": f"sqlite:///{db_path}",
                "BACKEND_WEBHOOK_SECRET": "test-webhook-secret",
                "TELEGRAM_BOT_TOKEN": "",
                "OUTBOUND_WORKER_ENABLED": "false",
                "WEB_ADMIN_USERNAME": "admin",
                "WEB_ADMIN_PASSWORD": "secret",
                "WEB_SESSION_SECRET": "test-session-secret",
            }
        )
        backend_path = Path(__file__).resolve().parents[1] / "backend"
        sys.path.insert(0, str(backend_path))
        cls.database = importlib.import_module("database")
        cls.main = importlib.import_module("main")
        cls.client = TestClient(cls.main.app)

    @classmethod
    def tearDownClass(cls):
        cls.database.engine.dispose()
        cls.tmpdir.cleanup()

    def setUp(self):
        self.client.cookies.clear()
        self.database.Base.metadata.drop_all(bind=self.database.engine)
        self.database.Base.metadata.create_all(bind=self.database.engine)
        self.database.ensure_sqlite_columns()

    def login(self):
        response = self.client.post(
            "/web/auth/login",
            json={"username": "admin", "password": "secret"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.cookies.get("artem_web_session"))
        return response

    def test_dashboard_requires_login(self):
        response = self.client.get("/web/dashboard")

        self.assertEqual(response.status_code, 401)

    def test_login_opens_dashboard_with_real_counts(self):
        self.login()

        response = self.client.get("/web/dashboard")

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["campaigns"]["total"], 0)
        self.assertEqual(payload["calls"]["total"], 0)
        self.assertEqual(payload["worker"]["enabled"], False)

    def test_telegram_send_only_mode_does_not_start_polling(self):
        with (
            patch.object(self.main, "TELEGRAM_POLLING_ENABLED", False),
            patch.object(self.main, "bot", object()),
            patch.object(self.main, "dispatcher", object()),
        ):
            self.assertFalse(self.main.should_start_telegram_polling())

    def test_telegram_polling_mode_starts_when_bot_and_dispatcher_exist(self):
        with (
            patch.object(self.main, "TELEGRAM_POLLING_ENABLED", True),
            patch.object(self.main, "bot", object()),
            patch.object(self.main, "dispatcher", object()),
        ):
            self.assertTrue(self.main.should_start_telegram_polling())

    def test_upload_csv_creates_paused_campaign(self):
        self.login()
        response = self.client.post(
            "/web/imports",
            files={
                "file": (
                    "leads.csv",
                    "Имя;Контактныйтелефон;Компания;Пришёл\nАртем;79650348852;WoodLab;Да\n".encode("utf-8"),
                    "text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["campaign"]["status"], "paused")
        self.assertEqual(payload["stats"]["total"], 1)
        self.assertEqual(payload["preview"][0]["name"], "Артем")
        self.assertEqual(payload["preview"][0]["phone"], "79650348852")

    def test_campaign_detail_includes_contacts_tasks_and_calls(self):
        self.login()
        db = self.database.SessionLocal()
        try:
            campaign = self.database.Campaign(name="forum_amix", status="paused")
            db.add(campaign)
            db.flush()
            contact = self.database.OutboundContact(
                campaign_id=campaign.id,
                phone="79958407752",
                name="Никита",
                company="Nord Wood",
            )
            db.add(contact)
            db.flush()
            task = self.database.OutboundTask(
                campaign_id=campaign.id,
                contact_id=contact.id,
                phone=contact.phone,
                status="pending",
            )
            db.add(task)
            db.add(
                self.database.Call(
                    voximplant_session_id="session-1",
                    campaign_id=campaign.id,
                    outbound_task_id=task.id,
                    client_phone=contact.phone,
                    client_name=contact.name,
                    status="finalized",
                    summary="Клиенту интересно внедрение AI.",
                )
            )
            db.commit()
            campaign_id = campaign.id
            contact_id = contact.id
        finally:
            db.close()

        detail = self.client.get(f"/web/campaigns/{campaign_id}")
        self.assertEqual(detail.status_code, 200, detail.text)
        payload = detail.json()
        self.assertEqual(payload["campaign"]["name"], "forum_amix")
        self.assertEqual(payload["contacts"][0]["name"], "Никита")
        self.assertEqual(payload["contacts"][0]["task"]["status"], "pending")
        self.assertEqual(payload["calls"][0]["summary"], "Клиенту интересно внедрение AI.")

        update = self.client.patch(
            f"/web/contacts/{contact_id}",
            json={"name": "Никита Ф.", "company": "Nord Wood Studio"},
        )
        self.assertEqual(update.status_code, 200, update.text)
        self.assertEqual(update.json()["name"], "Никита Ф.")
        self.assertEqual(update.json()["company"], "Nord Wood Studio")

    def test_web_calls_are_sorted_by_call_time_not_processing_update_time(self):
        self.login()
        db = self.database.SessionLocal()
        now = datetime(2026, 5, 27, 12, 0, 0)
        try:
            campaign = self.database.Campaign(name="forum_amix", status="paused")
            db.add(campaign)
            db.flush()
            old_call = self.database.Call(
                voximplant_session_id="old-call",
                campaign_id=campaign.id,
                client_phone="79950000001",
                client_name="Старый звонок",
                status="finalized",
                started_at=now - timedelta(days=1, minutes=1),
                finished_at=now - timedelta(days=1),
                updated_at=now + timedelta(hours=2),
            )
            new_call = self.database.Call(
                voximplant_session_id="new-call",
                campaign_id=campaign.id,
                client_phone="79950000002",
                client_name="Новый звонок",
                status="finalized",
                started_at=now - timedelta(minutes=1),
                finished_at=now,
                updated_at=now - timedelta(hours=2),
            )
            db.add_all([old_call, new_call])
            db.commit()
            campaign_id = campaign.id
        finally:
            db.close()

        calls_response = self.client.get("/web/calls?limit=10")
        self.assertEqual(calls_response.status_code, 200, calls_response.text)
        self.assertEqual([item["session_id"] for item in calls_response.json()[:2]], ["new-call", "old-call"])

        dashboard_response = self.client.get("/web/dashboard")
        self.assertEqual(dashboard_response.status_code, 200, dashboard_response.text)
        self.assertEqual(
            [item["session_id"] for item in dashboard_response.json()["calls"]["recent"][:2]],
            ["new-call", "old-call"],
        )

        campaign_response = self.client.get(f"/web/campaigns/{campaign_id}")
        self.assertEqual(campaign_response.status_code, 200, campaign_response.text)
        self.assertEqual(
            [item["session_id"] for item in campaign_response.json()["calls"][:2]],
            ["new-call", "old-call"],
        )

    def test_inbound_finalize_sends_concise_summary_and_schedules_recording_reply(self):
        with (
            patch.object(self.main, "bot", object()),
            patch.object(self.main, "get_summary_chat_ids", return_value=["admin-a", "admin-b"]),
            patch.object(self.main, "send_telegram_status_message", new_callable=AsyncMock) as send_summary,
            patch.object(self.main, "send_telegram_text", new_callable=AsyncMock) as send_legacy_text,
            patch.object(self.main, "send_to_google_sheets", new_callable=AsyncMock) as send_sheets,
            patch.object(self.main, "persist_and_send_inbound_recording", new_callable=AsyncMock, create=True) as send_audio,
        ):
            send_summary.return_value = [("admin-a", 101), ("admin-b", 102)]
            send_legacy_text.return_value = ("sent", None)
            send_sheets.return_value = ("skipped_no_url", None)

            response = self.client.post(
                "/webhook/voximplant/finalize",
                headers={"X-Webhook-Secret": "test-webhook-secret"},
                json={
                    "session_id": "inbound-session-1",
                    "script_name": "inbound_gemini_web_edition.js",
                    "finalization_reason": "call_disconnected",
                    "caller_phone": "79958407752",
                    "client_phone": "79958407752",
                    "client_name": "Никита",
                    "call_duration_sec": 74,
                    "telephony_cost_rub": 3.2,
                    "voximplant_total_rub": 3.7,
                    "ai_cost_rub": 4.1,
                    "total_cost_rub": 7.8,
                    "summary": "Клиент перезвонил после пропущенного исходящего звонка.",
                    "outcome": "Нужен повторный контакт менеджера.",
                    "next_step": "Передать менеджеру.",
                    "dialogue_text": "Полный диалог не должен попадать в краткое Telegram-сообщение.",
                    "recording_url": "https://voximplant.example/record.mp3",
                    "recording_status": "ready",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["telegram_summary_status"], "sent")
        self.assertEqual(payload["telegram_admin_status"], "skipped_inbound_concise")
        self.assertEqual(payload["recording_send_status"], "scheduled")
        send_legacy_text.assert_not_awaited()
        send_summary.assert_awaited_once()
        chat_ids, html_text = send_summary.await_args.args
        self.assertEqual(chat_ids, ["admin-a", "admin-b"])
        self.assertIn("Входящий вызов завершен", html_text)
        self.assertIn("Номер", html_text)
        self.assertIn("79958407752", html_text)
        self.assertIn("Длительность", html_text)
        self.assertIn("Итоговая стоимость", html_text)
        self.assertIn("Кратко", html_text)
        self.assertNotIn("Диалог", html_text)
        send_audio.assert_called_once_with(
            "inbound-session-1",
            "https://voximplant.example/record.mp3",
            [{"chat_id": "admin-a", "message_id": 101}, {"chat_id": "admin-b", "message_id": 102}],
        )

        db = self.database.SessionLocal()
        try:
            db_call = db.query(self.database.Call).filter(
                self.database.Call.voximplant_session_id == "inbound-session-1"
            ).first()
            self.assertIsNotNone(db_call)
            self.assertEqual(db_call.telegram_summary_status, "sent")
            self.assertEqual(db_call.telegram_admin_status, "skipped_inbound_concise")
        finally:
            db.close()

    def test_format_assembly_transcript_prefers_utterances(self):
        transcript = self.main.format_assembly_transcript(
            {
                "text": "flat transcript",
                "utterances": [
                    {"speaker": "A", "text": "Hello, can I ask a few questions?"},
                    {"speaker": "B", "text": "Yes, go ahead."},
                ],
            }
        )

        self.assertEqual(
            transcript,
            "Speaker A: Hello, can I ask a few questions?\nSpeaker B: Yes, go ahead.",
        )

    def test_format_assembly_transcript_maps_multichannel_roles(self):
        transcript = self.main.format_assembly_transcript(
            {
                "multichannel": True,
                "utterances": [
                    {"speaker": "2", "channel": 2, "text": "Good afternoon, may I ask a few questions?"},
                    {"speaker": "1", "channel": 1, "text": "Yes, go ahead."},
                    {"speaker": "2", "channel": 2, "text": "Thank you."},
                ],
            }
        )

        self.assertEqual(
            transcript,
            "AI: Good afternoon, may I ask a few questions?\nClient: Yes, go ahead.\nAI: Thank you.",
        )

    def test_build_assemblyai_payload_prefers_multichannel_over_speaker_labels(self):
        with (
            patch.object(self.main, "ASSEMBLYAI_LANGUAGE_DETECTION", True),
            patch.object(self.main, "ASSEMBLYAI_SPEECH_MODELS", ["universal-3-pro", "universal-2"]),
            patch.object(self.main, "ASSEMBLYAI_MULTICHANNEL", True),
            patch.object(self.main, "ASSEMBLYAI_SPEAKER_LABELS", True),
        ):
            payload = self.main.build_assemblyai_transcript_payload("https://example.test/audio.mp3")

        self.assertEqual(payload["audio_url"], "https://example.test/audio.mp3")
        self.assertEqual(payload["speech_models"], ["universal-3-pro", "universal-2"])
        self.assertTrue(payload["language_detection"])
        self.assertTrue(payload["multichannel"])
        self.assertNotIn("speaker_labels", payload)

    def test_post_call_analysis_updates_transcript_summary_and_sheets_payload(self):
        recording_path = Path(self.tmpdir.name) / "analysis-session-1.mp3"
        recording_path.write_bytes(b"fake audio bytes")

        db = self.database.SessionLocal()
        try:
            db.add(
                self.database.Call(
                    voximplant_session_id="analysis-session-1",
                    client_phone="79958407752",
                    client_name="Nikita",
                    status="finalized",
                    summary="raw agent summary",
                    outcome="raw outcome",
                    next_step="raw next step",
                    dialogue_text="raw dialogue",
                    local_recording_path=str(recording_path),
                    recording_url="https://voximplant.example/analysis-session-1.mp3",
                    recording_status="downloaded",
                )
            )
            db.commit()
        finally:
            db.close()

        assembly_payload = {
            "id": "assembly-transcript-1",
            "text": "Speaker A asks. Speaker B answers.",
            "utterances": [
                {"speaker": "A", "text": "Good afternoon, may I ask a few questions?"},
                {"speaker": "B", "text": "Yes."},
            ],
        }
        gemini_result = {
            "summary": "The client agreed to answer the questions.",
            "outcome": "Reached",
            "next_step": "Send details to the manager.",
            "call_goal": "Qualify forum participant",
            "manager_offer": "AI voice assistant for business calls",
            "summary_fields": {
                "activity_type": "Furniture production",
                "is_decision_maker": "Yes",
            },
        }

        with (
            patch.object(self.main, "ASSEMBLYAI_API_KEY", "test-assembly-key"),
            patch.object(self.main, "GEMINI_API_KEY", "test-gemini-key"),
            patch.object(self.main, "assemblyai_transcribe_file", new_callable=AsyncMock) as transcribe,
            patch.object(self.main, "gemini_analyze_transcript", new_callable=AsyncMock) as analyze,
            patch.object(self.main, "send_to_google_sheets", new_callable=AsyncMock) as send_sheets,
        ):
            transcribe.return_value = assembly_payload
            analyze.return_value = gemini_result
            send_sheets.return_value = ("sent", '{"ok":true}')

            import asyncio

            asyncio.run(self.main.process_call_analysis("analysis-session-1"))

        db = self.database.SessionLocal()
        try:
            db_call = db.query(self.database.Call).filter(
                self.database.Call.voximplant_session_id == "analysis-session-1"
            ).first()
            self.assertIsNotNone(db_call)
            self.assertEqual(db_call.transcription_status, "completed")
            self.assertEqual(db_call.transcription_id, "assembly-transcript-1")
            self.assertIn("Speaker A: Good afternoon", db_call.dialogue_text)
            self.assertEqual(db_call.analysis_status, "completed")
            self.assertEqual(db_call.summary, "The client agreed to answer the questions.")
            self.assertEqual(db_call.outcome, "Reached")
            self.assertIn("Furniture production", db_call.summary_fields_json)
        finally:
            db.close()

        self.assertEqual(send_sheets.await_count, 2)
        sheets_payload = send_sheets.await_args.args[0]
        self.assertEqual(sheets_payload["session_id"], "analysis-session-1")
        self.assertEqual(sheets_payload["dialogue_text"], "Speaker A: Good afternoon, may I ask a few questions?\nSpeaker B: Yes.")
        self.assertEqual(sheets_payload["summary"], "The client agreed to answer the questions.")
        self.assertEqual(sheets_payload["summary_fields"]["activity_type"], "Furniture production")


if __name__ == "__main__":
    unittest.main()
