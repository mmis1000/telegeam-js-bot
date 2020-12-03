var fs = require("fs");
var path = require("path");

/**
 * @type {import('../../lib/interfaces').DockerLanguageDef}
 */
module.exports = {
  setup: function (work_dir, file_content, cb) {
    var filePath = path.resolve(work_dir, 'Hello.swift');
    fs.writeFileSync(filePath, file_content);
    cb(filePath);
  },
  getExecuteArgs: function (file_path) {
    return {
      path: 'swift',
      args: [file_path],
      opts: {}
    }
  }
}