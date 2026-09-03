# 05: Test Behavior, Not Choreography

Post 4 gave the tests a spy, and a spy makes it easy to assert far too much.
This post shows what that costs.

The only production change is that the retry backoff doubles after each failed
attempt instead of staying fixed. Nothing a customer can observe changes: the
carrier is still asked three times, nothing is still sent, and the same failure
still surfaces.

Same behavior, four languages:

| | Java | Node.js | Go | Python |
|---|---|---|---|---|
| Exponential backoff | `backoffFor` | `backoffFor` | `backoffFor` | `backoff_for` |
| The brittle test, skipped | `giveUpChoreography` | `give-up choreography` | `TestGiveUpChoreography` | `test_give_up_choreography` |
| The rewrite | `givingUpTellsNobody...` | `giving up tells nobody...` | `TestGivingUpTellsNobody...` | `test_giving_up_tells_nobody...` |

## What is here

- **The brittle test**, kept and skipped rather than deleted, so you can see
  what over-specification looks like. It records every interaction in order and
  asserts the exact sequence, including how long the notifier waited between
  attempts.
- **The rewrite**, which keeps exactly one interaction assertion: nothing was
  sent. The failure surfacing is checked as a return value or exception.

## See it fail

The brittle test is skipped because it no longer passes. To watch it break,
remove the skip and run the suite. In Go:

```bash
cd go/notifier
sed -i '' '/t.Skip("over-specified/d' notifier_test.go
go test -run TestGiveUpChoreography ./...
```

It fails with `event 3: expected "sleep 100ms", got "sleep 200ms"`. Restore the
line with `git checkout notifier_test.go`.

## Run it

```bash
cd java && mvn test
cd node && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

Eight passing tests and one skipped in each language.

## What these tests prove

That a customer whose carrier never answers is told nothing, and that the
failure reaches the caller.

## What these tests do not prove

Anything about the retry schedule, deliberately. That is now free to change.

## Try it

Find one interaction assertion in your own suite and decide which side of the
line it is on: could a user notice if it changed?
