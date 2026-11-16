.PHONY: help build record replay regression chaos load explain clean

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

build: ## Build the API and partner simulator
	dotnet build -c Release

record: ## Record fresh traffic into proxymock/recording-<timestamp> (needs redis-server)
	demo/record.sh

replay: ## Mock partners and Redis, replay the committed recording, print the score
	demo/mock-and-replay.sh

regression: ## Apply the pricing bug, replay, explain the diff, then restore Pricing.cs
	patch -p1 --forward < demo/regression.patch
	-demo/mock-and-replay.sh
	demo/explain.sh
	patch -p1 -R < demo/regression.patch

chaos: ## Replay with the payment gateway returning 503 (MODE=outage|slow|garbage)
	-demo/chaos.sh $(or $(MODE),outage)
	demo/explain.sh

load: ## 10 virtual users for 30s against the mocked API
	demo/load.sh

explain: ## Field-level diff of the latest replay
	demo/explain.sh

clean: ## Remove results and build output
	rm -rf proxymock/results .demo-run src/*/bin src/*/obj
