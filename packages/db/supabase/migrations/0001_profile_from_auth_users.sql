create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public."user" (id, name, email, email_verified)
    values (
        new.id::text,
        coalesce(new.raw_user_meta_data ->> 'name', new.email),
        new.email,
        new.email_confirmed_at is not null
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();