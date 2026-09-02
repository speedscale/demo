import assert from 'node:assert/strict'
import test from 'node:test'

import { notify } from './notifier.js'

// This is the test we want to write. Against this code it cannot be made to
// pass on purpose: the test has no way to make the carrier report TRACK-123 as
// delayed, and the carrier host is not reachable from a laptop anyway.
//
// It is skipped so `npm test` stays green. Green because nothing ran is the
// wrong kind of green; the post explains the fix.
test(
  'creates a notification when the package is delayed',
  { skip: 'needs a live carrier that will report TRACK-123 as delayed, and the test cannot make that happen' },
  async () => {
    assert.equal(await notify('TRACK-123'), 'Package TRACK-123 is delayed')
  },
)
