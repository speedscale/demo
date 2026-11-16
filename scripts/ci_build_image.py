"""Build the same multi-platform images for PR validation and publication."""

import argparse
from collections import deque
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from ci_plan import IMAGES


TRANSIENT = re.compile(
    r"(?:status(?: code)?|HTTP(?:/\S+)?|response(?: status)?)[ :=]+(?:429|502|503|504)\b"
    r"|too many requests|(?:connection|read|connect|TLS handshake|i/o) timed? ?out"
    r"|connection reset by peer|temporary failure in name resolution"
    r"|unexpected status.*\b(?:429|502|503|504)\b",
    re.IGNORECASE,
)
PERMANENT = re.compile(
    r"COMPILATION ERROR|Compilation failure|test failures|Tests run:.*Failures: [1-9]"
    r"|401 Unauthorized|403 Forbidden|404 Not Found|manifest unknown|No matching distribution found",
    re.IGNORECASE,
)


def build_command(name, push=False, cache=False):
    _, context, image, latest = next(item for item in IMAGES if item[0] == name)
    version = Path("VERSION").read_text().strip()
    command = [
        "docker", "buildx", "build", "--progress=plain", "--pull",
        "--platform", "linux/amd64,linux/arm64",
        "--tag", f"gcr.io/speedscale-demos/{image}:v{version}",
    ]
    if latest:
        command += ["--tag", f"gcr.io/speedscale-demos/{image}:latest"]
    if push:
        command += ["--push"]
    else:
        command += ["--output=type=cacheonly"]
    if cache:
        scope = f"type=gha,version=2,scope=ci-{name},timeout=2m"
        token = os.environ.get("GITHUB_TOKEN")
        repository = os.environ.get("GITHUB_REPOSITORY")
        if token and repository:
            scope += f",ghtoken={token},repository={repository}"
        command += ["--cache-from", scope, "--cache-to", scope + ",mode=max,ignore-error=true"]
    return command + [context]


def run_build(command, attempts=3):
    for attempt in range(1, attempts + 1):
        lines = deque(maxlen=40)
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as process:
            for line in process.stdout:
                print(line, end="", flush=True)
                lines.append(line)
            status = process.wait()
        if status == 0:
            return 0
        # BuildKit repeats the failing command's output in its final error block.
        failure = "".join(lines)
        if attempt == attempts or PERMANENT.search(failure) or not TRANSIENT.search(failure):
            return status
        delay = 15 * 2 ** (attempt - 1)
        print(f"::warning::Transient image build failure; retry {attempt}/{attempts - 1} in {delay}s.", flush=True)
        time.sleep(delay)
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", choices=[item[0] for item in IMAGES])
    parser.add_argument("--push", action="store_true")
    parser.add_argument("--cache", action="store_true", help="Use the GitHub Actions layer cache")
    args = parser.parse_args()
    return run_build(build_command(args.name, push=args.push, cache=args.cache))


if __name__ == "__main__":
    sys.exit(main())
