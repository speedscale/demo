# CI builds

The CI/CD Pipeline selects service jobs from the event's changed files. Pull requests compare their base commit with the checked-out merge commit; pushes compare the previous commit with the checked-out commit. Renames select both the old and new service paths. Changes to VERSION, the root Makefile, CI scripts, local actions, or the CI workflow select every service. Unavailable base history also selects every service.

The service catalog in `scripts/ci_plan.py` preserves the pipeline's existing unit, integration, load, host-build, and image coverage. Adding a demo requires adding its coverage to that catalog. Documentation-only changes run validation and the CI Summary without allocating service runners. CI Summary fails if any selected job fails, is cancelled, or is unexpectedly skipped.

Pull requests build both linux/amd64 and linux/arm64 images without publishing or loading registry credentials. Pushes to master publish the selected images with the same contexts and version tags as the local Makefile targets, including the existing C# latest tags. VERSION changes publish all images. Local Makefile targets remain available independently of CI.

Each image has its own GitHub Actions cache scope. Intermediate layers are exported so dependency layers survive between runs. Cache exports have a two-minute timeout and do not fail a successful build. Four image jobs run concurrently at most. Superseded PR runs are cancelled; master pushes each keep their own run so selected publications are not dropped.

`scripts/ci_build_image.py` retries recognizable HTTP 429/502/503/504 and transient connection failures at most twice, waiting 15 and 30 seconds. Compilation, test, authentication, and missing-package errors fail immediately. The image job has a 45-minute timeout. A persistent network failure still fails CI with its original build output.

Run the selection and retry tests with `python3 -m unittest discover -s scripts -p 'test_ci_*.py'`. Run a local image validation from the repository root with `python3 scripts/ci_build_image.py java`; this builds both platforms without publishing. The `--cache` option requires the GitHub Actions runtime, and `--push` publishes to the demo registry.
