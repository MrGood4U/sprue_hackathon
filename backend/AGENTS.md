# Backend Instructions

All repository text, code comments, test names, migration notes, and commit messages must be written in English. Communication with the user may be in Chinese.

Use the approved root `data-model.md` as the persistence baseline. Do not invent durable fields in endpoint code; update the reviewed model first when a missing concept is discovered.

Keep API and worker entry points separate while sharing domain modules. Keep provider SDKs behind adapters, secrets out of the frontend and database, and all paid or retryable operations idempotent and reconcilable.

Before changing The Graph, Privy, or Hedera behavior, read the matching active file under `sponsor/`. Do not claim a provider capability without implementation evidence.
