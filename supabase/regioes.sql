-- Corredores e áreas cadastrados no Cockpit (modo ?admin). Mesmo projeto Supabase do
-- croqui-prototipo; reaproveita a função set_atualizado() criada por
-- croqui-prototipo/supabase/schema.sql (o servidor grava "atualizado", nunca o cliente).
-- Pode rodar de novo sem efeito colateral.
--
-- linha / poligono: lista de pontos [[lat, lng], ...] (corredor: 2+ pontos; área: 3+).
-- raio_m: distância máxima (em metros) da linha do corredor até um controlador para ele
--   contar como "do corredor". Não existe no Manual nem nas Stories; é parâmetro do
--   protótipo, editável no cadastro.

create table if not exists cockpit_corredores (
  id text primary key,
  nome text not null,
  linha jsonb not null,
  raio_m integer not null default 50,
  atualizado timestamptz not null default now()
);

create table if not exists cockpit_areas (
  id text primary key,
  nome text not null,
  poligono jsonb not null,
  atualizado timestamptz not null default now()
);

-- cor: cor oficial da subárea no sistema (ex.: "#00A9D8"). Opcional; sem ela o mapa usa uma
--   cor automática pelo id.
alter table cockpit_areas add column if not exists cor text;

drop trigger if exists trg_cockpit_corredores_atualizado on cockpit_corredores;
create trigger trg_cockpit_corredores_atualizado before update on cockpit_corredores
  for each row execute function set_atualizado();
drop trigger if exists trg_cockpit_areas_atualizado on cockpit_areas;
create trigger trg_cockpit_areas_atualizado before update on cockpit_areas
  for each row execute function set_atualizado();

-- RLS liberado pela chave publicável, igual às tabelas do croqui (protótipo interno, sem
-- login). O cadastro só aparece na tela com ?admin, mas isso é conveniência de UI, não
-- segurança: quem tiver a chave publicável consegue escrever.
alter table cockpit_corredores enable row level security;
alter table cockpit_areas enable row level security;

drop policy if exists "leitura publica" on cockpit_corredores;
create policy "leitura publica" on cockpit_corredores for select using (true);
drop policy if exists "escrita publica" on cockpit_corredores;
create policy "escrita publica" on cockpit_corredores for all using (true) with check (true);

drop policy if exists "leitura publica" on cockpit_areas;
create policy "leitura publica" on cockpit_areas for select using (true);
drop policy if exists "escrita publica" on cockpit_areas;
create policy "escrita publica" on cockpit_areas for all using (true) with check (true);
