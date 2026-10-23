\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET ROLE service_role;
SELECT outcome FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000901','f7f50000-0000-4000-8000-000000000908');
