var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

/**
 * @type {import('../../lib/interfaces').DockerLanguageDef}
 */
module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var classNameArr = (/object\s+([A-Z][A-Za-z0-9]*)/).exec(file_content);
    if (!classNameArr) {
      con.error(Error('cannot find entry class name in ' + file_content));
      return con.exit({code: null, signal: null});
    }
    
    var className = classNameArr[1];
    
    var filePath = path.resolve(work_dir, className + '.scala');
    var binPath = path.resolve(work_dir, className + '.class');
    fs.writeFileSync(filePath, file_content);
    
    var child = child_process.spawn('scalac', [path.basename(filePath)], {stdio: 'pipe', cwd: path.dirname(filePath)});
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
  getExecuteArgs: function (file_path) {
    return {
      path: 'scala',
      args: [path.basename(file_path).replace(/\.class$/, '')],
      opts: {cwd: path.dirname(file_path)}
    }
  }
}