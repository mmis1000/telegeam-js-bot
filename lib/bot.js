const fs = require("fs");
const path = require("path");
const readline = require('readline');
const child_process = require("child_process");

var config = require("../config");
var TGAPI = require("./tgapi");
var api = new TGAPI(config.token)

var spawn = child_process.spawn;

var botInfo = null;

var runnerList = [];
(function () {
    fs.readdir('./docker_image/test', function (err, files) {
        if (err) {
            console.error(err.stack || err.toString());
            process.exit(-1)
        }
        runnerList = files.map(function (name) {
            if (!name.match(/\.json$/i)) return;
            return require(path.resolve('./docker_image/test', name));
        })
    })
} ());

api.getMe(function(err, data)
{
    if (err) console.error(err);
    console.log(data);
    botInfo = data;
    api.startPolling(40);
});

api.on('message', function(message) {
    // message is the parsed JSON data from telegram message
    // query is the parsed JSON data from telegram inline query
    console.log('got message');
    console.log(message);
    
    // message.text is the text user sent (if there is)
    var text = message.text;
    
    // if there is the text
    if (message.text != undefined && message.text.match(/\/[a-z0-9_]+(@[^\s]+)?( |\r|\n)+./)) {
        var language = (/\/([a-z0-9_]+)(?:@[^\s]+)?(?: |\r|\n)+./).exec(message.text)[1];
        
        console.log(language);
        
        var isSilent = !!language.match(/_s(ilent)?$/);
        language = language.replace(/_s(ilent)?$/, '')
        
        if (runnerList.filter(function (info) {
            return info.type === language
        }).length === 0) {
            return
        }
        
        var text = message.text.replace(/\/[a-z0-9_]+(@[^\s]+)?/, '');
        if (!isSilent) api.sendMessage(message.chat.id, 'running... ' + text);
        
        var p = spawn('docker', [
            'run', 
            '-i',
            '--rm', 
            '--net=none',
            '-m=50M',
            config.image_name,
            'nodejs',
            'executer.js'
        ]);
        p.stdin.write(JSON.stringify({
            type: language,
            program: text
        }) + '\n')
        p.stdin.end();
        
        
        const rl = readline.createInterface({
          input: p.stdout,
          output: fs.createWriteStream('/dev/null')
        });
        
        var stdoutWaitId = null;
        var stdoutBuffer = "";
        var stderrWaitId = null;
        var stderrBuffer = "";
        p.stderr.pipe(process.stderr, {end: false})
        p.stderr.on('end', function (argument) {
            p.stderr.unpipe(process.stderr)
        })
        rl.on('line', (cmd) => {
            try {
                cmd = JSON.parse(cmd);
                // console.log(cmd);
                if (cmd.type === 'stdout') {
                    // console.log(stdoutWaitId, stdoutBuffer)
                    stdoutBuffer += cmd.text;
                    clearTimeout(stdoutWaitId);
                    stdoutWaitId = setTimeout(function() {
                        // console.log('output stdout', stdoutBuffer)
                        api.sendMessage(message.chat.id, stdoutBuffer);
                        stdoutBuffer = "";
                    }, 500)
                }
                if (cmd.type === 'log' && !isSilent) {
                    api.sendMessage(message.chat.id, cmd.text);
                }
                if (cmd.type === 'stderr') {
                    // console.log(stdoutWaitId, stdoutBuffer)
                    stderrBuffer += cmd.text;
                    clearTimeout(stderrWaitId);
                    stderrWaitId = setTimeout(function() {
                        // console.log('output stderr', stdoutBuffer)
                        api.sendMessage(message.chat.id, "stderr: " + stderrBuffer);
                        stderrBuffer = "";
                    }, 500)
                }
                if (cmd.type === 'throw' || cmd.type === 'error') {
                    api.sendMessage(message.chat.id, 'error: ' + cmd.text);
                }
                if (cmd.type === 'status') {
                    console.log('status change: ' + cmd.text)
                }
            } catch (e) {
                console.error(e)
            }
        });
        /*
        p.stdout.setEncoding('utf8');
        p.stderr.setEncoding('utf8');
        p.stdout.on('data', function (text) {
            api.sendMessage(message.chat.id, 'stdout: ' + text);
        }).pipe(process.stdout)
        p.stderr.on('data', function (text) {
            api.sendMessage(message.chat.id, 'stderr: ' + text);
        }).pipe(process.stderr)*/
        p.on('exit', function () {
            p.exited = true;
        })
        
        setTimeout(function () {
            if (!p.exited) {
                api.sendMessage(message.chat.id, 'killed due to timeout');
                p.kill('SIGTERM')
            }
        }, 10000)
    }
    
})