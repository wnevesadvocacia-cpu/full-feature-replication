-- Adiciona novos papéis ao enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'usuario';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'assistente_adm';