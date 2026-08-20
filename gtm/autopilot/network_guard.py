from __future__ import annotations

import http.client
import ipaddress
import os
import socket
import ssl
import urllib.parse
from pathlib import Path

import main as engine

MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024
MAX_REDIRECTS = 5


def _public_addresses(hostname: str, port: int = 443) -> list[str]:
    try:
        entries = socket.getaddrinfo(
            hostname, port, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise ValueError(
            "Provider media hostname could not be resolved."
        ) from exc

    addresses: list[str] = []
    for entry in entries:
        text = entry[4][0]
        ip = ipaddress.ip_address(text)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError(
                "Provider media URL resolved to a non-public address."
            )
        if text not in addresses:
            addresses.append(text)
    if not addresses:
        raise ValueError(
            "Provider media hostname resolved to no public addresses."
        )
    return addresses


def _validate_https_public_url(
    url: str,
) -> tuple[urllib.parse.SplitResult, list[str]]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise ValueError("Provider media download must use HTTPS.")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Provider media URL has an invalid authority.")
    if parsed.port not in (None, 443):
        raise ValueError(
            "Provider media URL must use the standard HTTPS port."
        )
    addresses = _public_addresses(parsed.hostname, 443)
    return parsed, addresses


def _validate_target(target: Path) -> Path:
    resolved_root = engine.RUNTIME_ROOT.resolve()
    resolved = target.resolve()
    if (
        resolved != resolved_root
        and resolved_root not in resolved.parents
    ):
        raise ValueError(
            "Provider download target escaped the private GTM runtime root."
        )
    return resolved


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """TLS to a prevalidated IP while verifying the original hostname."""

    def __init__(
        self,
        hostname: str,
        validated_ip: str,
        *,
        timeout: int = 120,
    ) -> None:
        context = ssl.create_default_context()
        super().__init__(
            hostname,
            port=443,
            timeout=timeout,
            context=context,
        )
        self._validated_ip = validated_ip

    def connect(self) -> None:
        raw = socket.create_connection(
            (self._validated_ip, self.port),
            self.timeout,
            self.source_address,
        )
        if self._tunnel_host:
            raw.close()
            raise ValueError(
                "HTTP CONNECT tunnels are not permitted for provider media."
            )
        self.sock = self._context.wrap_socket(
            raw,
            server_hostname=self.host,
        )


def _request_path(parsed: urllib.parse.SplitResult) -> str:
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    return path


def _host_header(parsed: urllib.parse.SplitResult) -> str:
    hostname = parsed.hostname or ""
    if ":" in hostname and not hostname.startswith("["):
        return f"[{hostname}]"
    return hostname


def _open_pinned(
    parsed: urllib.parse.SplitResult,
    addresses: list[str],
    headers: dict[str, str],
) -> tuple[PinnedHTTPSConnection, http.client.HTTPResponse]:
    last_error: BaseException | None = None
    for address in addresses:
        connection = PinnedHTTPSConnection(
            parsed.hostname or "",
            address,
            timeout=120,
        )
        try:
            request_headers = {
                "User-Agent": "finders-book-gtm-autopilot/1.0",
                "Host": _host_header(parsed),
                **headers,
            }
            connection.request(
                "GET",
                _request_path(parsed),
                headers=request_headers,
            )
            response = connection.getresponse()
            return connection, response
        except Exception as exc:
            last_error = exc
            connection.close()
    raise ValueError(
        "Unable to connect to any prevalidated provider address."
    ) from last_error


def guarded_download_url(
    url: str,
    target: Path,
    *,
    headers: dict[str, str] | None = None,
    max_bytes: int = MAX_DOWNLOAD_BYTES,
) -> None:
    """Download by pinned public IP, preserving TLS hostname verification."""
    if max_bytes <= 0 or max_bytes > MAX_DOWNLOAD_BYTES:
        raise ValueError("Invalid provider media size ceiling.")

    target = _validate_target(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".download")
    partial.unlink(missing_ok=True)

    current_url = url
    safe_headers = dict(headers or {})
    total = 0

    try:
        for redirect_count in range(MAX_REDIRECTS + 1):
            parsed, addresses = _validate_https_public_url(current_url)
            connection, response = _open_pinned(
                parsed, addresses, safe_headers
            )
            try:
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.getheader("Location")
                    if not location:
                        raise ValueError(
                            "Provider redirect omitted Location."
                        )
                    if redirect_count >= MAX_REDIRECTS:
                        raise ValueError(
                            "Provider media exceeded redirect ceiling."
                        )
                    next_url = urllib.parse.urljoin(
                        current_url, location
                    )
                    _validate_https_public_url(next_url)
                    current_url = next_url
                    continue

                if response.status < 200 or response.status >= 300:
                    raise ValueError(
                        f"Provider media returned HTTP {response.status}."
                    )

                declared = response.getheader("Content-Length")
                if declared:
                    try:
                        declared_size = int(declared)
                    except ValueError as exc:
                        raise ValueError(
                            "Provider media returned invalid Content-Length."
                        ) from exc
                    if declared_size > max_bytes:
                        raise ValueError(
                            "Provider media download exceeds the hard size ceiling."
                        )

                with partial.open("wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > max_bytes:
                            raise ValueError(
                                "Provider media download exceeded the hard size ceiling."
                            )
                        output.write(chunk)
                os.replace(partial, target)
                return
            finally:
                connection.close()
        raise ValueError("Provider media redirect loop did not terminate.")
    except Exception:
        partial.unlink(missing_ok=True)
        raise


engine.download_url = guarded_download_url
