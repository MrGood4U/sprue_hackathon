# Job Execution Boundary

The worker process currently exposes probes and starts an explicitly idle WorkerRuntime. It does not connect to pg-boss, create queue schemas, consume outbox records or execute commands. Healthy database probes do not imply jobs are being processed.

The next runner must use pg-boss in its own schema, with reviewed durable command-ID-only payloads, transactional outbox relay, allowlisted handlers, leases/heartbeats, cooperative cancellation and shutdown. Repeated delivery must reuse logical run/source/payment identities and reconcile unknown side effects. A handler map or in-memory timer is not an authoritative job queue. Add native multi-connection and process-crash tests before enabling it.
