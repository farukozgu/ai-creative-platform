\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET ROLE service_role;
SELECT outcome FROM public.admit_image_edit('f7f50000-0000-4000-8000-000000000901','f7f50000-0000-4000-8000-000000000902','f7f50000-0000-4000-8000-000000000903','f7f50000-0000-4000-8000-000000000913',repeat('0',64));
