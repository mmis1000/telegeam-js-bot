const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const helper = require("./test-helper");

fs.readdir('./test', function (err, names) {
    var JSONFileNames = names.filter(function (name) {
        if (!name.match(/\.json$|\.template$/)) console.error('found a file that neiter a templete and a json: ' + name)
        return /\.json/.test(name);
    })
    var JSONTexts = JSONFileNames.map(function (name) {
        var str = fs.readFileSync(path.resolve('./test', name), { encoding: 'utf-8' });
        var parsed = JSON.parse(str);
        parsed.user = 'debian';
        return JSON.stringify(parsed) + '\n';
    })
    var JSONs = JSONTexts.join('')
    
    const image = (process.argv[2] ?? require("../config.js").image_name)

    console.log('test using image ' +  image);
    
    var child = child_process.spawn('docker', ['run', '-i', '--rm', image, 'node', '/app/executer.js'])
    helper.hookStdout(child.stdout);
    child.stderr.pipe(process.stderr);
    child.stdin.write(JSONs);
    child.stdin.end();
})