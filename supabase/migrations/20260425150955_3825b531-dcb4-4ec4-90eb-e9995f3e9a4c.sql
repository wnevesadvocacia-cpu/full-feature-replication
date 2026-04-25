-- Fix search_path mutable warnings (já tinham SET search_path mas linter exige redeclarar)
ALTER FUNCTION public.check_and_increment_rate_limit(text, text, int, int) SET search_path = public;
ALTER FUNCTION public.register_otp_failure(text, int, int) SET search_path = public;
ALTER FUNCTION public.reset_otp_lockout(text) SET search_path = public;
ALTER FUNCTION public.is_email_locked(text) SET search_path = public;