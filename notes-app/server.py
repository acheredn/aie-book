#!/usr/bin/env python3
"""
Zero-dependency local notes app for AI Engineering (Chip Huyen).

Run:
    python3 server.py [port]

Then open http://localhost:8420 (or the port you gave).
Notes are saved to notes.json next to this file (git-trackable).
"""
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
NOTES_PATH = APP_DIR / "notes.json"

_lock = threading.Lock()


def load_notes():
    if not NOTES_PATH.exists():
        return {}
    with _lock:
        try:
            return json.loads(NOTES_PATH.read_text() or "{}")
        except json.JSONDecodeError:
            return {}


def save_notes(data):
    with _lock:
        NOTES_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/notes":
            return self._json(load_notes())
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/notes":
            length = int(self.headers.get("Content-Length", 0))
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json({"error": "invalid json"}, 400)

            node_id = payload.get("id")
            entry = payload.get("entry")
            if not node_id or entry is None:
                return self._json({"error": "id and entry required"}, 400)

            notes = load_notes()
            notes[node_id] = entry
            save_notes(notes)
            return self._json({"ok": True})

        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8420
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"AI Engineering notes app running at http://localhost:{port}")
    print(f"Notes saved to {NOTES_PATH}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
