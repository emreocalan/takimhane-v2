-- EAV değerleri — katalog (definition) seviyesi
create table public.tool_definition_attributes (
  id                        uuid primary key default gen_random_uuid(),
  definition_id             uuid not null references public.tool_definitions(id) on delete cascade,
  attribute_definition_id   uuid not null references public.tool_type_attribute_definitions(id),
  value_text                text,
  value_number              numeric,
  value_date                date,
  value_boolean             boolean,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint tda_def_attr_uq unique (definition_id, attribute_definition_id)
);

create trigger tool_definition_attributes_updated_at
  before update on public.tool_definition_attributes
  for each row execute function public.handle_updated_at();

-- RLS
alter table public.tool_definition_attributes enable row level security;

create policy "facility_members_can_read_def_attrs"
  on tool_definition_attributes for select
  to authenticated
  using (
    exists (
      select 1 from tool_definitions d
      where d.id = definition_id
        and d.facility_id = (select facility_id from profiles where id = auth.uid())
    )
  );

create policy "facility_members_can_write_def_attrs"
  on tool_definition_attributes for insert
  to authenticated
  with check (
    exists (
      select 1 from tool_definitions d
      where d.id = definition_id
        and d.facility_id = (select facility_id from profiles where id = auth.uid())
    )
  );

create policy "facility_members_can_update_def_attrs"
  on tool_definition_attributes for update
  to authenticated
  using (
    exists (
      select 1 from tool_definitions d
      where d.id = definition_id
        and d.facility_id = (select facility_id from profiles where id = auth.uid())
    )
  );

-- Index
create index idx_tda_definition_id on tool_definition_attributes(definition_id);
