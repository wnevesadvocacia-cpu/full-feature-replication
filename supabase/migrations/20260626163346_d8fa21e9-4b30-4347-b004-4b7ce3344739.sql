UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"full_name": "Paula Neves"}'::jsonb
WHERE email = 'pbelgini@yahoo.com.br';