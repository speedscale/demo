#!/usr/bin/env python3
"""Emit a small, credential-free audit result for the scheduled-run watcher."""

import json
import os
import re
from pathlib import Path

ADVISORY = re.compile(r"\b(?:CVE-\d{4}-\d{4,}|GO-\d{4}-\d+|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b", re.I)
EXECUTION_ERROR = re.compile(r"NIGHTLY_EXECUTION_ERROR|command not found|failed to download|connection refused|could not fetch|no matching distribution found|Traceback \(most recent call last\)", re.I)


def summarize(outcome, component, text):
    failed = outcome != "success"
    advisories = sorted(set(ADVISORY.findall(text)))
    package_findings = bool(re.search(r"^\s*>\s+\S+.*\b(?:Critical|High|Moderate|Low)\b", text, re.M | re.I))
    error = failed and (bool(EXECUTION_ERROR.search(text)) or not (advisories or package_findings))
    return {"component": component, "failed": failed, "error": error, "advisories": advisories,
            "severity": sorted({s.upper() for s in re.findall(r"\b(?:CRITICAL|HIGH|MODERATE|MEDIUM|LOW)\b", text, re.I)}) if failed else []}


if __name__ == "__main__":
    log = Path("nightly-audit.log")
    result = summarize(os.environ["AUDIT_OUTCOME"], os.environ["AUDIT_COMPONENT"], log.read_text(errors="replace") if log.exists() else "")
    Path("nightly-result.json").write_text(json.dumps(result, sort_keys=True) + "\n")
    print("NIGHTLY_RESULT_JSON=" + json.dumps(result, sort_keys=True))
