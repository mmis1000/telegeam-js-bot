var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb) {
    var filePath = path.resolve(work_dir, 'main.c');
    var binPath = path.resolve(work_dir, 'main');
    fs.writeFileSync(filePath, file_content);
    // console.log('g++', [filePath, '-o', binPath]);
    try {
      child_process.execFileSync('gcc', [filePath, '-o', binPath], {stdio: 'pipe'})
    } catch (e) {
      con.throw(e.stack || e.toString());
    }
    fs.chmodSync(binPath, 0777)
    cb(binPath);
  },
  execute: function (file_path, cb) {
    try {
      var child = child_process.spawn(file_path, {cwd: path.dirname(file_path)});
    } catch (e) {
      return con.error(e.stack || e.toString());
    }
    cb(child);
  }
}