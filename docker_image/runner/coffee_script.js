var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb) {
    var filePath = path.resolve(work_dir, 'main.coffee');
    fs.writeFileSync(filePath, file_content);
    cb(filePath);
  },
  execute: function (file_path, cb) {
    var child = child_process.spawn('coffee', [file_path], {cwd: path.dirname(file_path)});
    cb(child);
  },
  getExecuteArgs: function (file_path, cb) {
    return {
      path: 'coffee',
      args: [file_path],
      opts: {}
    }
  }
}