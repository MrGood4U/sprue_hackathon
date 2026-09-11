# Hedera x402 CLI Boundaries

This package is an independent x402 consumer and must not import Sprue frontend or backend implementation modules. It may call any standards-compatible Hedera endpoint.

Keep private keys client-side, encrypted at rest, absent from command arguments, logs, HTTP headers, and repository fixtures. Environment-based key import is temporary input, not persistence. Never add a command that exports decrypted private keys.

Every paid request must validate the x402 v2 requirement before signing, enforce an explicit local maximum amount, and pin all approved payment fields across the paid retry. Native HBAR is the only supported asset until another asset receives its own reviewed decimal, association, and allowance model. Mainnet remains explicit and must never be inferred from a URL.

Standard output is reserved for response bodies or command JSON. Diagnostics and payment metadata belong on standard error so callers can pipe responses safely.

Running without arguments may open the interactive command line only when standard input and output are TTYs. Keep every command available in one-shot form, do not persist interactive history, and release the line reader before secret or confirmation prompts take ownership of the terminal.

The Windows executable must be reproducibly built from the bundled package with Node's single-executable application flow. Generated executables and preparation blobs are local artifacts, not repository inputs. Do not claim that an unsigned local build has publisher trust.
