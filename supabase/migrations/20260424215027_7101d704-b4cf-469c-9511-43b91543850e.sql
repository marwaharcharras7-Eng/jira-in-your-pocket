
-- Backfill Jira account IDs for the team
UPDATE public.team_seed SET jira_account_id = '712020:af4c1abf-d4e9-4648-948b-3ba99453b49c' WHERE email = 'abir.ratbaoui@uit.ac.ma';
UPDATE public.team_seed SET jira_account_id = '712020:4d221101-9a7e-4f4d-b0f1-70841852f6d7' WHERE email = 'marwa.harcharras@uit.ac.ma';
UPDATE public.team_seed SET jira_account_id = '712020:32b00664-ac80-4bd5-8e44-ff6faafddf32' WHERE email = 'wiam.lamnaouar@uit.ac.ma';
UPDATE public.team_seed SET jira_account_id = '712020:edc7b1d1-dbda-407e-8087-e897da2a9fc2' WHERE email = 'hiba.ibourk@uit.ac.ma';
UPDATE public.team_seed SET jira_account_id = '712020:adc6d883-176e-4123-baea-202dea68e3d1' WHERE email = 'asmae.mouhanni@uit.ac.ma';

UPDATE public.profiles SET jira_account_id = '712020:af4c1abf-d4e9-4648-948b-3ba99453b49c' WHERE email = 'abir.ratbaoui@uit.ac.ma';
UPDATE public.profiles SET jira_account_id = '712020:4d221101-9a7e-4f4d-b0f1-70841852f6d7' WHERE email = 'marwa.harcharras@uit.ac.ma';
UPDATE public.profiles SET jira_account_id = '712020:32b00664-ac80-4bd5-8e44-ff6faafddf32' WHERE email = 'wiam.lamnaouar@uit.ac.ma';
UPDATE public.profiles SET jira_account_id = '712020:edc7b1d1-dbda-407e-8087-e897da2a9fc2' WHERE email = 'hiba.ibourk@uit.ac.ma';
UPDATE public.profiles SET jira_account_id = '712020:adc6d883-176e-4123-baea-202dea68e3d1' WHERE email = 'asmae.mouhanni@uit.ac.ma';
