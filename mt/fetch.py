"""Descarga y archivado de archivos crudos.

Cada descarga queda en data/raw/<fuente>/<YYYY-MM-DD>/<archivo>[.gz] y se
registra en data/raw/<fuente>/manifest.jsonl con url, fecha, sha256 y tamaño.
Si el contenido es idéntico a la última descarga, no se guarda de nuevo.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# Los sitios del gobierno devuelven 403 sin un User-Agent de navegador.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126 Safari/537.36 mendoza-transparente/0.1"
)

# Por encima de este tamaño el archivo se guarda comprimido con gzip.
GZIP_THRESHOLD = 1_000_000

session = requests.Session()
session.headers["User-Agent"] = USER_AGENT


def get(url: str, *, method: str = "GET", retries: int = 3, **kwargs) -> requests.Response:
    """Pedido HTTP con reintentos y una pausa corta para no saturar los servidores."""
    kwargs.setdefault("timeout", 60)
    for attempt in range(retries):
        try:
            resp = session.request(method, url, **kwargs)
            resp.raise_for_status()
            time.sleep(0.5)
            return resp
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt * 2)
    raise AssertionError("unreachable")


def _last_sha(manifest: Path, filename: str) -> str | None:
    if not manifest.exists():
        return None
    last = None
    for line in manifest.read_text().splitlines():
        entry = json.loads(line)
        if entry["filename"] == filename:
            last = entry["sha256"]
    return last


def archive(source: str, filename: str, content: bytes, *, url: str) -> Path | None:
    """Guarda `content` en el archivo crudo de la fuente. Devuelve la ruta, o None si no cambió."""
    source_dir = RAW / source
    manifest = source_dir / "manifest.jsonl"
    sha = hashlib.sha256(content).hexdigest()
    if _last_sha(manifest, filename) == sha:
        return None

    now = datetime.now(timezone.utc)
    day_dir = source_dir / now.strftime("%Y-%m-%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    compressed = len(content) > GZIP_THRESHOLD
    path = day_dir / (filename + (".gz" if compressed else ""))
    path.write_bytes(gzip.compress(content, mtime=0) if compressed else content)

    entry = {
        "filename": filename,
        "path": str(path.relative_to(ROOT)),
        "url": url,
        "fetched_at": now.isoformat(timespec="seconds"),
        "sha256": sha,
        "bytes": len(content),
        "gzip": compressed,
    }
    with manifest.open("a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return path


def fetch(source: str, url: str, filename: str, **kwargs) -> Path | None:
    """Descarga `url` y la archiva bajo la fuente `source`."""
    resp = get(url, **kwargs)
    return archive(source, filename, resp.content, url=url)


def read_raw(path: Path) -> bytes:
    """Lee un archivo crudo, descomprimiendo si hace falta."""
    data = path.read_bytes()
    return gzip.decompress(data) if path.suffix == ".gz" else data
