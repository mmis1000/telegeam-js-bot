var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'main.c');
    var binPath = path.resolve(work_dir, 'main');
    fs.writeFileSync(filePath, file_content);
    
    var child = child_process.spawn('gcc', [filePath, '-o', binPath], {stdio: 'pipe', cwd: path.dirname(filePath)});
    child.stdout.on('data', con.log)
    child.stderr.on('data', con.error)
    child.on('exit', function (code, sig) {
      if (code !== 0 || sig != null) {
        con.log('compiler exit with code ' + code + ' and signal ' + sig);
        con.exit({code: code, signal: sig});
        return
      }
      fs.chmodSync(binPath, 0777)
      cb(binPath)
    })
  },
  execute: function (file_path, cb, con) {
    try {
      var child = child_process.spawn(file_path, {cwd: path.dirname(file_path)});
    } catch (e) {
      return con.error(e.stack || e.toString());
    }
    cb(child);
  },
  getExecuteArgs: function (file_path, cb) {
    return {
      path: file_path,
      args: [],
      opts: {}
    }
  }
}