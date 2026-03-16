# Load Testing Guide

## Prerequisites
- [k6](https://k6.io/docs/getting-started/installation/) installed
- Backend running at `http://localhost:8000`

## Basic Smoke Test

Save as `load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/api/v1/health`);
  check(health, { 'health ok': (r) => r.status === 200 });

  // Public offers list
  const offers = http.get(`${BASE_URL}/api/v1/offers`);
  check(offers, { 'offers ok': (r) => r.status === 200 });

  sleep(1);
}
```

## Run

```bash
k6 run load-test.js
# With custom base URL:
k6 run -e BASE_URL=https://api.groupio.co.il load-test.js
```

## Targets for Broader Beta
- p95 latency < 500ms for read endpoints
- p95 latency < 2s for write endpoints (payment, create offer)
- Error rate < 1% under 50 concurrent users
- Zero 5xx errors under normal load
