const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const helper = require("./test-helper");

var child = child_process.spawn('docker', ['run', '-i', '--rm', require("../config.js").image_name, 'node', '/app/executer.js'])
helper.hookStdout(child.stdout);
child.stderr.pipe(process.stderr);

var script = `
    console.log('test');
    process.stdin.pipe(process.stdout);
`

var id = 0;

var spawnInfo = {
    type: 'js',
    user: 'debian',
    program: script,
    id: id
}

child.stdin.write(JSON.stringify(spawnInfo) + '\n');

var stdin = 'echo'

var stdinInfo = {
    action: 'write',
    stdin: stdin,
    id: id
}

child.stdin.write(JSON.stringify(stdinInfo) + '\n');

var killInfo = {
    action: 'kill',
    id: id,
    signal: 'SIGTERM'
}

setTimeout(function () {
    child.stdin.write(JSON.stringify(killInfo) + '\n');
    child.stdin.end();
}, 5000)