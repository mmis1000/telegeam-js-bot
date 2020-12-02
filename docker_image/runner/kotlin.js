var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

/**
 * @type {import('../../lib/interfaces').DockerLanguageDef}
 */
module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var filePath = path.resolve(work_dir, 'hello.kt');
    var binPath = path.resolve(work_dir, 'hello.jar');
    fs.writeFileSync(filePath, file_content);
    
    var child = child_process.spawn('kotlinc', [filePath, '-include-runtime', '-d', 'hello.jar'], {stdio: 'pipe', cwd: path.dirname(filePath)});
    child.stdout.on('data', con.log)
    child.stderr.on('data', con.error)
    child.on('exit', function (code, sig) {
      if (code !== 0 || sig != null) {
        con.log('compiler exit with code ' + code + ' and signal ' + sig);
        con.exit({code: code, signal: sig});
        return
      }
      fs.chmodSync(binPath, 0o777)
      cb(binPath)
    })
  },
  getExecuteArgs: function (file_path) {
    return {
      path: 'java',
      args: ['-jar', path.basename(file_path)],
      opts: {}
    }
  }
}