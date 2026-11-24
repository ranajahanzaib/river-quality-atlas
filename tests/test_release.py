from __future__ import annotations

import hashlib
from io import BytesIO

from river_quality_atlas.ingestion import release


class RangeResponse(BytesIO):
    status = 206

    def __init__(self, body: bytes, start: int, total: int):
        super().__init__(body)
        self.headers = {"Content-Range": f"bytes {start}-{start + len(body) - 1}/{total}"}

    def __enter__(self) -> RangeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def geturl(self) -> str:
        return "https://zenodo.org/asset"


def test_asset_download_resumes_into_bounded_ranges_and_verifies_checksum(
    tmp_path, monkeypatch
) -> None:
    content = b"official-release-asset"
    name = "test_asset.csv"
    partial = tmp_path / f"{name}.part"
    partial.write_bytes(content[:7])
    release_file = release.ReleaseFile(name, len(content), hashlib.md5(content).hexdigest())
    monkeypatch.setattr(release, "RAW", tmp_path)
    monkeypatch.setattr(release, "DOWNLOAD_CHUNK_BYTES", 5)
    monkeypatch.setitem(release.RELEASE_FILES, name, release_file)
    requested: list[tuple[int, int]] = []

    def fake_urlopen(request, timeout):
        assert timeout == 60
        byte_range = request.headers["Range"].removeprefix("bytes=")
        start, end = (int(part) for part in byte_range.split("-"))
        requested.append((start, end))
        return RangeResponse(content[start : end + 1], start, len(content))

    monkeypatch.setattr(release.urllib.request, "urlopen", fake_urlopen)

    result = release._download(name, max_bytes=1000)

    assert result.read_bytes() == content
    assert not partial.exists()
    assert requested == [(7, 11), (12, 16), (17, 21)]


def test_verified_existing_asset_is_reused_without_network(tmp_path, monkeypatch) -> None:
    content = b"already-verified"
    name = "test_asset.csv"
    (tmp_path / name).write_bytes(content)
    monkeypatch.setattr(release, "RAW", tmp_path)
    monkeypatch.setitem(
        release.RELEASE_FILES,
        name,
        release.ReleaseFile(name, len(content), hashlib.md5(content).hexdigest()),
    )
    monkeypatch.setattr(
        release.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected network call")),
    )

    assert release._download(name, max_bytes=1000) == tmp_path / name


def test_asset_download_starts_from_scratch_without_partial_file(tmp_path, monkeypatch) -> None:
    content = b"fresh-release-asset"
    name = "fresh_asset.csv"
    release_file = release.ReleaseFile(name, len(content), hashlib.md5(content).hexdigest())
    monkeypatch.setattr(release, "RAW", tmp_path)
    monkeypatch.setattr(release, "DOWNLOAD_CHUNK_BYTES", 10)
    monkeypatch.setitem(release.RELEASE_FILES, name, release_file)
    requested: list[tuple[int, int]] = []

    def fake_urlopen(request, timeout):
        assert timeout == 60
        byte_range = request.headers["Range"].removeprefix("bytes=")
        start, end = (int(part) for part in byte_range.split("-"))
        requested.append((start, end))
        return RangeResponse(content[start : end + 1], start, len(content))

    monkeypatch.setattr(release.urllib.request, "urlopen", fake_urlopen)

    result = release._download(name, max_bytes=1000)

    assert result.read_bytes() == content
    assert not (tmp_path / f"{name}.part").exists()
    assert requested == [(0, 9), (10, 18)]

