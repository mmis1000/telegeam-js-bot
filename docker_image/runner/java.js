var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = {
  setup: function (work_dir, file_content, cb, con) {
    var className = (/public\s+class\s+([A-Z][A-Za-z0-9]*)/).exec(file_content);
    if (!className) throw new Error('cannot find entry class name in ' + file_content);
    className = className[1];
    
    var filePath = path.resolve(work_dir, className + '.java');
    var binPath = path.resolve(work_dir, className);
    fs.writeFileSync(filePath, file_content);
    // console.log('g++', [filePath, '-o', binPath]);
    try {
      child_process.execFileSync('javac', ['-d', work_dir, path.basename(filePath)], {stdio: 'pipe', cwd: path.dirname(filePath)})
    } catch (e) {
      return con.error(e.stack || e.toString());
    }
    cb(binPath);
  },
  execute: function (file_path, cb, con) {
    var child = child_process.spawn('java', [path.basename(file_path)], {cwd: path.dirname(file_path)});
    cb(child);
  }
}