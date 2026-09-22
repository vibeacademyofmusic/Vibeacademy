const fs = require('node:fs')
const path = require('node:path')

function resolveModule(fromFile, specifier, extensionOrder = ['tsx', 'ts']) {
  const target = specifier.startsWith('@/')
    ? path.resolve(specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier)
  const candidates = ['tsx', 'ts'].map(extension => path.join(target, 'index.' + extension))
  for (const extension of extensionOrder) candidates.push(target + '.' + extension)
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || candidates.at(-1)
}

module.exports = { resolveModule }
