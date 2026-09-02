package before

import "testing"

// This is the test we want to write. Against this code it cannot be made to
// pass on purpose: the test has no way to make the carrier report TRACK-123 as
// delayed, and the carrier host is not reachable from a laptop anyway.
//
// It is skipped so `go test ./...` stays green. Green because nothing ran is
// the wrong kind of green; the post explains the fix.
func TestNotifyDelayedPackage(t *testing.T) {
	t.Skip("needs a live carrier that will report TRACK-123 as delayed, and the test cannot make that happen")

	message, err := Notify("TRACK-123")
	if err != nil {
		t.Fatal(err)
	}
	if message != "Package TRACK-123 is delayed" {
		t.Fatalf("unexpected message: %q", message)
	}
}
