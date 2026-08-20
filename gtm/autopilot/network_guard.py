from __future__ import annotations

import ipaddress
import socket
import urllib.parse
import urllib.request
from pathlib import Path

import main as engine

MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024


def _validate_https_public_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise ValueError("Provider media download must use HTTPS.")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Provider media URL has an invalid authority.")
    if parsed.port not in (None, 443):
        raise ValueError("Provider media URL must use the standard HTTPS port.")

    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("Provider media hostname could not be resolved.") from exc
    if not addresses:
        raise ValueError("Provider media hostname resolved to no addresses.")

    for entry in addresses:
        ip = ipaddress.ip_address(entry[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError("Provider media URL resolved to a non-public address.")


def _validate_target(target: Path) -> Path:
    resolved_root = engine.RUNTIME_ROOT.resolve()
    resolved = target.resolve()
    if resolved != resolved_root and resolved_root not in resolved.parents:
        raise ValueError("Provider download target escaped the private GTM runtime root.")
    return resolved


class PublicHttpsRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_https_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def guarded_download_url(url: str, target: Path) -> None:
    """Download provider media only over public HTTPS with a hard byte ceiling."""
    _validate_https_public_url(url)
    target = _validate_target(target)
    target.parent.mkdir(parents=True, exist_ok=True)

    opener = urllib.request.build_opener(PublicHttpsRedirectHandler())
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "finders-book-gtm-autopilot/1.0"},
        method="GET",
    )
    total = 0
    with opener.open(request, timeout=120) as response, target.open("wb") as output:
        final_url = response.geturl()
        _validate_https_public_url(final_url)
        declared = response.headers.get("Content-Length")
        if declared and int(declared) > MAX_DOWNLOAD_BYTES:
            raise ValueError("Provider media download exceeds the hard size ceiling.")
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError("Provider media download exceeded the hard size ceiling.")
            output.write(chunk)


# Patch the engine before the hardened control plane begins a production run.
engine.download_url = guarded_download_url
