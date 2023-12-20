# @canvas-js/test-network

Start the testnet with:

```
docker-compose up -d --scale replication-server=3
```

Then open the network connectivity dashboard: http://localhost:3000/d/bbc13c60-e72d-475d-a14c-115a7f5ffabf/network-connectivity

Stop the testnet with:

```
docker-compose down -v
```

The `-v` flag tells Docker to remove the anonymous volumes attached to the containers (ie reset the persistent data). If you want to persist the message logs, model databases, etc. then just use `docker-compose down`.
