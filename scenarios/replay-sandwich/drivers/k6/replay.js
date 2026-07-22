import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
  },
};

export default function () {
  const health = http.get(`${baseUrl}/healthz`);
  check(health, {
    'health status is 200': (response) => response.status === 200,
    'service is healthy': (response) => response.status === 200 && response.json('health') === 'y',
  });

  const models = http.get(`${baseUrl}/models`);
  check(models, {
    'models status is 200': (response) => response.status === 200,
    'models are returned': (response) =>
      response.status === 200 && Array.isArray(response.json()) && response.json().length > 0,
  });
}
