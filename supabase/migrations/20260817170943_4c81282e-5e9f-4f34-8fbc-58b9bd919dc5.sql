-- Reaponta publicações e prazos que ficaram presos ao processo principal
-- para o próprio processo intimado (quando cadastrado); se não houver, desvincula.
with wrong as (
  select i.id,
         (i.classification_meta->>'numero_execucao') as own_number,
         i.user_id
  from public.intimations i
  where (i.classification_meta->>'linked_to_parent')::boolean is true
    and i.process_id is not null
), fixed as (
  select w.id, w.own_number, p.id as correct_process_id
  from wrong w
  left join public.processes p
    on regexp_replace(p.number, '\D', '', 'g') = regexp_replace(coalesce(w.own_number,''), '\D', '', 'g')
   and w.own_number is not null
)
update public.intimations i
set process_id = f.correct_process_id,
    classification_meta = jsonb_set(coalesce(i.classification_meta,'{}'::jsonb), '{linked_to_parent}', 'false'::jsonb)
from fixed f
where f.id = i.id;

-- Prazos criados a partir dessas publicações: aponta para o processo correto quando existir.
update public.tasks t
set process_id = i.process_id
from public.intimations i
where i.process_id is not null
  and t.process_id is distinct from i.process_id
  and i.content like '%0036046-10.2018.8.26.0114%'
  and t.process_id = (select id from public.processes where number = '0044207-87.2010.8.26.0114' limit 1);