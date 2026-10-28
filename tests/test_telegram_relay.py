"""Socket-free HTTP tests; every upstream is injected or urllib is mocked."""

import contextlib
import importlib.util
import io
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "integrations/telegram_relay/server.py"
SPEC = importlib.util.spec_from_file_location("telegram_relay", MODULE_PATH)
relay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(relay)


class FakeSocket:
    def __init__(self, request):
        self.incoming = io.BytesIO(request)
        self.outgoing = io.BytesIO()

    def makefile(self, *args):
        return self.incoming

    def sendall(self, data):
        self.outgoing.write(data)


class TelegramRelayTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "nested/relay.sqlite"
        self.upstream = Mock(return_value={"ok": True, "result": {"message_id": 123}})
        self.app = self.new_app()

    def new_app(self):
        return relay.Relay("test-auth", "test-bot", {"-100123", "42"}, self.db, self.upstream)

    def request(self, body=None, *, method="POST", path="/send-message", auth="Bearer test-auth",
                raw=None, headers=None):
        raw = json.dumps(body).encode() if raw is None else raw
        lines = [f"{method} {path} HTTP/1.1", "Host: localhost"]
        if auth is not None:
            lines.append("Authorization: " + auth)
        lines.extend(headers if headers is not None else [f"Content-Length: {len(raw)}"])
        request = ("\r\n".join(lines) + "\r\n\r\n").encode() + raw
        sock = FakeSocket(request)
        relay.Handler(sock, ("127.0.0.1", 1), SimpleNamespace(relay=self.app))
        head, response = sock.outgoing.getvalue().split(b"\r\n\r\n", 1)
        return int(head.split()[1]), json.loads(response)

    def message(self, **changes):
        return {"chat_id": "-100123", "text": "<b>Hello</b>", **changes}

    def test_health_and_routing(self):
        self.assertEqual(self.request(method="GET", path="/health", auth=None), (200, {"ok": True}))
        self.assertEqual(self.request(method="GET", path="/missing")[0], 404)
        self.assertEqual(self.request(path="/missing")[0], 404)
        self.assertEqual(self.request(method="DELETE")[0], 501)
        self.upstream.assert_not_called()

    def test_auth_is_constant_time_and_requires_exact_bearer(self):
        for value in (None, "test-auth", "Bearer wrong", "bearer test-auth", "Bearer \u00e9"):
            with self.subTest(value=value):
                self.assertEqual(self.request(self.message(), auth=value)[0], 401)
        with patch.object(relay.hmac, "compare_digest", wraps=relay.hmac.compare_digest) as compare:
            self.assertEqual(self.request(self.message())[0], 200)
            compare.assert_called_once_with(b"Bearer test-auth", b"Bearer test-auth")

    def test_duplicate_auth_headers_are_rejected(self):
        headers = ["Content-Length: 0", "Authorization: Bearer test-auth"]
        self.assertEqual(self.request(raw=b"", headers=headers)[0], 401)
        self.upstream.assert_not_called()

    def test_allowlist_and_valid_send(self):
        self.assertEqual(self.request(self.message(chat_id="999"))[0], 403)
        self.upstream.assert_not_called()
        self.assertEqual(self.request(self.message(chat_id=42)),
                         (200, {"ok": True, "result": {"message_id": 123}}))
        self.upstream.assert_called_once_with(
            "test-bot", {"chat_id": "42", "text": "<b>Hello</b>", "parse_mode": "HTML"})

    def test_body_and_text_size_limits(self):
        self.assertEqual(self.request(raw=b"x" * (relay.MAX_BODY + 1))[0], 413)
        self.assertEqual(self.request(self.message(text="x" * 3901))[0], 400)
        self.upstream.assert_not_called()
        self.assertEqual(self.request(self.message(text="x" * 3900))[0], 200)
        raw = json.dumps(self.message()).encode()
        self.assertEqual(self.request(raw=raw + b" " * (relay.MAX_BODY - len(raw)))[0], 200)

    def test_invalid_json_and_fields(self):
        for raw in (b"{", b"\xff", b"[1]", b"null", b"[" * 1500):
            with self.subTest(raw=raw[:12]):
                self.assertEqual(self.request(raw=raw)[0], 400)
        for changes in ({"text": ""}, {"text": 3}, {"chat_id": True}, {"chat_id": []},
                        {"message_key": "x" * 201}, {"message_key": ""},
                        {"message_key": None}, {"parse_mode": "Markdown"}):
            with self.subTest(changes=changes):
                self.assertEqual(self.request(self.message(**changes))[0], 400)
        self.upstream.assert_not_called()

    def test_invalid_lengths_and_transfer_encoding(self):
        for headers, status in (([], 411), (["Content-Length: -1"], 400),
                                (["Content-Length: nope"], 400),
                                (["Content-Length: 0", "Content-Length: 0"], 400),
                                (["Transfer-Encoding: chunked"], 400),
                                (["Content-Length: 10"], 400)):
            with self.subTest(headers=headers):
                self.assertEqual(self.request(raw=b"", headers=headers)[0], status)
        self.upstream.assert_not_called()

    def test_idempotence_survives_restart_and_does_not_store_text(self):
        body = self.message(message_key="k" * 200)
        expected = (200, {"ok": True, "result": {"message_id": 123}})
        self.assertEqual(self.request(body), expected)
        self.app = self.new_app()
        self.assertEqual(self.request(dict(reversed(list(body.items())))), expected)
        self.upstream.assert_called_once()
        with contextlib.closing(sqlite3.connect(self.db)) as db:
            row = db.execute("SELECT * FROM messages").fetchone()
        self.assertEqual(row[2:], ("sent", 123))
        self.assertNotIn(body["text"], repr(row))

    def test_same_key_different_body_conflicts(self):
        self.assertEqual(self.request(self.message(message_key="key"))[0], 200)
        for changes in ({"text": "changed"}, {"chat_id": "42"}):
            self.assertEqual(self.request(self.message(message_key="key", **changes)),
                             (409, {"ok": False, "error": "message_key_conflict"}))
        self.upstream.assert_called_once()

    def test_timeout_is_persisted_unknown_without_retry(self):
        self.upstream.side_effect = TimeoutError("SECRET URL TEXT")
        body = self.message(message_key="unknown")
        self.assertEqual(self.request(body), (504, {"ok": False, "error": "delivery_unknown"}))
        self.app = self.new_app()
        self.assertEqual(self.request(body), (409, {"ok": False, "error": "delivery_unknown"}))
        self.assertEqual(self.request({**body, "text": "changed"})[0], 409)
        self.upstream.assert_called_once()

    def test_concurrent_duplicate_is_not_sent_twice(self):
        entered, release = threading.Event(), threading.Event()
        results = []

        def blocked_upstream(*args):
            entered.set()
            if not release.wait(5):
                raise TimeoutError()
            return {"ok": True, "result": {"message_id": 123}}

        self.upstream.side_effect = blocked_upstream
        body = self.message(message_key="concurrent")
        worker = threading.Thread(target=lambda: results.append(self.request(body)))
        worker.start()
        try:
            self.assertTrue(entered.wait(5))
            self.assertEqual(self.request(body)[0], 409)
        finally:
            release.set()
            worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(results[0][0], 200)
        self.upstream.assert_called_once()

    def test_errors_and_access_logs_are_redacted(self):
        secret = "SECRET https://api.telegram.org/botLEAK/sendMessage private text"
        errors = [urllib.error.HTTPError(secret, 400, secret, {}, None),
                  urllib.error.HTTPError(secret, 503, secret, {}, None),
                  urllib.error.URLError(TimeoutError(secret)),
                  urllib.error.URLError(secret), RuntimeError(secret)]
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            for index, error in enumerate(errors):
                with self.subTest(error=type(error).__name__):
                    self.upstream.side_effect = error
                    body = self.message(text=secret, message_key=str(index))
                    status, response = self.request(body)
                    self.assertIn(status, (502, 504))
                    self.assertNotIn("SECRET", json.dumps(response))
                    self.assertEqual(self.request(body)[0], 409)
            self.request(method="GET", path="/" + secret.replace(" ", "_"))
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(self.upstream.call_count, len(errors))

    def test_invalid_upstream_result_is_not_retried_or_exposed(self):
        for index, result in enumerate((None, {"ok": False, "description": "SECRET"},
                                        {"ok": True}, {"ok": True, "result": {"message_id": True}})):
            self.upstream.return_value = result
            body = self.message(message_key=str(index))
            status, response = self.request(body)
            self.assertEqual(status, 502)
            self.assertNotIn("SECRET", json.dumps(response))
            self.assertEqual(self.request(body)[0], 409)
        self.assertEqual(self.upstream.call_count, 4)

    def test_receipt_write_failure_keeps_unknown_reservation(self):
        body = self.message(message_key="write-failure")
        original_connect = sqlite3.connect
        calls = 0

        def connect(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise sqlite3.OperationalError("SECRET URL TEXT")
            return original_connect(*args, **kwargs)

        with patch.object(relay.sqlite3, "connect", side_effect=connect):
            with self.assertLogs(level="ERROR") as logs:
                self.assertEqual(self.request(body), (503, {"ok": False, "error": "storage_error"}))
        self.assertNotIn("SECRET", repr(logs.output))
        self.assertEqual(self.request(body)[0], 409)
        self.upstream.assert_called_once()

    def test_reservation_failure_prevents_upstream_send(self):
        with patch.object(relay.sqlite3, "connect", side_effect=sqlite3.OperationalError("SECRET")):
            with self.assertLogs(level="ERROR") as logs:
                self.assertEqual(self.request(self.message(message_key="key")),
                                 (503, {"ok": False, "error": "storage_error"}))
        self.assertNotIn("SECRET", repr(logs.output))
        self.upstream.assert_not_called()

    def test_default_server_is_threaded_and_uses_injected_relay(self):
        with patch.object(relay, "Server") as server_type:
            server = relay.make_server(self.app, bind_and_activate=False)
        server_type.assert_called_once_with(("0.0.0.0", 8080), relay.Handler, bind_and_activate=False)
        self.assertIs(server.relay, self.app)
        self.assertTrue(issubclass(relay.Server, relay.ThreadingHTTPServer))

    def test_main_reads_environment_and_uses_default_db_path(self):
        server = Mock()
        server.__enter__ = Mock(return_value=server)
        server.__exit__ = Mock(return_value=False)
        server.serve_forever.side_effect = KeyboardInterrupt
        env = {"RELAY_AUTH_TOKEN": "test-auth", "TELEGRAM_BOT_TOKEN": "test-bot",
               "TELEGRAM_CHAT_IDS": " -100123, 42, ,42 "}
        with patch.dict(relay.os.environ, env, clear=True), patch.object(relay, "Relay") as app_type:
            with patch.object(relay, "make_server", return_value=server) as factory:
                self.assertEqual(relay.main(), 0)
        app_type.assert_called_once_with("test-auth", "test-bot", {"-100123", "42"}, "/data/relay.sqlite")
        factory.assert_called_once_with(app_type.return_value)
        server.serve_forever.assert_called_once()

    def test_request_and_startup_failures_log_only_categories(self):
        with self.assertLogs(level="ERROR") as logs:
            relay.Server.handle_error(None, None, None)
            with patch.object(relay, "Relay", side_effect=RuntimeError("SECRET URL TEXT")):
                self.assertEqual(relay.main(), 1)
        self.assertNotIn("SECRET", repr(logs.output))
        self.assertIn("relay_request_error", repr(logs.output))
        self.assertIn("relay_startup_error", repr(logs.output))

    def test_real_upstream_adapter_uses_fixed_https_html_timeout_and_no_redirects(self):
        opener = Mock()
        opener.open.return_value.__enter__ = Mock(return_value=io.BytesIO(
            b'{"ok":true,"result":{"message_id":123}}'))
        opener.open.return_value.__exit__ = Mock(return_value=False)
        with patch.object(relay.urllib.request, "build_opener", return_value=opener) as build:
            result = relay.send_telegram("test-bot", {"chat_id": "42", "text": "hello", "parse_mode": "HTML"})
        self.assertEqual(result["result"]["message_id"], 123)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.telegram.org/bottest-bot/sendMessage")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(json.loads(request.data)["parse_mode"], "HTML")
        self.assertEqual(opener.open.call_args.kwargs, {"timeout": 10})
        opener.open.assert_called_once()
        self.assertIsInstance(build.call_args.args[0], relay.NoRedirect)
        self.assertIsNone(relay.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com"))

    def test_empty_config_fails_closed(self):
        for auth, token, chats in (("", "bot", {"42"}), ("auth", "", {"42"}), ("auth", "bot", set())):
            with self.assertRaisesRegex(ValueError, "invalid_configuration"):
                relay.Relay(auth, token, chats, self.db, self.upstream)


if __name__ == "__main__":
    unittest.main()
