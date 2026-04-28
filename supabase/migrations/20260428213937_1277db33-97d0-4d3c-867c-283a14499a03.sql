UPDATE public.djen_proxy_config
SET proxy_url = 'https://djen-proxy.wnevesadvocacia.workers.dev',
    last_status = 'configured_manually',
    last_error = NULL,
    validated_at = now(),
    updated_at = now()
WHERE id = 1;