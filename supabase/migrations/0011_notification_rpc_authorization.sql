-- 0011_notification_rpc_authorization.sql
-- SECURITY FIX -- create_notification() had no authorization check on the
-- caller vs. the target user (p_user_id): any authenticated client could
-- call it directly (bypassing the app UI) to write a notification -- and,
-- via the existing send-push Database Webhook, trigger a real push
-- notification -- into ANY other user's feed. Found during a security
-- audit; this is the minimal fix, preserving the function's exact original
-- signature and insert logic (see Claude outputs/supabase_migration_multidevice.sql:591-611).
--
-- WHAT THIS DOES
--   Re-creates create_notification() with one addition: before inserting,
--   it verifies the caller (auth.uid()) actually has a relationship with
--   the target user (p_user_id) that would legitimately produce a
--   notification in this app today:
--     - notifying yourself (some flows do this), or
--     - the caller and target share a booking (renter_id/owner_id, either
--       direction) -- covers booking_created / booking_status notifications,
--       or
--     - the caller and target share a conversation (renter_id/owner_id,
--       either direction) -- covers new-message notifications, or
--     - the caller is an admin (public.is_admin(), defined in this same
--       Supabase project by velora-admin/supabase/migrations/0001_admin_foundation.sql)
--       -- covers admin broadcast notifications.
--   An unauthorized call now raises an exception instead of silently
--   succeeding.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not change the notifications table, its columns, its existing RLS
--   policies, or the function's parameter list/return type -- every
--   existing call site (NotificationsContext.notify -> supabase.rpc('create_notification', {...}))
--   keeps working unchanged for every legitimate case found in this app's
--   source (booking created/status notifications between a booking's own
--   renter and owner; message notifications between a conversation's own
--   renter and owner).
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules -- run this via the Supabase SQL editor / `supabase db push` only
-- after it has been reviewed.
--
-- Safe to re-run: create-or-replace.

create or replace function public.create_notification(
  p_id text,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_target_kind text default null,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'create_notification: no authenticated caller';
  end if;

  if auth.uid() <> p_user_id
     and not exists (
       select 1 from public.bookings b
       where (b.renter_id = auth.uid() and b.owner_id = p_user_id)
          or (b.owner_id = auth.uid() and b.renter_id = p_user_id)
     )
     and not exists (
       select 1 from public.conversations c
       where (c.renter_id = auth.uid() and c.owner_id = p_user_id)
          or (c.owner_id = auth.uid() and c.renter_id = p_user_id)
     )
     and not coalesce(public.is_admin(), false)
  then
    raise exception 'create_notification: caller % is not authorized to notify user %', auth.uid(), p_user_id;
  end if;

  insert into public.notifications (id, user_id, type, title, message, target_kind, target_id)
  values (p_id, p_user_id, p_type, p_title, p_message, p_target_kind, p_target_id);
end;
$$;

grant execute on function public.create_notification(text, uuid, text, text, text, text, text) to authenticated;
