"""Verified access to the official Caravan-Qual Zenodo lite release."""

from __future__ import annotations

import hashlib
import json
import shutil
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
NORMALIZED = ROOT / "data" / "normalized"
MANIFEST = ROOT / "data" / "manifests" / "caravan-qual.json"
RECORD = "https://zenodo.org/api/records/21337532"
API_ROOT = "https://zenodo.org/api/records/21337532/files/"
ALLOWED_HOSTS = {"zenodo.org", "zenodo-production.s3.amazonaws.com"}
MAX_QUICKSTART_MEMBER_BYTES = 250_000_000
DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024


@dataclass(frozen=True)
class ReleaseFile:
    name: str
    size: int
    md5: str


RELEASE_FILES = {
    "wqms_site_info.csv": ReleaseFile(
        "wqms_site_info.csv", 14_770_683, "e572108191c49b838085ebb58fe637e1"
    ),
    "Caravan-Qual_zarr_variables.csv": ReleaseFile(
        "Caravan-Qual_zarr_variables.csv", 22_441, "60157e931389714af5aa1a59e052e00d"
    ),
    "Caravan-Qual_linkages.parquet": ReleaseFile(
        "Caravan-Qual_linkages.parquet", 25_870_862, "a6b57175b7b0b50278630147aa4389f2"
    ),
    "Caravan-Qual_licenses.zip": ReleaseFile(
        "Caravan-Qual_licenses.zip", 37_051, "53697f1f4b16f56aa3c14f3d30ce7e1c"
    ),
    "wqms-csv.zip": ReleaseFile("wqms-csv.zip", 641_285_380, "b093f92627f671a4f8be366838a6996b"),
}


def digest(path: Path) -> str:
    result = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def _download(name: str, *, max_bytes: int) -> Path:
    if name not in RELEASE_FILES:
        raise ValueError(f"Unsupported release file: {name}")
    expected = RELEASE_FILES[name]
    if expected.size > max_bytes:
        raise ValueError(
            f"{name} is {expected.size:,} bytes, above the configured {max_bytes:,} byte limit"
        )
    RAW.mkdir(parents=True, exist_ok=True)
    target = RAW / name
    if target.exists():
        if target.stat().st_size == expected.size and digest(target) == expected.md5:
            return target
        target.unlink()
    partial = target.with_suffix(target.suffix + ".part")
    if partial.exists() and partial.stat().st_size >= expected.size:
        partial.unlink()
    free_bytes = shutil.disk_usage(RAW).free
    needed_bytes = expected.size - (partial.stat().st_size if partial.exists() else 0)
    if free_bytes < needed_bytes + 64 * 1024 * 1024:
        raise OSError(f"Not enough free disk space to download {name} safely")

    url = API_ROOT + quote(name) + "/content"
    while (partial.stat().st_size if partial.exists() else 0) < expected.size:
        offset = partial.stat().st_size if partial.exists() else 0
        end = min(expected.size, offset + DOWNLOAD_CHUNK_BYTES) - 1
        request = urllib.request.Request(
            url,
            headers={
                "Range": f"bytes={offset}-{end}",
                "User-Agent": "RiverQualityAtlas/0.1 (research data client)",
            },
        )
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    if response.geturl().split("/", 3)[2] not in ALLOWED_HOSTS:
                        raise ValueError("Zenodo redirected the download to an unapproved host")
                    if response.status != 206:
                        raise OSError("Zenodo did not honor a bounded asset download")
                    content_range = response.headers.get("Content-Range", "")
                    try:
                        range_start, remainder = content_range.removeprefix("bytes ").split("-", 1)
                        range_end, total = remainder.split("/", 1)
                        received_start, received_end, received_total = (
                            int(range_start), int(range_end), int(total)
                        )
                    except (ValueError, TypeError) as exc:
                        raise OSError("Zenodo returned an invalid Content-Range header") from exc
                    if (
                        received_start != offset
                        or received_end > end
                        or received_total != expected.size
                    ):
                        raise OSError("Zenodo returned a range outside the requested asset bytes")
                    expected_bytes = received_end - received_start + 1
                    data = response.read(expected_bytes)
                    if not data:
                        raise OSError("Zenodo returned an empty byte range")
                    if len(data) < expected_bytes:
                        raise OSError(
                            "Zenodo closed the bounded download early; "
                            "saved prior progress for resume"
                        )
                    mode = "ab" if offset else "wb"
                    with partial.open(mode) as output:
                        output.write(data)
                break
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2**attempt)

    if not partial.exists():
        raise OSError(f"Failed to download {name}; no partial file was created")
    actual_size = partial.stat().st_size
    if actual_size != expected.size:
        partial.unlink(missing_ok=True)
        raise ValueError(
            f"Zenodo returned {actual_size:,} bytes for {name}; expected {expected.size:,}"
        )
    actual_md5 = digest(partial)
    if actual_md5 != expected.md5:
        partial.unlink(missing_ok=True)
        raise ValueError(
            f"Release checksum mismatch for {name}; expected MD5 {expected.md5}, "
            f"received {actual_md5}"
        )
    partial.replace(target)
    return target


class HTTPRangeReader:
    """Seekable, bounded HTTP reader used to access one CSV inside Zenodo's large ZIP."""

    def __init__(self, url: str, size: int, buffer_size: int = 4 * 1024 * 1024):
        self.url, self.size, self.position = url, size, 0
        self.buffer_size = buffer_size
        self._buffer = b""
        self._buffer_offset = 0

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            self.position = offset
        elif whence == 1:
            self.position += offset
        elif whence == 2:
            self.position = self.size + offset
        if not 0 <= self.position <= self.size:
            raise ValueError("Range seek outside archive")
        return self.position

    def tell(self) -> int:
        return self.position

    def read(self, count: int = -1) -> bytes:
        end = self.size if count < 0 else min(self.size, self.position + count)
        if end <= self.position:
            return b""
        if (
            self._buffer
            and self._buffer_offset <= self.position
            and end <= self._buffer_offset + len(self._buffer)
        ):
            buf_start = self.position - self._buffer_offset
            buf_end = end - self._buffer_offset
            data = self._buffer[buf_start:buf_end]
            self.position += len(data)
            return data

        fetch_end = min(self.size, max(end, self.position + self.buffer_size))
        request = urllib.request.Request(
            self.url,
            headers={
                "Range": f"bytes={self.position}-{fetch_end - 1}",
                "User-Agent": "RiverQualityAtlas/0.1",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.geturl().split("/", 3)[2] not in ALLOWED_HOSTS:
                raise ValueError("Zenodo redirected a range request to an unapproved host")
            content_range = response.headers.get("Content-Range", "")
            if response.status != 206 or not content_range.startswith(f"bytes {self.position}-"):
                raise OSError("The release server did not honor a bounded range request")
            self._buffer = response.read(fetch_end - self.position)
            self._buffer_offset = self.position
        needed = end - self.position
        data = self._buffer[:needed]
        self.position += len(data)
        return data

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True


def download_profile(profile: str, constituent: str | None = None) -> list[Path]:
    """Download verified metadata and a safely selected set of official observations."""
    if profile not in {"quickstart", "standard", "full"}:
        raise ValueError("Profile must be quickstart, standard, or full")
    files = [
        _download("Caravan-Qual_zarr_variables.csv", max_bytes=1_000_000),
        _download("Caravan-Qual_licenses.zip", max_bytes=1_000_000),
        _download("wqms_site_info.csv", max_bytes=25_000_000),
    ]
    archive_url = API_ROOT + "wqms-csv.zip/content"
    reader = HTTPRangeReader(archive_url, RELEASE_FILES["wqms-csv.zip"].size)
    with zipfile.ZipFile(reader) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if not csv_names:
            raise ValueError("The official observation archive contains no CSV files")
        if profile == "full":
            archive_path = _download("wqms-csv.zip", max_bytes=700_000_000)
            _extract_csvs(archive_path)
            return files + [RAW / "wqms-csv.zip"]
        if constituent:
            matches = [name for name in csv_names if Path(name).stem.lower() == constituent.lower()]
            if not matches:
                raise ValueError(
                    f"Constituent {constituent!r} is not present in the release archive"
                )
            selected = matches
        elif profile == "standard":
            selected = [name for name in csv_names if Path(name).stem.lower() in {"do", "no3n"}]
            if not selected:
                raise ValueError(
                    "Could not find the standard profile's dissolved oxygen or nitrate file"
                )
        else:
            selected = [name for name in csv_names if Path(name).stem.lower() == "do"]
            if not selected:
                raise ValueError(
                    "Could not find the official dissolved oxygen file for the quickstart profile"
                )
        destination = RAW / "wqms-csv"
        destination.mkdir(parents=True, exist_ok=True)
        for name in selected:
            info = archive.getinfo(name)
            if info.file_size > MAX_QUICKSTART_MEMBER_BYTES:
                raise ValueError(
                    f"Selected constituent {Path(name).stem} exceeds the "
                    f"{MAX_QUICKSTART_MEMBER_BYTES // 1_000_000} MB quick profile limit"
                )
            target = destination / f"{Path(name).stem}.csv"
            temporary = target.with_suffix(".csv.part")
            with archive.open(info) as source, temporary.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            temporary.replace(target)
            files.append(target)
    return files


def _extract_csvs(archive_path: Path) -> list[Path]:
    """Safely extract only flat constituent CSV members under the raw data directory."""
    destination = RAW / "wqms-csv"
    destination.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    total_size = 0
    seen: set[str] = set()
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".csv"):
                continue
            if info.flag_bits & 0x1:
                raise ValueError(f"Encrypted member is not supported: {info.filename}")
            name = Path(info.filename).name
            if name in {"", ".", ".."} or name in seen:
                raise ValueError(f"Unsafe or duplicate CSV member: {info.filename}")
            seen.add(name)
            total_size += info.file_size
            if info.file_size > 2_000_000_000 or total_size > 80_000_000_000:
                raise ValueError(
                    "The archive's expanded CSV payload exceeds the configured extraction limit"
                )
            target = destination / name
            temporary = target.with_suffix(target.suffix + ".part")
            with archive.open(info) as source, temporary.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            if temporary.stat().st_size != info.file_size:
                temporary.unlink(missing_ok=True)
                raise ValueError(
                    f"Extracted member length did not match its directory record: {name}"
                )
            temporary.replace(target)
            outputs.append(target)
    if not outputs:
        raise ValueError("The official observation archive contains no CSV members")
    return outputs


def status() -> dict[str, object]:
    present = {name: (RAW / name).exists() for name in RELEASE_FILES}
    observations = sorted((RAW / "wqms-csv").glob("*.csv")) if (RAW / "wqms-csv").exists() else []
    prepared = sorted(NORMALIZED.glob("*.parquet")) if NORMALIZED.exists() else []
    return {
        "release": "Caravan-Qual lite v1.1",
        "doi": "10.5281/zenodo.21337532",
        "record": "https://zenodo.org/records/21337532",
        "raw_files": present,
        "observation_files": [path.name for path in observations],
        "prepared_files": [path.name for path in prepared],
        "ready": bool(prepared and (RAW / "wqms_site_info.csv").exists()),
    }


def write_manifest() -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    entries = {}
    for path in sorted(RAW.rglob("*")):
        if path.is_file():
            entries[str(path.relative_to(RAW))] = {
                "bytes": path.stat().st_size,
                "md5": digest(path),
            }
    payload = {
        "dataset": "Caravan-Qual lite",
        "version": "1.1",
        "doi": "10.5281/zenodo.21337532",
        "record": "https://zenodo.org/records/21337532",
        "source_repository": "https://github.com/SustainableWaterSystems/Caravan-Qual",
        "license": (
            "See the per-source license files in Caravan-Qual_licenses.zip "
            "and each source's own terms."
        ),
        "files": entries,
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n")
