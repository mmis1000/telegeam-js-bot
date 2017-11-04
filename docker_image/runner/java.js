var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var className = (/public\s+class\s+([A-Z][A-Za-z0-9]*)/).exec(file_content);
    if (!className) {
      con.error(Error('cannot find entry class name in the code, is there anything like "public class YouurClassName" ?'));
      return con.exit({code: null, signal: null});
    }
    
    className = className[1];
    
    var filePath = path.resolve(work_dir, className + '.java');
    var binPath = path.resolve(work_dir, className);
    fs.writeFileSync(filePath, file_content);
    
    var child = child_process.spawn('javac', ['-d', work_dir, path.basename(filePath)], {stdio: 'pipe', cwd: path.dirname(filePath)});
    child.stdout.on('data', con.log)
    child.stderr.on('data', con.error)
    child.on('exit', function (code, sig) {
      if (code !== 0 || sig != null) {
        con.log('compiler exit with code ' + code + ' and signal ' + sig);
        con.exit({code: code, signal: sig});
        return
      }
      cb(binPath)
    })
  },
  getExecuteArgs: function (file_path, cb) {
    return {
      path: 'java',
      args: [path.basename(file_path)],
      opts: {}
    }
  }
}