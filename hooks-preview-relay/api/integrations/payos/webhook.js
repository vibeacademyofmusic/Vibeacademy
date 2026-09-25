const { handleNodeRequest } = require('../../../handler.cjs')

module.exports = (req, res) => handleNodeRequest(req, res)
module.exports.config = { api: { bodyParser: false } }
