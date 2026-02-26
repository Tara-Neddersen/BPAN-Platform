#!/usr/bin/env python3
"""
Local transcription companion service for BPAN.

Purpose:
- Runs on your Mac (or another machine you control)
- Receives uploaded meeting recordings via HTTP multipart/form-data
- Converts audio with ffmpeg and transcribes with whisper.cpp / whisper-cli
- Returns JSON transcript

Security:
- Optional bearer token via LOCAL_COMPANION_TOKEN env var

Example:
  LOCAL_COMPANION_TOKEN=secret \
  WHISPER_CPP_BIN=/opt/homebrew/bin/whisper-cli \
  WHISPER_CPP_MODEL_PATH=$HOME/whisper.cpp/models/ggml-base.en.bin \
  python3 scripts/local_transcription_companion.py --host 127.0.0.1 --port 8787
"""

from __future__ import annotations

import argparse
import cgi
import json
import os
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


def command_path(cmd: str) -> str | None:
    return shutil.which(cmd)


def detect_whisper_cli() -> tuple[str, str] | None:
    bin_path = os.environ.get("WHISPER_CPP_BIN") or command_path("whisper-cli") or command_path("main")
    if not bin_path:
        return None
    model_candidates = [
        os.environ.get("WHISPER_CPP_MODEL_PATH"),
        str(Path.home() / "whisper.cpp/models/ggml-base.en.bin"),
        str(Path.home() / "whisper.cpp/models/ggml-base.bin"),
    ]
    for model in model_candidates:
        if model and Path(model).exists():
            return (bin_path, model)
    return None


def run_transcription(input_file: Path) -> str:
    ffmpeg = command_path("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if not Path(ffmpeg).exists():
        raise RuntimeError("ffmpeg not found")

    whisper = detect_whisper_cli()
    if not whisper:
        raise RuntimeError("whisper-cli (or main) + model not found")

    whisper_bin, model_path = whisper
    with tempfile.TemporaryDirectory(prefix="bpan-companion-") as tmp:
        tmp_path = Path(tmp)
        wav_path = tmp_path / "audio.wav"
        out_base = tmp_path / "transcript"

        subprocess.run(
            [ffmpeg, "-y", "-i", str(input_file), "-ac", "1", "-ar", "16000", str(wav_path)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        subprocess.run(
            [whisper_bin, "-m", model_path, "-f", str(wav_path), "-otxt", "-of", str(out_base), "-l", "en"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        txt = (tmp_path / "transcript.txt").read_text(encoding="utf-8").strip()
        return txt


class CompanionHandler(BaseHTTPRequestHandler):
    server_version = "BPANCompanion/0.1"

    def _send_json(self, status: int, payload: dict):
      self.send_response(status)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _authorized(self) -> bool:
      expected = os.environ.get("LOCAL_COMPANION_TOKEN")
      if not expected:
          return True
      header = self.headers.get("Authorization", "")
      if header.startswith("Bearer "):
          return header.split(" ", 1)[1] == expected
      return False

    def do_GET(self):
      if self.path.rstrip("/") in ("", "/"):
          self._send_json(200, {"ok": True, "service": "bpan-local-transcription-companion"})
          return
      if self.path.rstrip("/") == "/health":
          whisper = detect_whisper_cli()
          self._send_json(200, {"ok": True, "whisper_ready": bool(whisper), "ffmpeg": bool(command_path("ffmpeg"))})
          return
      self._send_json(404, {"error": "Not found"})

    def do_POST(self):
      if self.path.rstrip("/") not in ("/transcribe", "/api/transcribe"):
          self._send_json(404, {"error": "Not found"})
          return
      if not self._authorized():
          self._send_json(401, {"error": "Unauthorized"})
          return

      ctype, pdict = cgi.parse_header(self.headers.get("content-type") or "")
      if ctype != "multipart/form-data":
          self._send_json(400, {"error": "multipart/form-data required"})
          return

      pdict["boundary"] = bytes(pdict["boundary"], "utf-8")
      pdict["CONTENT-LENGTH"] = int(self.headers.get("content-length", "0"))
      form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"}, keep_blank_values=True)
      file_item = form["file"] if "file" in form else None
      if not file_item or not getattr(file_item, "file", None):
          self._send_json(400, {"error": "file is required"})
          return

      with tempfile.TemporaryDirectory(prefix="bpan-companion-upload-") as tmp:
          ext = Path(getattr(file_item, "filename", "") or "upload.bin").suffix or ".bin"
          input_path = Path(tmp) / f"input{ext}"
          with open(input_path, "wb") as f:
              f.write(file_item.file.read())
          try:
              transcript = run_transcription(input_path)
          except subprocess.CalledProcessError as e:
              err = e.stderr.decode("utf-8", errors="ignore") if e.stderr else str(e)
              self._send_json(500, {"error": f"Transcription subprocess failed: {err[:800]}"})
              return
          except Exception as e:
              self._send_json(500, {"error": str(e)})
              return

      if not transcript:
          self._send_json(422, {"error": "No speech detected in recording."})
          return

      self._send_json(200, {"transcript": transcript, "engine": "whisper-cli-companion"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), CompanionHandler)
    print(f"BPAN local transcription companion listening on http://{args.host}:{args.port}")
    print("POST /transcribe (multipart/form-data with field 'file')")
    server.serve_forever()


if __name__ == "__main__":
    main()
