var fs = require("fs");
var path = require("path");

/**
 * @type {import('../../lib/interfaces').DockerLanguageDef}
 */
module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'main.lisp');
    fs.writeFileSync(filePath, file_content);
    con.log(JSON.stringify(fs.readFileSync(filePath).toString('utf8')));
    cb(filePath);
  },
  getExecuteArgs: function (file_path) {
    return {
      path: 'sbcl',
      args: ['--script', file_path],
      opts: {}
    }
  }
}