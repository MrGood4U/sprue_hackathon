# Model Service API

Version 1.0. The Model Service resource is durable, workspace-scoped, and available only after creator authentication and owner authorization. It stores an OpenAI-compatible Chat Completions URL, exact model ID, and an application-encrypted API key.

## Routes

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/workspaces/{workspaceId}/model-profile` | Return the authorized workspace's redacted model profile. | 200 |
| PUT | `/api/v1/workspaces/{workspaceId}/model-profile` | Validate and durably replace the workspace model profile. | 200 |
| POST | `/api/v1/workspaces/{workspaceId}/model-profile/test` | Test current form values with one minimal provider request without saving them. | 200 |

All routes require `Authorization: Bearer <provider access token>`. The backend verifies the provider token, resolves it to a Sprue user UUID, and verifies owner access to the path workspace before reading or writing. A browser-supplied user ID is never accepted.

The write and connection-test body is strict:

```json
{
  "apiUrl": "https://provider.example/v1/chat/completions",
  "apiKey": "server-bound-input",
  "model": "provider-model-id"
}
```

`apiUrl` must be a complete HTTPS URL without credentials, query parameters, or fragments. `model` is required. `apiKey` is required for the first write and may be omitted later to retain and re-encrypt the current key. Saving does not contact the provider. Concurrent writes use compare-and-swap retries against `lock_version`.

A successful profile read or write exposes only:

```json
{
  "configured": true,
  "protocol": "openai_compatible_chat_completions",
  "apiUrl": "https://provider.example/v1/chat/completions",
  "model": "provider-model-id",
  "hasApiKey": true,
  "updatedAt": "2026-09-07T12:00:00.000Z"
}
```

The raw API key, ciphertext, IV, authentication tag, encryption-key ID, secret version, and credential fingerprint are never returned. The frontend stores none of them.

## Credential storage

The API process encrypts each key with AES-256-GCM before SQL. Every write uses a random 96-bit IV and authenticates the workspace ID plus secret version as additional data. PostgreSQL stores ciphertext, authentication metadata, a keyed fingerprint, and the versioned key ID. The 32-byte encryption keys exist only in the server-side `MODEL_CREDENTIAL_KEYRING`; `MODEL_CREDENTIAL_ACTIVE_KEY_ID` selects the key for new writes. Old keyring entries must remain configured until every row referencing them has been re-encrypted.

A connection test may use the saved workspace key when `apiKey` is omitted. It sends one minimal fixed request and may incur provider charges. It does not persist submitted form values or provider content. A successful response exposes only `available`, `protocol`, `model`, and `latencyMs`; upstream content and error bodies remain server-side.

The next explicit Agent-plan action resolves and decrypts this profile inside the API process. The key is never sent to the planner model as prompt content, logged, placed in a job payload, or exposed to browser code. Provider output remains untrusted and must pass Sprue's proposal and DAG validation.
