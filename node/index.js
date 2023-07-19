import 'global-agent/bootstrap.js';
import got from 'got';
import express from 'express';
import morgan from 'morgan';

const app = express()
app.use(morgan('tiny'))
const port = 3000

function makeError(err) {
  let errMsg = {
    'msg':'there was some error',
    'err': err,
    'ts': new Date().toISOString()  
  }
  return errMsg
}

const errMsg = {
  'err':'there was some error',
  'ts': new Date().toISOString()
}

app.get('/', (req, res) => {
  const body = {
    'demo': 'node',
    'ts': new Date().toISOString()
  }
  res.send(body);
})

app.get('/healthz', (req, res) => {
  const body = {
    health: 'y',
    'ts': new Date().toISOString()
  }
  res.send(body);
})

app.get('/nasa', async (req, res) => {
  try {
    const url = 'https://api.nasa.gov/planetary/apod'
    const options = {
      searchParams: {
        'api_key': 'DEMO_KEY'
      }
    }
    const data = await got(url, options).json()
    res.send(data)
  } catch (err) {
    const msg = makeError(err)
    console.error(msg)
    res.status(500)
    res.send(msg)
  }
})

app.get('/events', async (req, res) => {
  try {
    const url = 'https://api.github.com/orgs/speedscale/events';
    const data = await got(url).json()
    res.send(data)
  } catch (err) {
    const msg = makeError(err)
    console.error(msg)
    res.status(500)
    res.send(msg)
  }
})

app.get('/bin', async (req, res) => {
  try {
    const data = await got.post('https://httpbin.org/anything', {
      json: {
        host: 'httpbin',
        endpoint: 'anything'
      }
    }).json()
    res.send(data)
  } catch (err) {
    const msg = makeError(err)
    console.error(msg)
    res.status(500)
    res.send(msg)
  }

})

app.listen(port, () => {
  console.log(`demo-node listening on port ${port}`)
})

