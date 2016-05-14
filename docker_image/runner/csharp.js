var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'main.cs');
    var binPath = path.resolve(work_dir, 'main.exe');
    fs.writeFileSync(filePath, file_content);
    
    var child = child_process.spawn('mcs', [filePath], {stdio: 'pipe', cwd: path.dirname(filePath)});
    child.stdout.on('data', con.log)
    child.stderr.on('data', con.error)
    child.on('exit', function (code, sig) {
      if (code !== 0 || sig != null) {
        con.exit({code: code, signal: sig});
        con.log('compiler exit with code ' + code + ' and signal ' + sig)
        return
      }
      cb(binPath)
    })
  },
  execute: function (file_path, cb, con) {
    try {
      var child = child_process.spawn('mono', [file_path], {cwd: path.dirname(file_path)});
    } catch (e) {
      return con.error(e.stack || e.toString());
    }
    cb(child);
  }
}