var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'main.lua');
    fs.writeFileSync(filePath, file_content);
    con.log(JSON.stringify(fs.readFileSync(filePath).toString('utf8')));
    cb(filePath);
  },
  execute: function (file_path, cb, con) {
    // con.log(['clisp', [path.basename(file_path)], {cwd: path.dirname(file_path)}])
    var child = child_process.spawn('lua5.3', [path.basename(file_path)], {cwd: path.dirname(file_path)});
    child.stdin.end();
    cb(child);
  },
  getExecuteArgs: function (file_path, cb) {
    return {
      path: 'lua5.3',
      args: [path.basename(file_path)],
      opts: {}
    }
  }
}