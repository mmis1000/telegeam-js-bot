const fs = require("fs");
const path = require("path");
const child_process = require("child_process");

fs.readdir('./test', function (err, names) {
    var JSONs = names.filter(function (name) {
        if (!name.match(/\.json$|\.templete$/)) console.error('found a file that neiter a templete and a json: ' + name)
        return /\.json/.test(name);
    })
    JSONs = JSONs.map(function (name) {
        return fs.readFileSync(path.resolve('./test', name));
    })
    JSONs = JSONs.join('')
    
    var child = child_process.spawn('docker', ['run', '-i', '--rm', '-u=ubuntu', 'mmis1000/lang-runner:0.0.2', 'node', 'executer.js'])
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.stdin.write(JSONs);
    child.stdin.end();
})