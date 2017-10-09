const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const helper = require("./test-helper");

var child = child_process.spawn('docker', [
    'run', 
    '-i', 
    '--rm',
    '--cap-add=sys_admin',
    require("../config.js").image_name, 'node', '/app/executer.js'])
// child.stdout.pipe(process.stdout);
helper.hookStdout(child.stdout);
child.stderr.pipe(process.stderr);

var script = `
    ps auxf;
    capsh --print;
    id -a;
    chown debian:debian /root
`

var id = 0;

var spawnInfo = {
    type: 'bash',
    user: 'debian',
    program: script,
    id: id
}

child.stdin.write(JSON.stringify(spawnInfo) + '\n');
child.stdin.end();