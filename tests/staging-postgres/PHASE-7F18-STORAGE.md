# Phase 7F.18 disposable Storage API fixtures

The comprehensive runner provisions or reuses two `public.projects` rows for the pre-existing Auth users `klay-storage-a@staging.invalid` and `klay-storage-b@staging.invalid`. Rows use the reserved titles `KLAY_PHASE7F18_STORAGE_A` and `KLAY_PHASE7F18_STORAGE_B`; the helper rejects duplicate markers and markers owned by another identity. It creates no Auth users and deletes no project rows.

Project rows are required by the installed `product-assets` INSERT policy. The path is `<authenticated-user-uuid>/<owned-project-uuid>/<run-specific-filename>`. The installed policy set has no authenticated Storage DELETE policy, so cleanup requires the staging `service_role` JWT. The runner validates its JWT `ref` and `role` before use, sends it only to the allowlisted staging Storage endpoint, and deletes only the random full paths created by the current run. Each attempted upload is marked for cleanup before the request so an interrupted upload response still triggers cleanup. Cleanup is checked by an authenticated Storage read and a read-only exact-name query against `storage.objects`.

## Operator command

Run the comprehensive command from Phase 7F.17. No project UUIDs or account emails are requested. After database preflight and all SQL groups pass, enter:

1. Password for `klay-storage-a@staging.invalid` (hidden input).
2. Password for `klay-storage-b@staging.invalid` (hidden input).
3. The staging anon/publishable key.
4. The staging legacy `service_role` JWT (hidden input).

The runner provisions the marked project rows using the already-isolated staging PostgreSQL connection, and then authenticates both users against `https://gklpgcyndeghjgemoonk.supabase.co`. Opaque service keys are rejected because their project identity cannot be checked locally. Use only the staging project's legacy `service_role` JWT. Neither key nor password is written to a report or file. Missing prerequisites block the Storage group and overall run while preceding SQL groups still execute.

The local startup and workflow tests validate PowerShell 5.1 process startup, missing and wrong credentials, Auth response shape and identity separation, project-ref rejection, deterministic repeat provisioning, non-destructive SQL generation, and cleanup/residue contracts. They do not contact Supabase or execute provisioning SQL.
