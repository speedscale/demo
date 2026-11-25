.PHONY: demo test-build clean

demo: ## Replay the recording and run the property test on the current and changed builds
	./run-demo.sh

test-build: ## Compile the property tests without running them
	cargo test --manifest-path property-tests/Cargo.toml --no-run

clean: ## Remove builds, logs and run output
	rm -rf .build logs property-tests/target proxymock/results proxymock/regressions-ephyra
