var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb) {
    var filePath = path.resolve(work_dir, 'main.py');
    fs.writeFileSync(filePath, file_content);
    cb(filePath);
  },
  execute: function (file_path, cb) {
    var child = child_process.spawn('python3', [file_path]);
    cb(child);
  }
}