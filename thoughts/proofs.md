## External drivers start only after Speedscale mocks are ready and replay cleanup always runs
- **Level**: Integration
- **Evidence**: `thoughts/scripts/verify-replay-sandwich.sh` passed lifecycle ordering, wait failure, driver failure, and cleanup cases
- **Status**: PROVEN
- **Date**: 2026-07-22

## k6 and Postman Collection v3 exercise the same SUT contract
- **Level**: Integration
- **Evidence**: `thoughts/scripts/verify-replay-sandwich.sh` passed with k6 v2.0.0 and Postman CLI v1.44.0; Postman lint reported 0 errors and 0 warnings
- **Status**: PROVEN
- **Date**: 2026-07-22

## The replay sandwich works in Kubernetes with Speedscale responders
- **Level**: Deployment
- **Evidence**: A responder-only replay in minikube provisioned the real Speedscale responder, collector, and Redis. k6 passed 4/4 checks in 79 ms and Postman CLI v1.44.0 passed 2 requests and 4/4 assertions in 188 ms while the responder was active. The v2.5.778 operator did not publish the `MocksReady` condition required by the v2.5.789 CLI, confirming the documented minimum applies to the cluster installation as well as `speedctl`.
- **Status**: PROVEN
- **Date**: 2026-07-22
