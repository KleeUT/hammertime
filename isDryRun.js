const isMaster = require('./isMaster').isMaster;

module.exports.isDryRun = () => !isMaster();
