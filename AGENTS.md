# Repository Guidelines

## Project Structure & Module Organization
- Language demos live under `java/`, `java-auth/`, `node/`, `go/`, `python/`, `ruby-api/`, `csharp/`, `php/`; infrastructure samples sit in `argo/`, `aws/`, `nginx/`, `xml/`.
- Each service keeps app code in its root or `server/` folder with a local `Makefile`, README, and optional `client/` helpers for Speedscale capture.
- Shared tooling at the repo root (`Makefile`, `VERSION`, common manifests) coordinates builds, versioning, and release automation.

## Build, Test & Development Commands
- Run `make help` from the root to list aggregated build/test targets and confirm the active version.
- Build artifacts via `make build-java`, `make build-java-auth`, `make build-node`, `make build-php`, or the umbrella `make build-all`.
- Java Auth flows: `cd java-auth && make local` (requires MySQL), `make test` (JUnit), `make client` (token smoke test). Java server mirrors this with `cd java && make local` or `make compose`.
- Go, Node, Python, and PHP demos run with `go run main.go`, `npm install && npm start`, `python app.py`, and `composer install && php -S localhost:8080 index.php` after installing language dependencies.

## Coding Style & Testing Guidelines
- Go code must remain `gofmt`/`goimports` clean; house tests in `*_test.go` files and run `go test ./...`.
- Java sources live in `server/src/main/java` with 4-space indentation and CamelCase classes; tests belong in `server/src/test/java` and run through `make test-java*`.
- Node services use ES modules, 2-space indentation, and minimal semicolons; add or update Jest smoke tests in `npm test`.
- Python, Ruby, and PHP demos stick to snake_case files and language-standard linting; add pytest, RSpec, or PHPUnit checks near the modified code.
- Reuse bundled clients (`java-auth/client`, `java/client`, `ruby-api/client`) to capture Speedscale traffic and store fixtures alongside the code they validate.

## Commit, PR & Versioning Workflow
- Write imperative commit subjects with ticket references when available (`Standardize all Docker image tags to use v prefix (#87)`). Keep PRs scoped to one service, summarizing behavior changes and the local build/test commands you executed.
- **Version management is Makefile-driven.** Never edit `VERSION`, manifests, `pom.xml`, or `package.json` by hand. Instead run:
  - `make bump-version` for the next patch (automatically increments from 1.2.1 → 1.2.2).
  - `make update-version VERSION=x.y.z` for a planned release (e.g., `make update-version VERSION=2.0.0`).
  - `make validate-version` to ensure manifests, Maven, and Node packages align with the VERSION file.
- After version changes, commit every touched file (including the VERSION file and all generated manifests) and mention the command sequence in the PR description (e.g., "Ran `make bump-version` to update to v1.2.2"). Finalize releases with `make release VERSION=x.y.z`, then push the branch and the annotated `vVERSION` tag once checks pass.
- **Important:** Always use `make bump-version` or `make update-version` from the repository root. These commands update VERSION, Kubernetes manifests (including `scenarios/microservices/k8s/gateway.yaml`), Maven pom.xml files, and Node package.json files (including `scenarios/microservices/gateway/package.json`) in a single operation to maintain consistency across the entire demo repository.
