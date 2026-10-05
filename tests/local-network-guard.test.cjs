const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')

test('local test preload rejects provider fetch and raw TCP without network access', () => {
  const result = spawnSync(process.execPath, ['--require', './scripts/pilot/local-network-guard.cjs', '-e', `
    const assert = require('node:assert/strict');
    const net = require('node:net');
    (async () => {
      for (const url of ['https://business.openapi.zalo.me/message/template', 'https://api-merchant.payos.vn/v2/payment-requests', 'http://localhost.attacker.test/']) {
        await assert.rejects(fetch(url), {code: 'VIBE_LOCAL_EXTERNAL_NETWORK_BLOCKED'});
      }
      assert.throws(() => net.connect({host:'example.test',port:443}), {code:'VIBE_LOCAL_EXTERNAL_NETWORK_BLOCKED'});
      const server = require('node:http').createServer((req,res) => res.end('local'));
      await new Promise(r => server.listen(0,'127.0.0.1',r));
      assert.equal(await (await fetch('http://127.0.0.1:'+server.address().port)).text(),'local');
      server.close();
    })().catch(e => { console.error(e); process.exitCode=1 });
  `], { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
})
