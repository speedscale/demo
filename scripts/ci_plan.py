"""Select existing CI coverage from the files changed by a push or pull request."""

import json
import os
from pathlib import Path
import subprocess


UNIT_TESTS = [
    ("java", "java/server", "java", "mvn test"),
    ("java-auth-server", "java-auth/server", "java", "mvn test"),
    ("java-auth-client", "java-auth/client", "java", "mvn test"),
    ("ruby-api", "ruby-api", "ruby", "./test-unit.sh"),
    ("csharp", "csharp", "dotnet", "dotnet test"),
    ("llm-simulation-tools", "llm-simulation-demo/tools-service", "python", "make test"),
    ("llm-simulation-backend", "llm-simulation-demo/backend", "python", "make test"),
    ("llm-simulation-frontend", "llm-simulation-demo/frontend", "node", "make test"),
]

BUILDS = [
    ("java", "java", "make build"),
    ("java-auth", "java-auth", "make build"),
    ("node", "node", "make build"),
    ("smart-replace-demo", "smart-replace-demo", "make build"),
    ("ruby-api", "ruby-api", "make build"),
    ("ruby-client", "ruby-api", "make build-client"),
    ("csharp", "csharp", "make build"),
    ("llm-simulation-frontend", "llm-simulation-demo/frontend", "make build"),
    ("go-mysql", "go-mysql", "make build test"),
    ("go-postgres", "go-postgres", "make build test"),
]

# Contexts and tags match the services' local Docker Makefile targets.
IMAGES = [
    ("java", "java", "java-server", False),
    ("node", "node", "node-server", False),
    ("java-auth", "java-auth/server", "java-auth", False),
    ("java-auth-client", "java-auth/client", "java-auth-client", False),
    ("smart-replace-demo", "smart-replace-demo", "smart-replace-demo", False),
    ("ruby-api", "ruby-api", "ruby-api", False),
    ("ruby-client", "ruby-api/client", "ruby-client", False),
    ("csharp", "csharp", "csharp-weather", True),
    ("csharp-client", "csharp/client", "csharp-client", True),
    ("php", "php", "php-server", False),
    ("gateway", "scenarios/microservices/gateway", "scenarios-gateway", False),
    ("llm-simulation-tools", "llm-simulation-demo/tools-service", "llm-simulation-tools", False),
    ("llm-simulation-backend", "llm-simulation-demo/backend", "llm-simulation-backend", False),
    ("llm-simulation-frontend", "llm-simulation-demo/frontend", "llm-simulation-frontend", False),
]


def watch_path(path):
    if path.startswith("llm-simulation-demo/") or path.startswith("scenarios/"):
        return path
    return path.split("/")[0]


def select_jobs(files):
    # Missing history and shared build changes must not silently drop coverage.
    all_services = files is None or any(
        path in {"Makefile", "VERSION", ".dockerignore", ".github/workflows/ci.yaml"}
        or path.startswith(("scripts/", ".github/actions/"))
        for path in files
    )

    def affected(path):
        prefix = watch_path(path)
        return all_services or any(file == prefix or file.startswith(prefix + "/") for file in files)

    units = [dict(zip(("name", "path", "setup", "test_cmd"), item)) for item in UNIT_TESTS if affected(item[1])]
    builds = [dict(zip(("name", "path", "build_cmd"), item)) for item in BUILDS if affected(item[1])]
    images = [{"name": item[0]} for item in IMAGES if affected(item[1])]
    ruby = [{"name": "ruby-api", "path": "ruby-api", "setup": "ruby"}] if affected("ruby-api") else []
    return {"unit": units, "integration": ruby, "load": ruby, "build": builds, "docker": images}


def changed_files(event, event_name):
    if event_name == "pull_request":
        base = event["pull_request"]["base"]["sha"]
    elif event_name == "push":
        base = event.get("before", "")
    else:
        return None
    if not base or set(base) == {"0"}:
        return None
    try:
        # Disabling rename detection includes both old and new service paths.
        output = subprocess.check_output([
            "git", "diff", "--name-only", "--no-renames", "-z", base, "HEAD", "--",
        ])
        return output.decode().rstrip("\0").split("\0") if output else []
    except subprocess.CalledProcessError:
        print("::warning::Cannot compare event base; selecting every service.")
        return None


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    plan = select_jobs(changed_files(event, os.environ["GITHUB_EVENT_NAME"]))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for name, jobs in plan.items():
            output.write(f"{name}={json.dumps(jobs, separators=(',', ':'))}\n")
            print(f"{name}: {', '.join(job['name'] for job in jobs) or 'no affected services'}")


if __name__ == "__main__":
    main()
