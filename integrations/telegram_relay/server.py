"""Isolated Telegram relay. Global message keys never retry unknown delivery."""

import hashlib
import hmac
import json
import logging
import os
import sqlite3
import urllib.error
import urllib.request
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 32 * 1024


class RelayError(Exception):
    def __init__(self, status, category):
        self.status, self.category = status, category
        super().__init__(category)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send_telegram(bot_token, payload):
    request = urllib.request.Request(
        "https://api.telegram.org/bot" + bot_token + "/sendMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=10) as response:
        raw = response.read(MAX_BODY + 1)
        if len(raw) > MAX_BODY:
            raise RelayError(502, "invalid_upstream_response")
        return json.loads(raw)


class Relay:
    def __init__(self, auth_token, bot_token, chat_ids, db_path, upstream=None):
        if not auth_token or not bot_token or not chat_ids:
            raise ValueError("invalid_configuration")
        self.auth = ("Bearer " + auth_token).encode("utf-8")
        self.bot_token, self.chat_ids = bot_token, frozenset(chat_ids)
        self.db_path, self.upstream = str(db_path), upstream or send_telegram
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute("""CREATE TABLE IF NOT EXISTS messages (
                message_key TEXT PRIMARY KEY, body_hash TEXT NOT NULL,
                state TEXT NOT NULL, message_id INTEGER)""")

    def authorized(self, value):
        return hmac.compare_digest(value.encode("utf-8"), self.auth)

    def _reserve(self, key, fingerprint):
        with closing(sqlite3.connect(self.db_path, timeout=10)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT body_hash, state, message_id FROM messages WHERE message_key=?",
                (key,),
            ).fetchone()
            if row:
                if row[0] != fingerprint:
                    raise RelayError(409, "message_key_conflict")
                if row[1] != "sent":
                    raise RelayError(409, "delivery_unknown")
                return row[2]
            # Commit before sending: crashes and concurrent duplicates cannot resend.
            db.execute("INSERT INTO messages VALUES (?, ?, 'unknown', NULL)",
                       (key, fingerprint))
        return None

    def send(self, body):
        if not isinstance(body, dict) or set(body) - {"chat_id", "text", "message_key"}:
            raise RelayError(400, "invalid_request")
        chat_id, text, key = body.get("chat_id"), body.get("text"), body.get("message_key")
        if type(chat_id) not in (str, int):
            raise RelayError(400, "invalid_chat_id")
        chat_id = str(chat_id)
        if chat_id not in self.chat_ids:
            raise RelayError(403, "chat_not_allowed")
        if not isinstance(text, str) or not 1 <= len(text) <= 3900:
            raise RelayError(400, "invalid_text")
        if "message_key" in body and (not isinstance(key, str) or not 1 <= len(key) <= 200):
            raise RelayError(400, "invalid_message_key")
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        if key:
            receipt = self._reserve(key, fingerprint)
            if receipt is not None:
                return {"ok": True, "result": {"message_id": receipt}}
        try:
            result = self.upstream(self.bot_token, payload)
        except urllib.error.HTTPError as exc:
            category = "upstream_rejected" if 400 <= exc.code < 500 else "delivery_unknown"
            raise RelayError(502, category) from None
        except TimeoutError:
            raise RelayError(504, "delivery_unknown") from None
        except urllib.error.URLError as exc:
            status = 504 if isinstance(exc.reason, TimeoutError) else 502
            raise RelayError(status, "delivery_unknown") from None
        except Exception:
            raise RelayError(502, "delivery_unknown") from None
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise RelayError(502, "upstream_rejected")
        receipt = result.get("result")
        receipt = receipt.get("message_id") if isinstance(receipt, dict) else None
        if type(receipt) is not int or receipt <= 0:
            raise RelayError(502, "invalid_upstream_response")
        if key:
            with closing(sqlite3.connect(self.db_path, timeout=10)) as db, db:
                db.execute("UPDATE messages SET state='sent', message_id=? WHERE message_key=?",
                           (receipt, key))
        return {"ok": True, "result": {"message_id": receipt}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Default access logs can include untrusted paths and headers.

    def _reply(self, status, body):
        self.close_connection = True
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)

    def send_error(self, code, message=None, explain=None):
        self._reply(code, {"ok": False, "error": "invalid_http_request"})

    def do_GET(self):
        if self.path == "/health":
            self._reply(200, {"ok": True})
        else:
            self._reply(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        try:
            if self.path != "/send-message":
                raise RelayError(404, "not_found")
            auth = self.headers.get_all("Authorization", [])
            if len(auth) != 1 or not self.server.relay.authorized(auth[0]):
                raise RelayError(401, "unauthorized")
            if self.headers.get("Transfer-Encoding"):
                raise RelayError(400, "invalid_content_length")
            lengths = self.headers.get_all("Content-Length", [])
            if not lengths:
                raise RelayError(411, "content_length_required")
            if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
                raise RelayError(400, "invalid_content_length")
            length = int(lengths[0])
            if length > MAX_BODY:
                raise RelayError(413, "body_too_large")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise RelayError(400, "incomplete_body")
            try:
                body = json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeError, RecursionError):
                raise RelayError(400, "invalid_json") from None
            result = self.server.relay.send(body)
        except RelayError as exc:
            self._reply(exc.status, {"ok": False, "error": exc.category})
        except sqlite3.Error:
            logging.error("relay_storage_error")
            self._reply(503, {"ok": False, "error": "storage_error"})
        except Exception:
            logging.error("relay_internal_error")
            self._reply(503, {"ok": False, "error": "internal_error"})
        else:
            self._reply(200, result)


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        logging.error("relay_request_error")  # Never print raw exception tracebacks.


def make_server(relay, address=("0.0.0.0", 8080), *, bind_and_activate=True):
    server = Server(address, Handler, bind_and_activate=bind_and_activate)
    server.relay = relay
    return server


def main():
    try:
        relay = Relay(
            os.environ.get("RELAY_AUTH_TOKEN", ""), os.environ.get("TELEGRAM_BOT_TOKEN", ""),
            {value.strip() for value in os.environ.get("TELEGRAM_CHAT_IDS", "").split(",")
             if value.strip()}, os.environ.get("RELAY_DB_PATH", "/data/relay.sqlite"),
        )
        server = make_server(relay)
    except Exception:
        logging.error("relay_startup_error")
        return 1
    with server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
