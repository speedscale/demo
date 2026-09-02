# Getting Started with Mocks and Testing

Companion code for the **Getting Started with Mocks and Testing** blog series
on speedscale.com. One small package notifier, grown one collaborator at a
time across eight posts.

Everything is Go and, until the last post, standard library only. There is no
mocking framework to install. That is the point.

## Layout

Each numbered directory is the notifier as it looks at the end of that post,
so you can run any one of them without reading the others.

| Directory | Post |
|---|---|
| [`01-first-useful-mock/`](01-first-useful-mock/) | Your First Useful Mock |

Later posts add `02-make-failure-boring/`, `03-did-it-actually-send/`, and so
on as they are published.

## Run everything

```bash
make test
```

Or one post at a time:

```bash
cd 01-first-useful-mock && go test ./...
```
