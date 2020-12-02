var fs = require("fs");
var path = require("path");

/**
 * @type {import('../../lib/interfaces').DockerLanguageDef}
 */
module.exports = {
  setup: function (work_dir, file_content, cb) {
    var filePath = path.resolve(work_dir, 'main.sh');
    fs.writeFileSync(filePath, file_content);
    cb(filePath);
  },
  getExecuteArgs: function (file_path) {
    return {
      path: 'bash',
      args: [file_path],
      opts: {}
    }
  }
}