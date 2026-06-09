import axios from 'axios';
import express from 'express';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';

const app = express()
app.use(express.json())
app.use(morgan('tiny'))
const port = 3000

app.get('/', (req, res) => {
  res.send({ demo: 'node', ts: new Date().toISOString() })
})

app.get('/healthz', (req, res) => {
  res.send({ health: 'y', ts: new Date().toISOString() })
})

app.post('/login', (req, res) => {
  const token = jwt.sign({ user: req.body.username }, 'shhhhh');
  res.send({ access_token: token, ts: new Date().toISOString() })
})

app.get('/models', async (req, res) => {
  try {
    const { data } = await axios.get('https://huggingface.co/api/models?sort=downloads&direction=-1&limit=5')
    res.send(data)
  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

app.get('/models/:org/:model', async (req, res) => {
  try {
    const { data } = await axios.get(`https://huggingface.co/api/models/${req.params.org}/${req.params.model}`)
    res.send(data)
  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

app.get('/llm/models', async (req, res) => {
  try {
    const { data } = await axios.get('https://openrouter.ai/api/v1/models')
    res.send(data)
  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

app.get('/nasa', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.nasa.gov/planetary/apod', {
      params: { api_key: 'DEMO_KEY' }
    })
    res.send(data)
  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

app.get('/events', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.github.com/orgs/speedscale/events')
    res.send(data)
  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

app.listen(port, () => {
  console.log(`node-server listening on port ${port}`)
})
