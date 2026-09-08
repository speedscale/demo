# 08: Your Mock Is Lying

A fake server can only replay what its author believes. This stage replaces
hand-typed response bodies with sanitized captured fixtures, makes a missing
`status` field fail loudly, and adds opt-in checks against a real carrier.

`fixtures/carrier-shipment-delayed.json` represents the known contract.
`fixtures/carrier-shipment-delayed-v2.json` simulates drift by renaming `status`
to `shipmentStatus`. Every language rejects the drifted response as a contract
error rather than retrying it as an outage.

## Run the offline suites

```bash
cd java && mvn test
cd node && npm ci && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

## Run the live contract checks

The live tests are skipped unless all required settings are supplied:

```bash
export CARRIER_CONTRACT_TEST=1
export CARRIER_URL=https://api.your-carrier.example
export CARRIER_API_KEY=...
export CARRIER_TRACKING_NUMBER=...
```

Then run the normal suite for your language. The live check verifies the field
the client needs and compares the top-level response shape with the captured
fixture. Values may change; missing fixture fields fail the test.
