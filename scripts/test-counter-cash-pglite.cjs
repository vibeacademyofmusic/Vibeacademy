/* Isolated PostgreSQL migration replay. No production connections or data. */
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto')

async function database() {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } })
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create role supabase_auth_admin; create role supabase_storage_admin;
    create schema auth; create schema storage; create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,secret text);
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(text,text,text) returns uuid language sql as $$ insert into vault.secrets(secret,name) values($1,$2) returning id $$;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema public,auth,storage,extensions to authenticated,anon,service_role;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    alter default privileges in schema public grant all on sequences to authenticated,service_role;
  `)
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8')); await db.exec('set search_path=public,extensions') }
    catch (error) { console.error('Migration failed:', file, error.message, error.detail ?? '', error.where ?? '', error.position ?? ''); await db.close(); throw error }
  }
  await db.exec('set row_security=on')
  return db
}
module.exports = { database }
if (require.main === module) database().then(async db => {
  console.log('Full application migration replay passed')
  await db.close()
}).catch(() => { process.exitCode = 1 })
