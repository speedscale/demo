# Speedscale Demos

This repo contains different self contained demo apps in each subdirectory.

## Version Management

This repository uses centralized version management through a root-level `VERSION` file and Makefile. All projects (Java, Java-Auth, Node) inherit their version from this central source.

### Available Commands

```bash
# Show current version
make version

# Update to a specific version (updates all manifests, pom.xml, package.json)
make update-version VERSION=1.2.3

# Automatically bump to next patch version
make bump-version

# Validate that all files use consistent versions
make validate-version

# Create a new release with git tag
make release VERSION=1.2.3
```

### What Gets Updated

When you update the version, the following files are automatically synchronized:

- **Kubernetes Manifests**: All Docker image tags in `**/manifest.yaml` and `k8s/**/*.yaml`
- **Maven Projects**: Project versions in `pom.xml` files (preserves dependency versions)
- **Node.js**: Version in `package.json`
- **Documentation**: Version references in markdown files
- **CI/CD**: GitHub Actions uses the centralized version for Docker builds

### Example Workflow

```bash
# Check current state
make validate-version

# Bump to next version (e.g., 1.0.9 → 1.0.10)
make bump-version

# Or set specific version
make update-version VERSION=2.0.0

# Create release
make release VERSION=2.0.0
```

### Manual Version File

You can also manually edit the `VERSION` file and run `make update-version VERSION=$(cat VERSION)` to sync all files.

## Project Structure and Makefiles

Each project directory contains its own `Makefile` for local development convenience:

- **`java/Makefile`** - Java service development commands
- **`java-auth/Makefile`** - Java Auth service development commands  
- **`node/Makefile`** - Node service development commands

### Root vs Project Makefiles

The **root Makefile** provides centralized commands that delegate to project Makefiles:

```bash
# Root commands (work from repository root)
make docker-java-auth      # Builds java-auth Docker images
make build-java-auth       # Builds java-auth application  
make test-java-auth        # Runs java-auth tests

# Project commands (work from project directory)
cd java-auth
make local                 # Run service locally
make compose              # Run with Docker Compose
make client               # Run test client
make kube                 # Deploy to Kubernetes
```

### Quick Start Pattern

For development, you can work directly in project directories:

```bash
cd java-auth
make help                 # See all available commands
make local               # Start the service locally
make client             # Test with client
```

Or use root commands for CI/automation:

```bash
make build-java-auth     # Build from root
make docker-java-auth    # Build and push images from root
```
