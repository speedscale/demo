import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici'

const PROXY_VARS = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY']

export function proxyConfigured(env = process.env) {
  return PROXY_VARS.some((name) => env[name])
}

// Builds the CA list: the bundled roots plus SSL_CERT_FILE when it is set.
export function caList(env = process.env, warn = console.error) {
  const ca = [...tls.rootCertificates]
  if (env.SSL_CERT_FILE) {
    try {
      ca.push(readFileSync(env.SSL_CERT_FILE, 'utf8'))
    } catch (err) {
      warn(`cannot read SSL_CERT_FILE ${env.SSL_CERT_FILE}: ${err.message}`)
    }
  }
  return ca
}

// Node's fetch ignores proxy variables. When one is set, route fetch through
// undici's EnvHttpProxyAgent and trust the proxy's CA. Returns true when a
// proxy dispatcher was installed.
//
// Where the CA goes matters: for a proxied https request undici opens a CONNECT
// tunnel and then does the TLS handshake with the target using `requestTls`;
// `connect` only covers direct (NO_PROXY) connections and `proxyTls` the hop to
// an https proxy.
export function installProxyDispatcher(env = process.env) {
  if (!proxyConfigured(env)) return false
  const tlsOptions = { ca: caList(env) }
  setGlobalDispatcher(
    new EnvHttpProxyAgent({
      connect: tlsOptions,
      requestTls: tlsOptions,
      proxyTls: tlsOptions,
    }),
  )
  return true
}
