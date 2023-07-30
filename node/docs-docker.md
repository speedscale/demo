# Docker Workflow

Pre-requisites:
* This was tested with `docker` engine 20.10.x

## Install and Run the App

First you need to build the docker image:

```
docker build . -t demo-node:latest
```

Then you can run it using `docker compose`. Make sure you use `docker compose` NOT `docker-compose` which is legacy and no longer supported. There is an example file which will start the listener on port 3000.

```
docker compose up
```

If the output looks like this then it's working:

```
demo-node-demo-node-1  | > demo-node@1.0.0 start
demo-node-demo-node-1  | > node index.js
demo-node-demo-node-1  |
demo-node-demo-node-1  | demo-node listening on port 3000
```

## Send Test Transactions

This will send calls port 3000 which is the default. These commands are expected to succeed, if they fail your environment may be misconfigured.

```
export PORT=3000
curl http://localhost:$PORT/
curl http://localhost:$PORT/nasa
curl http://localhost:$PORT/events
curl http://localhost:$PORT/bin
```

## Capture 

You need a Speedscale account and `speedctl` installed.  If you already installed, make sure you are running the latest version:

```
speedctl update
```

And you will need certificates on your machine, so make sure they are created with this command:

```
speedctl create certs -o ~/.speedscale/certs
```

You now need to run `speedctl install` which has a wizard that will take you through a series of questions:

```
                         _               _
 ___ _ __   ___  ___  __| |___  ___ __ _| | ___
/ __| '_ \ / _ \/ _ \/ _` / __|/ __/ _` | |/ _ \
\__ \ |_) |  __/  __/ (_| \__ \ (_| (_| | |  __/
|___/ .__/ \___|\___|\__,_|___/\___\__,_|_|\___|
    |_|

This wizard will walk through adding your service to Speedscale. When we're done, requests going into
and out of your service will be sent to Speedscale.

Let's get started!

Choose one:
 [1] Kubernetes
 [2] Docker
 [3] Traditional server / VM
 [4] Other / I don't know
 [q] Quit
▸ What kind of infrastructure is your service running on? [q]: 2

We will create Docker Compose files you can use to record traffic from, and replay against, your service.
Choose one:
 [1] Capture traffic and forward to Speedscale Cloud
 [2] Create a Speedscale Responder to mimic an external endpoint locally
 [3] Replay recorded traffic from a Snapshot against my service locally
 [q] Quit
▸ What would you like to do? [q]: 1

▸ What is the name of your service? [MY_SERVICE]: demo-node

▸ What port does your service listen on locally? [8080]: 3000
```

This will create a file `speedscale-docker-capture.yaml` which runs the capture components in a set of docker containers so you can capture traffic anywhere that you can run docker. You need to configure your application to talk to the Speedscale containers. There is an example docker compose file `compose-speedscale.yaml` with the correct settings. Feel free to open the file you will see some additional environment variables have been configured as described in the [Speedscale Proxy Docs](https://docs.speedscale.com/setup/sidecar/proxy-modes/#configuring-your-application-proxy-server). You want to merge the `speedscale-docker-capture.yaml` with the example `compose-speedscale.yaml` into a single file, you can do this with a utility called [`yq`](https://mikefarah.gitbook.io/yq/operators/multiply-merge) (can install with `brew install yq`):

```
yq '. *= load("speedscale-docker-capture.yaml")' compose-speedscale.yaml > compose-capture-merged.yaml
```

The resulting file should look like this with 3 sections for `demo-node` along with `forwarder` and `goproxy` which are the Speedscale containers.

```
services:
  demo-node:
    environment:
      - GLOBAL_AGENT_HTTP_PROXY=http://host.docker.internal:4140
      - GLOBAL_AGENT_HTTPS_PROXY=http://host.docker.internal:4140
      - export GLOBAL_AGENT_NO_PROXY=*127.0.0.1:12557
      - NODE_EXTRA_CA_CERTS=/etc/ssl/speedscale/tls.crt
    image: demo-node:latest
    ports:
      - 3000:3000
    volumes:
      - ${HOME}/.speedscale/certs:/etc/ssl/speedscale
  forwarder
    ...
  goproxy
    ...
```

Now run this with:

```
docker compose --file compose-capture-merged.yaml up
```

Next you're going to send the same test transactions, but the inbound port has changed to `4143`:

```
export PORT=4143
curl http://localhost:$PORT/
curl http://localhost:$PORT/nasa
curl http://localhost:$PORT/events
curl http://localhost:$PORT/bin
```

As this is running you should get proper responses from the application, and you should also see the data in Speedscale traffic viewer.

## Replay 

The first step to replay is to [create a snapshot](https://docs.speedscale.com/guides/creating-a-snapshot/). You should see the data like this in your traffic viewer:

![traffic-viewer](img/spd-traffic-viewer.png)

The next step is to `Save Tests/Mocks` and follow the workflow using all the default values. The result should be a snapshot that looks like so:

![snapshot](img/spd-snapshot.png)

Now you are going to replay that snapshot on your own machine using `docker`. You can use the `speedctl install` command to generate the compose file. You are going to pick the following options:

```
[2] Docker
[3] Replay recorded traffic from a Snapshot against my service locally
Choose your service: `demo-node`
Choose your test config: `standard`
Which snapshot ID should be used? (the one you created earlier)
What port does your service listen on locally? [8080]: 3000
Should a Speedscale Responder be created to mimic external endpoints locally? [Y/n]: Y
```

This will create `speedscale-docker-replay.yaml` which runs the replay components in a set of docker containers so you can replay traffic anywhere that you can run docker. You need to configure your application to talk to the Speedscale containers. There is an example docker compose file `compose-speedscale.yaml` with the correct settings. Feel free to open the file you will see some additional environment variables have been configured as described in the [Speedscale Proxy Docs](https://docs.speedscale.com/setup/sidecar/proxy-modes/#configuring-your-application-proxy-server). You want to merge the `speedscale-docker-replay.yaml` with the example `compose-speedscale.yaml` into a single file, you can do this with a utility called [`yq`](https://mikefarah.gitbook.io/yq/operators/multiply-merge) (can install with `brew install yq`):

```
yq '. *= load("speedscale-docker-replay.yaml")' compose-speedscale.yaml > compose-replay-merged.yaml
```

The resulting file should look like this with 3 sections for `demo-node` along with `generator`, `goproxy`, `redis` and `responder` which are the Speedscale containers. You can run it like this:

```
docker compose --file compose-replay-merged.yaml up
```

When you see the log message `demo-node-generator-1 exited with code 0` then the generator has completed, and you can turn down all the conatiners. Now you should see a Report in the [Speedscale Reports](https://app.speedscale.com/reports) list. It should have an 87.5% success rate like this.

![Speedscale Report](img/spd-report-summary.png)

The reason for the lower success rate is because the `/` endpoint includes a timestamp, and all the values in the JSON response are being compared. In this case you want to ignore the timestamp and just compare all the other fields.

![Assertion](img/spd-report-assert.png)

You can customize your test config to ignore the `ts` value. You can test this immediately by hitting the 3 dots in the corner and selecting `Edit Test Config`. Then go to the `Assertions` tab and click on the `HTTP Response Body` assertion and add `ts` to the ignore list and `Save`. Then `Save` the entire test config and your report will be reanalyzed.

![HTTP Response Body](img/spd-http-response-body.png)

Your report should now show 100% and you can see the `ts` is ignored by opening up the assertion view.

![Assert Ignored](img/spd-report-assert-ignored.png)

Congrats, you completed all the capture and replay steps in docker! Now is a great time to explore and check out other ways to run your tests for load, contract validation, chaos, or even start to integrate this into your CI/CD workflow.
