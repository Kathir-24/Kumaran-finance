// Isolate Jest E2E tests onto Redis DB 1 so automated suites never mix cached
// master/auth keys with the developer Redis DB 0 instance.
if (!process.env.REDIS_DB) {
  process.env.REDIS_DB = '1';
}
