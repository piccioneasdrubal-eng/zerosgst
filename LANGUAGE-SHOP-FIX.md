# Language + Shop fix

Language storage is canonicalized to `zl_lang`.
Shop authentication accepts the token exposed by ZLAuth or the legacy token keys.
Missing translation keys fall back to English/key instead of breaking the UI.

The Shop remains on `/auth/economy.php`; no `users` table is required when the
installation uses `zl_users`.
