# Getting Started with Mocks and Testing

Companion code for the **Getting Started with Mocks and Testing** blog series
on speedscale.com. One small package notifier, grown one collaborator at a
time across eight posts, implemented in **Java, Node.js, Go, and Python**.

Every example in every post exists in all four languages. The scenario and
the test names are the same; each implementation is idiomatic for its
language. Until post 6 there is no mocking framework or test dependency
beyond each language's own test runner. That is the point.

## Layout

Each numbered directory is the notifier as it looks at the end of that post,
with one subdirectory per language, so you can run any one post in your
language without reading the others.

| Directory | Post |
|---|---|
| (no code) | What Mocks Are Actually For (post 1) |
| [`02-first-useful-mock/`](02-first-useful-mock/) | Your First Useful Mock (post 2) |
| [`03-make-failure-boring/`](03-make-failure-boring/) | Make Failure Boring (post 3) |
| [`04-did-it-actually-send/`](04-did-it-actually-send/) | Did It Actually Send? (post 4) |
| [`05-test-behavior-not-choreography/`](05-test-behavior-not-choreography/) | Test Behavior, Not Choreography (post 5) |
| [`06-they-arent-all-mocks/`](06-they-arent-all-mocks/) | They Aren't All Mocks (post 6) |
| [`07-mock-the-wire/`](07-mock-the-wire/) | Mock the Wire (post 7) |
| [`08-your-mock-is-lying/`](08-your-mock-is-lying/) | Your Mock Is Lying (post 8) |
| [`09-when-handwritten-mocks-stop-scaling/`](09-when-handwritten-mocks-stop-scaling/) | When Handwritten Mocks Stop Scaling (post 9) |

Directory numbers match the post numbers in the series; post 1 is prose only.
Post 10 applies the complete progression with proxymock and uses the separate
[`speedscale/mock-lab`](https://github.com/speedscale/mock-lab) repository.

## Run everything

Requires Go 1.23+, Java 17+ with Maven, Node 20+, and Python 3.10+.

```bash
make test
```

Or one language across every post:

```bash
make test-go
make test-java
make test-node
make test-python
```

Or one post in one language:

```bash
cd 02-first-useful-mock/go && go test ./...
cd 02-first-useful-mock/java && mvn test
cd 02-first-useful-mock/node && npm test
cd 07-mock-the-wire/node && npm ci && npm test
cd 02-first-useful-mock/python && python3 -m unittest discover -v
```
