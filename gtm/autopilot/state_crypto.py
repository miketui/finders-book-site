from __future__ import annotations

import argparse
import hashlib
import hmac
import os
from pathlib import Path


DOMAIN = b"finders-book-gtm-encrypt-then-mac-v2\x00"


def _key_material_from_env(name: str) -> bytes:
    value = os.environ.get(name)
    if value is None or value == "":
        raise SystemExit(f"Required key environment variable is missing: {name}")
    return value.encode("utf-8")


def _mac_key(key_material: bytes) -> bytes:
    return hashlib.sha256(DOMAIN + key_material).digest()


def sign_bytes(payload: bytes, key_material: bytes) -> str:
    return hmac.new(_mac_key(key_material), payload, hashlib.sha256).hexdigest()


def sign_file(path: Path, key_material: bytes) -> str:
    return sign_bytes(path.read_bytes(), key_material)


def verify_file(path: Path, hmac_path: Path, key_material: bytes) -> None:
    expected = hmac_path.read_text().strip().lower()
    actual = sign_file(path, key_material)
    if not expected or not hmac.compare_digest(expected, actual):
        raise SystemExit("Encrypted GTM artifact integrity verification failed.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["sign", "verify"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--hmac", required=True)
    parser.add_argument("--key-env", required=True)
    args = parser.parse_args()

    source = Path(args.input)
    hmac_path = Path(args.hmac)
    key_material = _key_material_from_env(args.key_env)
    if args.mode == "sign":
        hmac_path.write_text(sign_file(source, key_material) + "\n")
    else:
        verify_file(source, hmac_path, key_material)
        print("Encrypted GTM artifact integrity verified.")


if __name__ == "__main__":
    main()
