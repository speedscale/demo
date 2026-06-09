# Local workflow

Pre-requisites:
* Node.js 20+ and npm
* [proxymock](https://docs.speedscale.com/proxymock/getting-started/quickstart-cli/)

## Install and run

```bash
npm install
npm start
```

You should see:

```
node-server listening on port 3000
```

## Test the endpoints

```bash
curl localhost:3000/models | jq '.[0].id'
curl localhost:3000/llm/models | jq '.data[0].id'
curl localhost:3000/nasa | jq .title
curl localhost:3000/events | jq '.[0].type'
```

## Record

```bash
proxymock record --out proxymock/demo -- npm start
```

Then send traffic through the inbound proxy on port 4143:

```bash
curl localhost:4143/models
curl localhost:4143/llm/models
curl localhost:4143/nasa
curl localhost:4143/events
```

Ctrl-C to stop. Recorded traffic lands in `proxymock/demo/`.

## Inspect

```bash
proxymock web --in proxymock/demo
```

## Mock

Run the app against recorded responses — no real API calls:

```bash
proxymock mock --in proxymock/demo -- npm start

curl localhost:3000/models    # from mock
curl localhost:3000/nasa      # from mock
```

## Replay

Turn recordings into a load test:

```bash
npm start &
proxymock replay --in proxymock/demo --test-against http://localhost:3000
```
