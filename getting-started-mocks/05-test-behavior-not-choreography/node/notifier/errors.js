// Thrown when the carrier is reachable but refuses to answer. This is the HTTP
// 500 case, not a network failure.
export class CarrierUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CarrierUnavailableError'
  }
}

// Node's fetch reports a timeout as a DOMException, which is awkward to throw
// from a test. The carrier translates it into this instead.
export class TimeoutError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TimeoutError'
  }
}
