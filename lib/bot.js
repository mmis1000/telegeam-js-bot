// @ts-check
const fs = require("fs");
const path = require("path");
const runner = require("./runner");

const config = require("../config");
const TelegramBot = require('node-telegram-bot-api');
const request = require('request');

function guidGenerator() {
    let S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

let api = new TelegramBot(config.token)

let engine = runner.createEngine(guidGenerator(), config.engineOpts);
engine.on('destroyed', function () {
    engine = runner.createEngine();
})

/** @type {TelegramBot.User | null} */
let botInfo = null;

/**
 * @type {{ type: string, program: string }[]}
 */
let runnerList = [];
let maxTry = 3;
let coolDown = 60 * 1000; // +3 minute;

let chatRooms = new Map();

/**
 * @type {Record<string, number>}
 */
let quotas = {};
setInterval(function (argument) {
    let id;
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
    
    console.log('pastebin - run code snippet from pastebin');
    console.log('pastebin_debug - run code snippet from pastebin with debug output');
    console.log('pastebin_interactive - run code snippet from pastebin in interative mode');
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

/**
 * @param {{ stack: any; }} err
 */
function catchHandle(err) {
    console.error(err.stack);
}
/**
 * @param {string} unsafe
 */
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
    if (!message.from) return;
    if (!botInfo) return
    console.log('got message');
    console.log(message);

    const userFrom = message.from

    /** @type {TelegramBot.SendMessageOptions | undefined} */
    let additionOptions
    // message.text is the text user sent (if there is)
    let text = message.text;
    
    if (message.text != undefined && message.text.match(/\/start(@[^\s]+)?$/)) {
        
        let additionOptions = {
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
    
    if (message.text != undefined && message.text.match(/^\/pastebin(_i(nteractive)?)?(_d(ebug)?)?(@[^\s]+)?(\s|\r|\n|$)/)) {
        let temp = message.text.split(/\s|\r?\n/g);
        
        if (temp.length != 3) {
            return api.sendMessage(message.chat.id, `Usage: /pastebin(_interactive)?(_debug)? <bin id> <language>
This command will try to fetch the content of the pastebin paste and execute it.
`, additionOptions).catch(catchHandle);
        }
        
        temp[1] = temp[1].replace(/^https?:\/\/pastebin\.com\//, '');
        
        let language = temp[2];
        
        temp[0] = temp[0].replace(/(@[^\s]+)$/, '')
        let isSilent = !temp[0].match(/_d(ebug)?$/);
        temp[0] = temp[0].replace(/_d(ebug)?$/, '');
        let isInteractive = !!temp[0].match(/_i(nteractive)?$/);
        
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
        
        request('https://pastebin.com/raw/' + temp[1], function (error, response, body) {
            if (error) {
                return api.sendMessage(message.chat.id, error.message || error.stack, additionOptions).catch(catchHandle);
            }
            
            if (response.statusCode !== 200) {
                return api.sendMessage(message.chat.id, `Bad status code: ${response.statusCode}`, additionOptions).catch(catchHandle);
            }
            
            if (quotas[userFrom.id] >= maxTry) {
                return api.sendMessage(message.chat.id, 'Sorry! You are out of your quota ( ' + maxTry + ' times / ' + maxTry * coolDown / 1000 + ' second ). Please retry later.', additionOptions).catch(catchHandle);
            }
            
            quotas[userFrom.id] = quotas[userFrom.id] || 0;
            quotas[userFrom.id]++;
        
            executeCode(api, message, language, body, false, isSilent, isInteractive);
        })
        
        return;
    }
    
    if (message.text != undefined && message.text.match(/^\/[a-z0-9_]+(@[^\s]+)?(\s|\r|\n|$)/)) {
        additionOptions = {
            reply_to_message_id: message.message_id
        }

        const options = parseCommand(message.text)

        if (options == null) return

        let { isInteractive, isHelloWorld, isSilent, language, text } = options

        if (isInteractive && chatRooms.has(message.chat.id)) {
            return api.sendMessage(
                message.chat.id, 
                'Please stop current interative runner first. (by using || to terminate)', 
                additionOptions
            ).catch(catchHandle);
        }
        
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
        
        return executeCode(api, message, language, text, isHelloWorld, isSilent, isInteractive);
    }
    
    if (message.text != undefined && message.text.match(/^\|/) && chatRooms.has(message.chat.id)) {
        let runner = chatRooms.get(message.chat.id);
        
        if (message.text === '||') {
            runner.write(null);
            runner.timeoutKillId = setTimeout(function () {
                console.log('force killing runner ' + runner.id);
                api.sendMessage(message.chat.id, 'killed due to timeout', additionOptions).catch(catchHandle);
                runner.kill('SIGKILL');
            }, 30000)
        } else {
            runner.write(message.text.replace(/([^\n])$/, '$1\n').replace(/^\|/, ''));
        }
    }
})

/**
 * 
 * @param {string} text 
 */
function parseCommand (text) {
    let languageArr = (/^\/([a-z0-9_]+)(?:@[^\s]+)?(?: |\r|\n|$)/).exec(text)

    if (!languageArr) {
        return null
    }

    let language = languageArr[1];
    
    console.log(language);
    
    let isSilent = !language.match(/_d(ebug)?$/);
    language = language.replace(/_d(ebug)?$/, '');
    
    let isInteractive = !!language.match(/_i(nteractive)?$/);
    language = language.replace(/_i(nteractive)?$/, '');
    
    let isHelloWorld = !!language.match(/_h(ello)?$/);
    language = language.replace(/_h(ello)?$/, '');
    
    if (!runnerList.find(info => info.type === language)) {
        return null
    }

    let commandText = text.replace(/\/[a-z0-9_]+(@[^\s]+)?\s?/, '');

    return {
        text: commandText,
        language,
        isSilent,
        isInteractive,
        isHelloWorld
    }
}

/**
 * @type {WeakMap<import('./interfaces').EngineRunner, ReturnType<typeof setTimeout>>}
 */
const timeoutIdMap = new WeakMap()

/**
 * @param {TelegramBot} api
 * @param {TelegramBot.Message} message
 * @param {string} language
 * @param {string} code
 * @param {boolean} isHelloWorld
 * @param {boolean} isSilent
 * @param {boolean} isInteractive
 */
function executeCode(api, message, language, code, isHelloWorld, isSilent, isInteractive) {
    let additionOptions = {
        reply_to_message_id: message.message_id
    }
    
    if (isHelloWorld) {
        code = runnerList.filter(function (info) {
            return info.type === language
        })[0].program;
    }
    
    let runner = engine.run({
        type: language,
        program: code,
        user: 'debian'
    })
    
    if (isInteractive) {
        chatRooms.set(message.chat.id, runner);
        api.sendMessage(message.chat.id, `process started in interative mode
use | to prefix your text to send it to stdin
use || to terminate the stdin`, additionOptions).catch(catchHandle);
    }
    
    if (!isSilent || isHelloWorld) api.sendMessage(message.chat.id, 'running... \n<pre>' + escapeHtml(code) + '</pre>', {
        parse_mode: 'HTML',
        reply_to_message_id: message.message_id
    }).catch(catchHandle);
    
    let outputLength = 0;
    let outputLimit = isInteractive ? Infinity : 4096;
    let truncated = false;
    
    /**
     * @param {{ sendMessage: (arg0: any, arg1: string, arg2: { parse_mode: 'Markdown' | 'MarkdownV2' | 'HTML' | undefined; reply_to_message_id: any; }) => Promise<any>; }} api
     * @param {string} text
     * @param {string} prefix
     * @param {boolean} flush
     */
    function output(api, text, prefix, flush) {
        let remainText = text;
        
        while (remainText.length > 3800 || (remainText && flush)) {
            let part = remainText.slice(0, 3800);
            remainText = remainText.slice(3800);
            
            if (outputLength < outputLimit) {
                let max = outputLimit - outputLength;
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
    
    let stdoutBuffer = '';
    /** @type {NodeJS.Timeout | null} */
    let stdoutWaitId = null;
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
    
    let stderrBuffer = '';
    /** @type {NodeJS.Timeout | null} */
    let stderrWaitId = null;
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
        timeoutIdMap.set(runner, setTimeout(function () {
            console.log('force killing runner ' + runner.id);
            api.sendMessage(message.chat.id, 'killed due to timeout', additionOptions).catch(catchHandle);
            runner.kill('SIGKILL');
        }, 30000))
    }
    
    runner.on('exit', function (data) {
        const id = timeoutIdMap.get(runner)
        if (!id) throw new Error('bad state')
        clearTimeout(id);
        
        if (stdoutWaitId) {
            clearTimeout(stdoutWaitId);
            stdoutBuffer = output(api, stdoutBuffer, '', true);
            stdoutWaitId = null;
        }
        
        if (stderrWaitId) {
            clearTimeout(stderrWaitId);
            stderrBuffer = output(api, stderrBuffer, '', true);
            stderrWaitId = null;
        }
        
        if (isInteractive) {
            chatRooms.delete(message.chat.id);
        }
        
        try {
            let res = JSON.parse(data.text);
            
            if (!isSilent) {
                if (res.time) {
                    api.sendMessage(
                        message.chat.id, 
                        res.time.map(/**
                         * @param {string[]} arr
                         */function (arr) {
                            return arr[0] + ': ' + arr[1];
                        }).join('\n'), 
                        additionOptions
                    ).catch(catchHandle);
                }
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
}