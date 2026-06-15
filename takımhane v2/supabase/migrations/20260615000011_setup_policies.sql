-- Bootstrap: allow authenticated users to create their first facility
-- (before facility_id is set on profile, RLS blocks everything — this opens the minimum needed)

-- Facilities: any authenticated user can INSERT (they need to create the first one)
create policy "auth_users_can_create_facility"
  on facilities for insert
  to authenticated
  with check (true);

-- Facilities: users can SELECT their own facility after it's created
create policy "users_can_read_own_facility"
  on facilities for select
  to authenticated
  using (
    id = (select facility_id from profiles where id = auth.uid())
    or
    -- also allow during setup: facility_id is still null on profile
    (select facility_id from profiles where id = auth.uid()) is null
  );

-- Facilities: creator (owner) can update their own facility
create policy "users_can_update_own_facility"
  on facilities for update
  to authenticated
  using (id = (select facility_id from profiles where id = auth.uid()));

-- Profiles: users can always read + update their own profile (needed for setup step 1)
-- These may already exist, use DO block to avoid errors
do $$
begin
  -- own profile select
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'users_can_read_own_profile'
  ) then
    execute $pol$
      create policy "users_can_read_own_profile"
        on profiles for select
        to authenticated
        using (id = auth.uid())
    $pol$;
  end if;

  -- own profile update
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'users_can_update_own_profile'
  ) then
    execute $pol$
      create policy "users_can_update_own_profile"
        on profiles for update
        to authenticated
        using (id = auth.uid())
        with check (id = auth.uid())
    $pol$;
  end if;
end $$;

-- Storage locations: INSERT during setup (facility exists but might not be on profile yet)
create policy "facility_members_can_insert_locations"
  on storage_locations for insert
  to authenticated
  with check (
    facility_id = (select facility_id from profiles where id = auth.uid())
  );

-- Magazine machines: INSERT during setup
create policy "facility_members_can_insert_machines"
  on magazine_machines for insert
  to authenticated
  with check (
    facility_id = (select facility_id from profiles where id = auth.uid())
  );

-- Suppliers: INSERT during setup (global, no facility_id)
create policy "auth_users_can_insert_suppliers"
  on suppliers for insert
  to authenticated
  with check (true);

-- Roles: allow read for setup wizard step 4
create policy "auth_users_can_read_roles"
  on roles for select
  to authenticated
  using (true);
