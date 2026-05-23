import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
