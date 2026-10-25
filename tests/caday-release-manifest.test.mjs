import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../docs/releases/20261025-caday-release-manifest.json', import.meta.url)))

test('the teaching schedule release is eight ordered migrations', () => {
  assert.equal(manifest.apply_with, 'scripts/apply-caday-release-migrations.mjs')
  assert.equal(manifest.forbidden_apply, 'supabase db push')
  assert.equal(manifest.baseline_ledger_count, 265)
  assert.equal(manifest.expected_ledger_count, 273)
  assert.deepEqual(manifest.migrations.map(entry => entry.version), [
    '20261023163000',
    '20261024002601',
    '20261024010000',
    '20261024020000',
    '20261024030000',
    '20261024040000',
    '20261024050000',
    '20261025013000',
  ])
  assert.deepEqual(manifest.prerequisites.must_exist, [
    '20260923040000',
    '20261021112000',
    '20261022183829',
    '20261023163944',
  ])
  assert.ok(manifest.prerequisites.must_be_absent.includes('20261022182651'))
  for (const version of manifest.prerequisites.already_recorded_do_not_rerun) {
    assert.equal(manifest.migrations.some(entry => entry.version === version), false)
  }
})

test('each manifest checksum matches the migration file', () => {
  for (const entry of manifest.migrations) {
    const bytes = readFileSync(new URL(`../${entry.file}`, import.meta.url))
    assert.equal(bytes.length, entry.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    assert.equal(entry.order, manifest.migrations.indexOf(entry) + 1)
  }
})
