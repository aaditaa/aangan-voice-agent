-- One designer, so a qualified lead has somewhere to go.
-- On Resend's sandbox, only your own signup address receives mail — use it here.
insert into public.designers (name, email, specialties)
values ('Test Designer', 'you@example.com', '{home,office}')
on conflict do nothing;
