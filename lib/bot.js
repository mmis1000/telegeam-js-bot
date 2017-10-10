const fs = require("fs");
const path = require("path");
const readline = require('readline');
const child_process = require("child_process");
const runner = require("./runner");

var config = require("../config");
// var TGAPI = require("./tgapi");
var TelegramBot = require('node-telegram-bot-api');
var api = new TelegramBot(config.token)

var engine = runner.createEngine();
engine.on('destroyed', function () {
    engine = runner.createEngine();
})

var spawn = child_process.spawn;

var botInfo = null;

var runnerList = [];
var maxTry = 3;
var coolDown = 60 * 1000; // +3 minute;

var chatRooms = new Map();

var quotas = {};
setInterval(function (argument) {
    var id;
    for (id in quotas) {
        quotas[id]--;
        console.log('[info] Renewing quota for user id ' + id + ', current quota left: ' + (maxTry - quotas[id]))
        if (quotas[id] === 0) {
            delete quotas[id];
        }
    }
}, coolDown)

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
        console.log(data.type + '_interactive - run ' + data.type + ' in interative mode');
    })
})

api.getMe()
.then(function (data) {
    console.log(data);
    botInfo = data;
    api.startPolling();
})
.catch(function (err) {
    console.error(err);
    process.exit(1);
});

function catchHandle(err) {
    console.error(err.stack);
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
    if (!message) return;
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
Currently supported: ${runnerList.map(function (i) {return i.type}).join(', ')}
        `, additionOptions).catch(catchHandle);
    }
    
    if (message.text != undefined && message.text.match(/^\/[a-z0-9_]+(@[^\s]+)?(\s|\r|\n|$)/)) {
        
        var additionOptions = {
            reply_to_message_id: message.message_id
        }
        
        var language = (/^\/([a-z0-9_]+)(?:@[^\s]+)?(?: |\r|\n|$)/).exec(message.text)
        if (!language) return api.sendMessage(message.chat.id, 'something went wrong', additionOptions).catch(catchHandle);
        language = language[1];
        
        console.log(language);
        
        var isSilent = !language.match(/_d(ebug)?$/);
        language = language.replace(/_d(ebug)?$/, '');
        
        var isInteractive = !!language.match(/_i(nteractive)?$/);
        language = language.replace(/_i(nteractive)?$/, '');
        
        var isHelloWorld = !!language.match(/_h(ello)?$/);
        language = language.replace(/_h(ello)?$/, '');
        
        if (runnerList.filter(function (info) {
            return info.type === language
        }).length === 0) {
            return;
        }
        
        if (isInteractive && chatRooms.has(message.chat.id)) {
            return api.sendMessage(
                message.chat.id, 
                'Please stop current interative runner first. (by using || to terminate)', 
                additionOptions
            ).catch(catchHandle);
        }
        
        var text = message.text.replace(/\/[a-z0-9_]+(@[^\s]+)?\s?/, '');
        if (isHelloWorld) {
            text = runnerList.filter(function (info) {
                return info.type === language
            })[0].program;
        }
        
        if (text.match(/^[\s\r\n]*$/)) {
            api.sendMessage(message.chat.id, 'you must provide something for me to run!', additionOptions).catch(catchHandle);
            return;
        }
        
        if (quotas[message.from.id] >= maxTry) {
            return api.sendMessage(message.chat.id, 'Sorry! You are out of your quota ( ' + maxTry + ' times / ' + maxTry * coolDown / 1000 + ' second ). Please retry later.', additionOptions).catch(catchHandle);
        }
        
        quotas[message.from.id] = quotas[message.from.id] || 0;
        quotas[message.from.id]++;
        
        var runner = engine.run({
            type: language,
            program: text,
            user: 'debian'
        })
        
        if (isInteractive) {
            chatRooms.set(message.chat.id, runner);
            api.sendMessage(message.chat.id, `process started in interative mode
use | to prefix your text to sed it to stdin
use || to terminate the stdin`, additionOptions).catch(catchHandle);
        }
        
        if (!isSilent || isHelloWorld) api.sendMessage(message.chat.id, 'running... \n<pre>' + escapeHtml(text) + '</pre>', {
            parse_mode: 'HTML',
            reply_to_message_id: message.message_id
        }).catch(catchHandle);
        
        var outputLength = 0;
        var outputLimit = 4096;
        var truncated = false;
        
        function output(api, text, prefix, flush) {
            var remainText = text;
            
            while (remainText.length > 3800 || (remainText && flush)) {
                var part = remainText.slice(0, 3800);
                remainText = remainText.slice(3800);
                
                if (outputLength < outputLimit) {
                    var max = outputLimit - outputLength;
                    part = part.slice(0, max);
                    outputLength += part.length;
                    
                    api.sendMessage(message.chat.id, prefix + '<pre>' + escapeHtml(part) + '</pre>', {
                        parse_mode: 'HTML',
                        reply_to_message_id: message.message_id
                    }).catch(catchHandle);
                } else {
                    remainText = '';
                    truncated = true;
                }
                
            }
            
            return remainText;
        }
        
        var stdoutBuffer = '';
        var stdoutWaitId = null;
        runner.on('stdout', function (data) {
            stdoutBuffer += data.text;
            stdoutBuffer = output(api, stdoutBuffer, '', false);
            if (stdoutBuffer && !stdoutWaitId) {
                stdoutWaitId = setTimeout(function () {
                    stdoutBuffer = output(api, stdoutBuffer, '', true);
                    stdoutWaitId = null;
                }, 1000)
            }
        });
        
        var stderrBuffer = '';
        var stderrWaitId = null;
        runner.on('stderr', function (data) {
            stderrBuffer += data.text;
            stderrBuffer = output(api, stderrBuffer, '', false);
            if (stderrBuffer && !stderrWaitId) {
                stderrWaitId = setTimeout(function () {
                    stderrBuffer = output(api, stderrBuffer, '', true);
                    stderrWaitId = null;
                }, 1000)
            }
        })
        
        runner.on('status', function(data) {
            if (data.text !== 'exited') {
                api.sendChatAction(message.chat.id, 'typing').catch(catchHandle);
            }
            console.log('status change: ' + data.text)
        });
        
        runner.on('throw', function(data) {
            api.sendMessage(message.chat.id, 'error: ' + data.text, additionOptions).catch(catchHandle);
        });
        
        runner.on('error', function(data) {
            api.sendMessage(message.chat.id, 'error: ' + data.text, additionOptions).catch(catchHandle);
        });
        
        if (!isInteractive) {
            runner.timeoutKillId = setTimeout(function () {
                console.log('force killing runner ' + runner.id);
                api.sendMessage(message.chat.id, 'killed due to timeout', additionOptions).catch(catchHandle);
                runner.kill('SIGKILL');
            }, 10000)
        }
        
        runner.on('exit', function (data) {
            clearTimeout(runner.timeoutKillId);
            
            if (isInteractive) {
                chatRooms.delete(message.chat.id);
            }
            
            try {
                var res = JSON.parse(data.text);
                
                if (!isSilent) {
                    api.sendMessage(
                        message.chat.id, 
                        res.time.map(function (arr) {
                            return arr[0] + ': ' + arr[1];
                        }).join('\n'), 
                        additionOptions
                    ).catch(catchHandle);
                }
                
                if (res.code !== 0 || res.signal != null || !isSilent) {
                    api.sendMessage(
                        message.chat.id, 
                        'program ended with code ' + res.code + ' and signal ' + res.signal, 
                        additionOptions
                    ).catch(catchHandle);
                } else if (outputLength === 0) {
                    api.sendMessage(
                        message.chat.id, 
                        'program ended with code ' + res.code + ' and signal ' + res.signal + ' but doesn\'t has any output at all', 
                        additionOptions
                    ).catch(catchHandle);
                }
            } catch (e) {
                console.error(e);
            }
        })
        
        if (!isSilent) {
            runner.on('log', function(data) {
                api.sendMessage(message.chat.id, 'info: ' + data.text, additionOptions).catch(catchHandle);
            });
        }
        
        /*
        if (!isSilent || isHelloWorld) api.sendMessage(message.chat.id, 'running... \n<pre>' + escapeHtml(text) + '</pre>', {
            parse_mode: 'HTML',
            reply_to_message_id: message.message_id
        }).catch(catchHandle);
        
        var bot_id = 'runner-' + guidGenerator()
        
        var p = createRunner(bot_id);
        
        p.stdin.write(JSON.stringify({
            type: language,
            program: text,
            user: 'debian'
        }) + '\n');
        
        p.stdin.end();
        
        
        const rl = readline.createInterface({
          input: p.stdout
        });
        
        var hasOutput = false;
        
        var stdoutWaitId = null;
        var stdoutBuffer = "";
        var stderrWaitId = null;
        var stderrBuffer = "";
        
        
        var outputLength = 0;
        var outputLimit = 4096;
        
        p.stderr.pipe(process.stderr, {end: false})
        p.stderr.on('end', function () {
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
                        
                        if (outputLength < outputLimit) {
                            api.sendMessage(message.chat.id, '<pre>' + escapeHtml(part) + '</pre>', {
                                parse_mode: 'HTML',
                                reply_to_message_id: message.message_id
                            }).catch(catchHandle);
                        }
                        outputLength += part.length;
                    }
                    
                    clearTimeout(stdoutWaitId);
                    stdoutWaitId = setTimeout(function() {
                        // console.log('output stdout', stdoutBuffer)
                        if (outputLength < outputLimit) {
                            api.sendMessage(message.chat.id, '<pre>' + escapeHtml(stdoutBuffer) + '</pre>', {
                                parse_mode: 'HTML',
                                reply_to_message_id: message.message_id
                            }).catch(catchHandle);
                        }
                        outputLength += stdoutBuffer.length;
                        stdoutBuffer = "";
                    }, 500)
                }
                if (cmd.type === 'log' && !isSilent) {
                    api.sendMessage(message.chat.id, cmd.text, additionOptions).catch(catchHandle);
                }
                if (cmd.type === 'stderr') {
                    hasOutput = true;
                    // console.log(stdoutWaitId, stdoutBuffer)
                    stderrBuffer += cmd.text;
                    
                    while (stdoutBuffer.length > 1333) {
                        var part = stderrBuffer.slice(0, 1333);
                        stderrBuffer = stderrBuffer.slice(1333);
                        if (outputLength < outputLimit) {
                            api.sendMessage(message.chat.id, 'stderr: <pre>' + escapeHtml(part) + '</pre>', {
                                parse_mode: 'HTML',
                                reply_to_message_id: message.message_id
                            }).catch(catchHandle);
                        }
                        outputLength += part.length;
                    }
                    
                    clearTimeout(stderrWaitId);
                    stderrWaitId = setTimeout(function() {
                        // console.log('output stderr', stdoutBuffer)
                        if (outputLength < outputLimit) {
                            api.sendMessage(message.chat.id, 'stderr: <pre>' + escapeHtml(stderrBuffer) + '</pre>', {
                                parse_mode: 'HTML',
                                reply_to_message_id: message.message_id
                            }).catch(catchHandle);
                        }
                        outputLength += stderrBuffer.length;
                        stderrBuffer = "";
                    }, 500)
                }
                if (cmd.type === 'throw' || cmd.type === 'error') {
                    api.sendMessage(message.chat.id, 'error: ' + cmd.text, additionOptions).catch(catchHandle);
                }
                if (cmd.type === 'status') {
                    if (cmd.text !== 'exited') {
                        api.sendChatAction(message.chat.id, 'typing').catch(catchHandle);
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
                                additionOptions).catch(catchHandle);
                        } else if (!hasOutput) {
                            api.sendMessage(
                                message.chat.id, 
                                'program ended with code ' + res.code + ' and signal ' + res.signal + ' but doesn\'t has any output at all', 
                                additionOptions).catch(catchHandle);
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
            if (outputLength >= outputLimit) {
                api.sendMessage(message.chat.id, '[WARN] some message was ignored because the output is too long.', additionOptions).catch(catchHandle);
            }
            child_process.execFile('docker', ['rm', '-f', bot_id], function (err ,stdout, stderr) {
                // console.log(err ,stdout, stderr)
            })
        })
        
        setTimeout(function () {
            if (!p.exited) {
                console.log('force killing conatner ' + bot_id);
                api.sendMessage(message.chat.id, 'killed due to timeout', additionOptions).catch(catchHandle);
                p.kill('SIGTERM');
                child_process.execFile('docker', ['rm', '-f', bot_id], function (err ,stdout, stderr) {
                    console.log(err ,stdout, stderr)
                })
            }
        }, 10000)
        */
    }
    
    if (message.text != undefined && message.text.match(/^\|/) && chatRooms.has(message.chat.id)) {
        var runner = chatRooms.get(message.chat.id);
        
        if (message.text === '||') {
            runner.write(null);
            runner.timeoutKillId = setTimeout(function () {
                console.log('force killing runner ' + runner.id);
                api.sendMessage(message.chat.id, 'killed due to timeout', additionOptions).catch(catchHandle);
                runner.kill('SIGKILL');
            }, 10000)
        } else {
            runner.write(message.text.replace(/([^\n])$/, '$1\n').replace(/^\|/, ''));
        }
    }
    
})