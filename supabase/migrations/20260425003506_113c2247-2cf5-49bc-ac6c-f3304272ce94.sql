-- Backfill de deadline em public.intimations a partir do parser corrigido (legalDeadlines.ts).
-- Idempotente: só atualiza linhas cujo deadline difere do calculado.
DO $$
DECLARE _affected INTEGER;
BEGIN
  WITH src(id, d) AS (VALUES
    ('f0db8ead-3a0e-4442-9c46-0d95e66a47f1'::uuid, DATE '2026-06-10'),
    ('4d7eb8b3-6479-42c6-83c1-b4054ee1b0a0', DATE '2026-06-10'),
    ('3e2611c6-7a30-4a7e-b666-a6237993d936', DATE '2026-06-09'),
    ('e50770c1-f8af-438a-b84e-a7f30102497a', DATE '2026-06-09'),
    ('1bd4b8e6-65df-4fd0-bf90-d5eefd3b0167', DATE '2026-06-08'),
    ('0780470f-5d9d-4331-b0b4-2d5774a66731', DATE '2026-05-18'),
    ('2399d99d-65e2-4804-8681-2791c0eba699', DATE '2026-06-10'),
    ('ee17801d-5f94-4357-8ff2-941846077629', DATE '2026-06-10'),
    ('b8913a9c-90e0-4df0-a98e-d65d69c246f6', DATE '2026-05-19'),
    ('417ff11a-f4a3-4b20-8927-ff5bf689a7fa', DATE '2026-05-19')
  )
  UPDATE public.intimations AS i SET deadline = src.d
  FROM src WHERE i.id = src.id AND i.deadline IS DISTINCT FROM src.d;
  GET DIAGNOSTICS _affected = ROW_COUNT;
  RAISE NOTICE 'Lote 1 atualizado: %', _affected;
END $$;