# @canvas-js/test-network

Start the Prometheus and Grafana services:

```
docker-compose up
```

Then open the network connectivity dashboard: http://localhost:3000/d/bbc13c60-e72d-475d-a14c-115a7f5ffabf/network-connectivity

Start the testnet:

```
npm run start
```

Or override the number of servers/clients:

```
SERVER_COUNT=5 CLIENT_COUNT=10 npm run start
```
