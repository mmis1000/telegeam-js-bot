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
        runnerList = files
        .filter(function (name) {
            return !!name.match(/\.json$/i);
        })
        .map(function (name) {
            return require(path.resolve('./docker_image/test', name));
        })
        runnerList.forEach(function (data) {
            console.log(data.type + ' - run ' + data.type + ' snippet');
            console.log(data.type + '_debug - run ' + data.type + ' snippet with debug output');
            console.log(data.type + '_hello - run ' + data.type + '\'s Hello, World! program.');
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

function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}   
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;");
}

api.on('message', function(message) {
    // message is the parsed JSON data from telegram message
    // query is the parsed JSON data from telegram inline query
    console.log('got message');
    console.log(message);
    
    // message.text is the text user sent (if there is)
    var text = message.text;
    
    if (message.text != undefined && message.text.match(/\/start(@[^\s]+)?$/)) {
        
        var additionOptions = {
            reply_to_message_id: message.message_id
        }
        api.sendMessage(message.chat.id, `
Hello, I am ${botInfo.first_name} 
You could run some code snippet with /[you favorite language]
Or run it with /[you favorite language]_debug to see debug message
Or run /[you favorite language]_hello to view hello world example
        `, 0, additionOptions);
    }
    
    if (message.text != undefined && message.text.match(/^\/[a-z0-9_]+(@[^\s]+)?/)) {
        
        var additionOptions = {
            reply_to_message_id: message.message_id
        }
        
        var language = (/^\/([a-z0-9_]+)(?:@[^\s]+)?(?: |\r|\n|$)/).exec(message.text)
        if (!language) return api.sendMessage(message.chat.id, 'something went wrong', 0, additionOptions);
        language = language[1];
        
        console.log(language);
        
        var isSilent = !language.match(/_d(ebug)?$/);
        language = language.replace(/_d(ebug)?$/, '');
        
        var isHelloWorld = !!language.match(/_h(ello)?$/);
        language = language.replace(/_h(ello)?$/, '');
        
        if (runnerList.filter(function (info) {
            return info.type === language
        }).length === 0) {
            return
        }
        
        var text = message.text.replace(/\/[a-z0-9_]+(@[^\s]+)?\s?/, '');
        if (isHelloWorld) {
            text = runnerList.filter(function (info) {
                return info.type === language
            })[0].program;
        }
        if (text.match(/^[\s\r\n]*$/)) {
            api.sendMessage(message.chat.id, 'you must provide something for me to run!', 0, additionOptions);
            return;
        }
     
        if (!isSilent || isHelloWorld) api.sendMessage(message.chat.id, 'running... \n<pre>' + escapeHtml(text) + '</pre>', 0, {
            parse_mode: 'HTML',
            reply_to_message_id: message.message_id
        });
        
        var bot_id = 'runner-' + guidGenerator()
        
        var p = spawn('docker', [
            'run', 
            '-i',
            '--rm', 
            '--net=none',
            '-m=64M',
            '--memory-swap=64M',
            '--pids-limit=32',
            '--cpuset-cpus=1',
            // '-u=ubuntu',
            '-h=localhost',
            '--name=' + bot_id,
            config.image_name,
            
            'node',
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
        
        var hasOutput = false;
        
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
                    hasOutput = true;
                    // console.log(stdoutWaitId, stdoutBuffer)
                    stdoutBuffer += cmd.text;
                    
                    while (stdoutBuffer.length > 1333) {
                        var part = stdoutBuffer.slice(0, 1333);
                        stdoutBuffer = stdoutBuffer.slice(1333);
                        api.sendMessage(message.chat.id, '<pre>' + escapeHtml(part) + '</pre>', 0, {
                            parse_mode: 'HTML',
                            reply_to_message_id: message.message_id
                        });
                    }
                    
                    clearTimeout(stdoutWaitId);
                    stdoutWaitId = setTimeout(function() {
                        // console.log('output stdout', stdoutBuffer)
                        api.sendMessage(message.chat.id, '<pre>' + escapeHtml(stdoutBuffer) + '</pre>', 0, {
                            parse_mode: 'HTML',
                            reply_to_message_id: message.message_id
                        });
                        stdoutBuffer = "";
                    }, 500)
                }
                if (cmd.type === 'log' && !isSilent) {
                    api.sendMessage(message.chat.id, cmd.text, 0, additionOptions);
                }
                if (cmd.type === 'stderr') {
                    hasOutput = true;
                    // console.log(stdoutWaitId, stdoutBuffer)
                    stderrBuffer += cmd.text;
                    
                    while (stdoutBuffer.length > 1333) {
                        var part = stderrBuffer.slice(0, 1333);
                        stderrBuffer = stderrBuffer.slice(1333);
                        api.sendMessage(message.chat.id, 'stderr: <pre>' + escapeHtml(part) + '</pre>', 0, {
                            parse_mode: 'HTML',
                            reply_to_message_id: message.message_id
                        });
                    }
                    
                    clearTimeout(stderrWaitId);
                    stderrWaitId = setTimeout(function() {
                        // console.log('output stderr', stdoutBuffer)
                        api.sendMessage(message.chat.id, 'stderr: <pre>' + escapeHtml(stderrBuffer) + '</pre>', 0, {
                            parse_mode: 'HTML',
                            reply_to_message_id: message.message_id
                        });
                        stderrBuffer = "";
                    }, 500)
                }
                if (cmd.type === 'throw' || cmd.type === 'error') {
                    api.sendMessage(message.chat.id, 'error: ' + cmd.text, 0, additionOptions);
                }
                if (cmd.type === 'status') {
                    if (cmd.text !== 'exited') {
                        api.sendChatAction(message.chat.id, 'typing');
                    }
                    console.log('status change: ' + cmd.text)
                }
                if (cmd.type === 'exit') {
                    try {
                        var res = JSON.parse(cmd.text);
                        if ((res.code !== 0 || res.signal != null) && isSilent) {
                            api.sendMessage(
                                message.chat.id, 
                                'program ended with code ' + res.code + ' and signal ' + res.signal, 
                                0, 
                                additionOptions);
                        } else if (!hasOutput) {
                            api.sendMessage(
                                message.chat.id, 
                                'program ended with code ' + res.code + ' and signal ' + res.signal + ' but doesn\'t has any output at all', 
                                0, 
                                additionOptions);
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            } catch (e) {
                console.error(e)
            }
        });
        
        p.on('exit', function () {
            p.exited = true;
            // ensure cleared
            child_process.execFile('docker', ['rm', '-f', bot_id], function (err ,stdout, stderr) {
                // console.log(err ,stdout, stderr)
            })
        })
        
        setTimeout(function () {
            if (!p.exited) {
                console.log('force killing conatner ' + bot_id);
                api.sendMessage(message.chat.id, 'killed due to timeout', 0, additionOptions);
                p.kill('SIGTERM');
                child_process.execFile('docker', ['rm', '-f', bot_id], function (err ,stdout, stderr) {
                    console.log(err ,stdout, stderr)
                })
            }
        }, 10000)
    }
    
})