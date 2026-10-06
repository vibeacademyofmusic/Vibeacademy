"""Prepare a separate local Supabase project; never reset an existing project."""
import hashlib
import json
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parents[2]
target = pathlib.Path('/private/tmp/vibe-execution-20260930')
config = (root / 'supabase/config.toml').read_text()
config = config.replace('project_id = "vibe-academy-system"', 'project_id = "vibe-execution-20260930"')
config = config.replace('543', '563').replace('8083', '8683')
for section in ['analytics', 'edge_runtime', 'storage.vector']:
    config = config.replace(f'[{section}]\nenabled = true', f'[{section}]\nenabled = false')
destination = target / 'supabase'
destination.mkdir(parents=True, exist_ok=True)
existing = destination / 'config.toml'
if existing.exists() and existing.read_text() != config:
    raise SystemExit('Existing isolated configuration differs; refusing to overwrite')
existing.write_text(config)
for name in ['migrations', 'tests']:
    shutil.copytree(root / 'supabase' / name, destination / name, dirs_exist_ok=True)
shutil.copyfile(root / 'supabase/seed.sql', destination / 'seed.sql')
manifest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((root / 'supabase/migrations').glob('*.sql'))}
(target / 'migration-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Prepared {target}: {len(manifest)} migrations. No database was changed.')
