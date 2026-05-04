UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{mfa_grace_until}',
  to_jsonb((now() + interval '30 days')::text)
)
WHERE raw_user_meta_data->>'mfa_enrolled' IS NULL
   OR raw_user_meta_data->>'mfa_enrolled' = 'false';