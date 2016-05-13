var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'main');
    fs.writeFileSync(filePath, file_content);
    con.log(JSON.stringify(fs.readFileSync(filePath).toString('utf8')));
    cb(filePath);
  },
  execute: function (file_path, cb, con) {
    // con.log(['clisp', [path.basename(file_path)], {cwd: path.dirname(file_path)}])
    var child = child_process.spawn('clisp', [path.basename(file_path)], {cwd: path.dirname(file_path)});
    child.stdin.end();
    cb(child);
  }
}