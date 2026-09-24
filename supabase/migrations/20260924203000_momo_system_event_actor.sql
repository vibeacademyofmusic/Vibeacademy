-- MoMo completion is a provider event, not a staff action.
-- The existing actor check only allowed a null actor for Zalo link results.
alter table public.registration_application_events
  drop constraint registration_application_events_actor_check;

alter table public.registration_application_events
  add constraint registration_application_events_actor_check
  check (
    actor_id is not null
    or event_type in (
      'ZALO_LINK_CONFIRMED',
      'ZALO_LINK_FAILED',
      'REGISTRATION_COMPLETED',
      'PLACEMENT_OPENED'
    )
  );
