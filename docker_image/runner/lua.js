var fs = require("fs");
var path = require("path");

/**
 * @type {import('../../lib/interfaces').DockerLanguageDef}
 */
module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'main.lua');
    fs.writeFileSync(filePath, file_content);
    con.log(JSON.stringify(fs.readFileSync(filePath).toString('utf8')));
    cb(filePath);
  },
  getExecuteArgs: function (file_path) {
    return {
      path: 'lua5.3',
      args: [path.basename(file_path)],
      opts: {}
    }
  }
}