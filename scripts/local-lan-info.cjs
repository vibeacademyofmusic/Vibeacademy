const { execFileSync } = require('node:child_process')

function interfaceAddress(name) {
  try {
    return execFileSync('ipconfig', ['getifaddr', name], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const lan = interfaceAddress('en0') || interfaceAddress('en1')

if (!lan || lan === '127.0.0.1' || lan === 'localhost') {
  console.error('FAIL: LAN IP not found')
  process.exit(1)
}

console.log('VIBE APP:')
console.log(`http://${lan}:3000`)
console.log('')
console.log('ADMIN ATTENDANCE:')
console.log(`http://${lan}:3000/admin/hr/attendance`)
console.log('')
console.log('SUPABASE API:')
console.log(`http://${lan}:54321`)
console.log('')
console.log('Phone and Mac must be on the same non-isolated Wi-Fi.')
