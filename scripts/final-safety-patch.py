from pathlib import Path

hardening_path = Path('gtm/autopilot/final_hardening.py')
hardening = hardening_path.read_text()
replacements = [
    ('_REJECTED_ARTIFACT_PATHS: list[str] = []\n', '_REJECTED_ARTIFACT_PATHS: list[str] = []\n_WRITTEN_ARTIFACT_PATHS: set[str] = set()\n'),
    ('    global _REJECTED_ARTIFACT_PATHS\n    allowed = _allowed_artifact_paths(_ACTIVE_UNIT)\n', '    global _REJECTED_ARTIFACT_PATHS, _WRITTEN_ARTIFACT_PATHS\n    allowed = _allowed_artifact_paths(_ACTIVE_UNIT)\n'),
    ('    return _RAW_WRITE_ARTIFACT_DOCUMENTS(accepted)\n\n\nasync def hardened_execute_unit(unit: dict) -> dict:\n    global _ACTIVE_UNIT, _REJECTED_ARTIFACT_PATHS\n    _ACTIVE_UNIT = copy.deepcopy(unit)\n    _REJECTED_ARTIFACT_PATHS = []\n', '    written = _RAW_WRITE_ARTIFACT_DOCUMENTS(accepted)\n    _WRITTEN_ARTIFACT_PATHS.update(written)\n    return written\n\n\nasync def hardened_execute_unit(unit: dict) -> dict:\n    global _ACTIVE_UNIT, _REJECTED_ARTIFACT_PATHS, _WRITTEN_ARTIFACT_PATHS\n    _ACTIVE_UNIT = copy.deepcopy(unit)\n    _REJECTED_ARTIFACT_PATHS = []\n    _WRITTEN_ARTIFACT_PATHS = set()\n'),
    ('        one = output.model_copy(deep=True)\n        one_job = one.creative_jobs[0]\n        one_job.reference_image = reference_path\n', '        one = output.model_copy(deep=True)\n        one.creative_jobs = [job]\n        one_job = one.creative_jobs[0]\n        one_job.reference_image = reference_path\n'),
    ('    ):\n        if _REJECTED_ARTIFACT_PATHS:\n', '    ):\n        if unit.get("kind") in {"section", "day", "continuous"}:\n            required_now = set(unit.get("required_outputs", []))\n            missing_current = sorted(required_now - _WRITTEN_ARTIFACT_PATHS)\n            if missing_current:\n                output.blockers.append("Required outputs not written by current run: " + ", ".join(missing_current))\n                output.pass_condition_met = False\n                output.run_status = "BLOCKED"\n                required_ok = False\n        if _REJECTED_ARTIFACT_PATHS:\n'),
]
for old, new in replacements:
    if hardening.count(old) != 1:
        raise SystemExit(f'hardening replacement count={hardening.count(old)} for {old[:80]!r}')
    hardening = hardening.replace(old, new, 1)
hardening_path.write_text(hardening)

network_path = Path('gtm/autopilot/network_guard.py')
network = network_path.read_text()
old = '''                    next_url = urllib.parse.urljoin(\n                        current_url, location\n                    )\n                    _validate_https_public_url(next_url)\n                    current_url = next_url\n                    continue\n'''
new = '''                    next_url = urllib.parse.urljoin(\n                        current_url, location\n                    )\n                    next_parsed, _ = _validate_https_public_url(next_url)\n                    current_origin = (parsed.scheme.lower(), (parsed.hostname or "").lower(), parsed.port or 443)\n                    next_origin = (next_parsed.scheme.lower(), (next_parsed.hostname or "").lower(), next_parsed.port or 443)\n                    if next_origin != current_origin:\n                        safe_headers = {key: value for key, value in safe_headers.items() if key.lower() != "authorization"}\n                    current_url = next_url\n                    continue\n'''
if network.count(old) != 1:
    raise SystemExit(f'network redirect replacement count={network.count(old)}')
network_path.write_text(network.replace(old, new, 1))

validation_path = Path('.github/workflows/gtm-final-hardening.yml')
validation = validation_path.read_text()
marker = "          assert 'sha256_verified' in hardening\n"
addition = marker + "          assert hardening.count('one.creative_jobs = [job]') >= 2\n          assert '_WRITTEN_ARTIFACT_PATHS' in hardening\n          assert 'Required outputs not written by current run' in hardening\n"
if validation.count(marker) != 1:
    raise SystemExit('hardening test marker missing')
validation = validation.replace(marker, addition, 1)
marker = "          assert 'MAX_DOWNLOAD_BYTES' in network\n"
addition = marker + "          assert 'next_origin != current_origin' in network\n          assert 'key.lower() != \"authorization\"' in network\n"
if validation.count(marker) != 1:
    raise SystemExit('network test marker missing')
validation_path.write_text(validation.replace(marker, addition, 1))

compile(hardening_path.read_text(), str(hardening_path), 'exec')
compile(network_path.read_text(), str(network_path), 'exec')
print('Final safety patch applied successfully.')
