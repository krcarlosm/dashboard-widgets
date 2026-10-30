"""Armazenamento em disco do Baú de Lembranças.

Cada item é um arquivo em `textos/` ou `imagens/`. O nome carrega a origem e o
instante de criação em milissegundos (ex.: `clipboard_1793370566123.txt`), que é
a referência para a retenção. Nomes antigos em segundos continuam válidos.
"""

import hashlib
import io
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ITEM_ID_PATTERN = re.compile(r"^(clipboard|screenshot)_(\d+)(?:_(\d+))?\.(txt|png)$")
PREVIEW_CHARS = 200
THUMBNAIL_SIZE = (320, 240)
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_IMAGE_BYTES = 50 * 1024 * 1024


@dataclass
class BauItem:
    id: str
    kind: str  # 'text' | 'image'
    source: str  # 'clipboard' | 'screenshot'
    timestamp: int  # milissegundos
    size: int
    preview: Optional[str] = None
    chars: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "source": self.source,
            "timestamp": self.timestamp,
            "size": self.size,
            "preview": self.preview,
            "chars": self.chars,
        }


def content_hash(kind: str, data: bytes) -> str:
    """Hash usado para não duplicar itens. Imagens usam os pixels, não o PNG."""
    if kind == "image":
        try:
            from PIL import Image

            with Image.open(io.BytesIO(data)) as img:
                rgb = img.convert("RGB")
                return hashlib.sha256(f"{rgb.size}".encode() + rgb.tobytes()).hexdigest()
        except Exception:
            pass
    return hashlib.sha256(data).hexdigest()


class BauStore:
    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.text_dir = storage_dir / "textos"
        self.image_dir = storage_dir / "imagens"
        self.thumb_dir = storage_dir / "miniaturas"
        for folder in (self.text_dir, self.image_dir, self.thumb_dir):
            folder.mkdir(parents=True, exist_ok=True)

    # ── Leitura ──────────────────────────────────────────────────────────────
    def _path_for(self, item_id: str) -> Optional[Path]:
        match = ITEM_ID_PATTERN.match(item_id)
        if not match:
            return None
        folder = self.text_dir if match.group(4) == "txt" else self.image_dir
        path = folder / item_id
        return path if path.is_file() else None

    @staticmethod
    def _timestamp_ms(raw: str) -> int:
        value = int(raw)
        # Nomes antigos usavam segundos.
        return value * 1000 if value < 100_000_000_000 else value

    def _build_item(self, path: Path, with_preview: bool = True) -> Optional[BauItem]:
        match = ITEM_ID_PATTERN.match(path.name)
        if not match:
            return None
        kind = "text" if match.group(4) == "txt" else "image"
        item = BauItem(
            id=path.name,
            kind=kind,
            source=match.group(1),
            timestamp=self._timestamp_ms(match.group(2)),
            size=path.stat().st_size,
        )
        if kind == "text" and with_preview:
            text = path.read_bytes().decode("utf-8", errors="replace")
            item.preview = text[:PREVIEW_CHARS]
            item.chars = len(text)
        return item

    def _all_paths(self) -> list[Path]:
        paths = [p for p in self.text_dir.iterdir() if p.is_file()]
        paths += [p for p in self.image_dir.iterdir() if p.is_file()]
        return [p for p in paths if ITEM_ID_PATTERN.match(p.name)]

    def list_items(self, kind: Optional[str] = None, query: Optional[str] = None, limit: Optional[int] = None) -> list[dict]:
        items: list[BauItem] = []
        needle = query.casefold() if query else None
        for path in self._all_paths():
            item = self._build_item(path)
            if item is None or (kind and item.kind != kind):
                continue
            if needle:
                if item.kind != "text":
                    continue
                if needle not in path.read_bytes().decode("utf-8", errors="replace").casefold():
                    continue
            items.append(item)
        items.sort(key=lambda entry: entry.timestamp, reverse=True)
        if limit:
            items = items[:limit]
        return [item.to_dict() for item in items]

    def counts(self) -> dict:
        paths = self._all_paths()
        texts = sum(1 for p in paths if p.suffix == ".txt")
        return {"text": texts, "image": len(paths) - texts}

    def get(self, item_id: str) -> Optional[BauItem]:
        path = self._path_for(item_id)
        return self._build_item(path) if path else None

    def read_text(self, item_id: str) -> Optional[str]:
        path = self._path_for(item_id)
        if not path or path.suffix != ".txt":
            return None
        return path.read_bytes().decode("utf-8", errors="replace")

    def image_path(self, item_id: str) -> Optional[Path]:
        path = self._path_for(item_id)
        return path if path and path.suffix == ".png" else None

    def thumbnail_path(self, item_id: str) -> Optional[Path]:
        source = self.image_path(item_id)
        if not source:
            return None
        thumb = self.thumb_dir / f"{source.stem}.jpg"
        if not thumb.exists():
            from PIL import Image

            with Image.open(source) as img:
                img.thumbnail(THUMBNAIL_SIZE)
                img.convert("RGB").save(thumb, format="JPEG", quality=80)
        return thumb

    def latest_hash(self) -> Optional[str]:
        paths = [p for p in self._all_paths() if p.name.startswith("clipboard_")]
        if not paths:
            return None
        latest = max(paths, key=lambda p: self._timestamp_ms(ITEM_ID_PATTERN.match(p.name).group(2)))
        kind = "text" if latest.suffix == ".txt" else "image"
        return content_hash(kind, latest.read_bytes())

    # ── Escrita ──────────────────────────────────────────────────────────────
    def save(self, kind: str, data: bytes, source: str = "clipboard") -> Optional[BauItem]:
        limit = MAX_TEXT_BYTES if kind == "text" else MAX_IMAGE_BYTES
        if len(data) > limit:
            return None

        folder = self.text_dir if kind == "text" else self.image_dir
        extension = ".txt" if kind == "text" else ".png"
        stamp = int(time.time() * 1000)
        target = folder / f"{source}_{stamp}{extension}"
        suffix = 1
        while target.exists():
            target = folder / f"{source}_{stamp}_{suffix}{extension}"
            suffix += 1

        # Bytes gravados sem conversão de quebra de linha: o hash continua igual após reiniciar.
        target.write_bytes(data)
        return self._build_item(target)

    def delete(self, item_id: str) -> bool:
        path = self._path_for(item_id)
        if not path:
            return False
        path.unlink(missing_ok=True)
        (self.thumb_dir / f"{path.stem}.jpg").unlink(missing_ok=True)
        return True

    def clear(self, kind: Optional[str] = None) -> list[str]:
        removed: list[str] = []
        for path in self._all_paths():
            is_text = path.suffix == ".txt"
            if kind == "text" and not is_text or kind == "image" and is_text:
                continue
            if self.delete(path.name):
                removed.append(path.name)
        return removed

    def purge_older_than(self, max_age_hours: int) -> list[str]:
        cutoff = (time.time() - max_age_hours * 3600) * 1000
        removed: list[str] = []
        for path in self._all_paths():
            match = ITEM_ID_PATTERN.match(path.name)
            if self._timestamp_ms(match.group(2)) < cutoff and self.delete(path.name):
                removed.append(path.name)
        # Miniaturas sem imagem de origem (ex.: removida manualmente).
        for thumb in self.thumb_dir.glob("*.jpg"):
            if not (self.image_dir / f"{thumb.stem}.png").exists():
                thumb.unlink(missing_ok=True)
        return removed
