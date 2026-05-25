import importlib
import os
import sys
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
