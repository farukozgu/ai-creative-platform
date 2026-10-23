# KLAY AI Phase 7F.16 Comprehensive Staging Runner

## Operator command

Run this single command from Windows PowerShell 5.1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayComprehensiveStaging.ps1"
```

The runner validates the fixed staging project ref, pooler host/user and exact 40-version local/remote migration match before it asks to connect. It never links the source repository or offers a migration apply/reset operation. It runs transactional SQL checks, candidate ownership and F-07 tests, controlled concurrency, Storage SQL policies and a final fixture residue audit. JSON, Markdown and sanitized SQL output are written under `tests/staging-postgres/reports/`.

The runner uses only SQL test fixtures and the explicitly described disposable Storage objects. It does not enable workers, invoke paid providers, activate billing or change migrations.

## Storage API account prerequisites

To receive a full PASS, have ready:

1. Two distinct disposable staging Auth users with the reserved `@staging.invalid` email domain, each with confirmed email/password sign-in.
2. One existing disposable project UUID owned by each respective account. The runner verifies ownership in staging PostgreSQL before using either project path.
3. The staging project's anon/publishable API key for authenticated user tests.
4. The staging project's service-role key, used only in a `finally` cleanup to delete the two exact run-specific object paths. It is never used for authentication or access-control assertions.

Create the accounts only in staging using the Supabase Dashboard (Authentication > Users), with synthetic `@staging.invalid` email addresses and test-only passwords. Mark email as confirmed for password sign-in. Using those accounts, create one empty synthetic project each in the staging UI. Copy the UUID of each owned project. Find the anon/publishable key in the staging project's API settings. The Supabase URL is derived and pinned to `https://gklpgcyndeghjgemoonk.supabase.co`; it is not accepted from operator input. Never supply production account emails.

The runner prompts for email, password (hidden input), project UUID, anon key and service-role cleanup key. It signs both users in, confirms each returned Auth identity, checks that their IDs differ, and checks each project owner. It uploads a uniquely named small text object to each user's `product-assets` path, verifies each owner can read their own object, verifies the other account and anonymous access are denied, then deletes only those exact run-specific object paths in a `finally` cleanup path. The elevated key is held only in process memory and is never used for test requests; secrets and tokens are not written to report/log files. This cleanup key is required because the current authenticated Storage policies do not grant users object deletion. If credentials are unavailable, SQL groups still run and Storage API is reported BLOCKED, which forces overall BLOCKED.

## Reports and verdicts

Each report includes every required group, test case labels, failure details, exact completion marker, cleanup state, sanitized evidence path and next action. Confirmed SQL/API assertions produce FAIL. Missing credentials/dependencies or unexecuted groups produce BLOCKED. Overall PASS requires every required group PASS and final cleanup verification PASS. Failed runs still attempt the final residue audit when staging isolation and database credentials were established.

## Local implementation status

The 40-migration baseline is now the default in both the original runner and migration parser. The comprehensive entry point is `tests/staging-postgres/Invoke-KlayComprehensiveStaging.ps1`. Storage API tests require the disposable credentials above. No remote staging test was run during implementation.

Local validation passed: PowerShell 5.1 parsed all staging scripts; the runner mock matrix, pinned CLI/native encoding/migration parser/F-07 contracts and comprehensive fail-closed contracts passed; `npm test` passed 656 tests; TypeScript and ESLint passed; static SQL rollback/marker contracts passed.
