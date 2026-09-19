-- Fotografie storiche minime: nessuna modifica a utenti, sessioni o periodi lavorativi.
ALTER TABLE user_management_audit ADD COLUMN actor_user_ref TEXT;
ALTER TABLE user_management_audit ADD COLUMN actor_username TEXT;
ALTER TABLE user_management_audit ADD COLUMN actor_name TEXT;
ALTER TABLE user_management_audit ADD COLUMN target_user_ref TEXT;
ALTER TABLE user_management_audit ADD COLUMN target_username TEXT;
ALTER TABLE user_management_audit ADD COLUMN target_name TEXT;

UPDATE user_management_audit
SET actor_user_ref = actor_user_id,
    actor_username = (SELECT username FROM users WHERE users.id = user_management_audit.actor_user_id),
    actor_name = (SELECT name FROM users WHERE users.id = user_management_audit.actor_user_id)
WHERE actor_user_id IS NOT NULL;

UPDATE user_management_audit
SET target_user_ref = target_user_id,
    target_username = (SELECT username FROM users WHERE users.id = user_management_audit.target_user_id),
    target_name = (SELECT name FROM users WHERE users.id = user_management_audit.target_user_id)
WHERE target_user_id IS NOT NULL;

CREATE INDEX user_management_audit_target_ref
  ON user_management_audit(target_user_ref, occurred_at);
