# Websocket Contract

The websocket layer uses typed commands and typed server events.

Client commands are restricted to a fixed set of actions:

- connection ping
- model list
- chat send
- chat stop
- session reset

Server responses are structured events that report:

- readiness and connection status
- model catalogs
- assistant message updates
- structured errors
- session resets

All payloads must be validated before they are processed.
Invalid payloads are rejected immediately.

