import type { Engine, EngineRunner } from '../interfaces';
import type * as Config from '../../config';
import type * as TelegramBot from 'node-telegram-bot-api'
import runner = require("../utils/docker-engine");

function escapeHtml(unsafe: string) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;");
}

function catchHandle(err: { stack: any; }) {
    console.error(err.stack);
}

function guidGenerator() {
    let S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

export class ManagerEngine {
    private engine: Engine
    private chatRooms: Map<number, import('../interfaces').EngineRunner> = new Map();
    private timeoutIdMap:  WeakMap<import('../interfaces').EngineRunner, ReturnType<typeof setTimeout>> = new WeakMap()

    constructor (
        private runnerList: { type: string; program: string; }[],
        private api: TelegramBot,
        config: typeof Config
    ) {
        this.engine = runner.createEngine(guidGenerator(), config.engineOpts);
        this.engine.on('destroyed', () => {
            this.engine = runner.createEngine();
        })
        
    }

    hasInteractiveSession(roomId: number) {
        return this.chatRooms.has(roomId)
    }


    sendStdin(roomId: number, input: any) {
        const runner =  this.chatRooms.get(roomId)
        if (runner) {
            runner.write(input)
        }
    }

    terminateStdin(roomId: number, message: TelegramBot.Message) {
        const runner =  this.chatRooms.get(roomId)
        if (runner) {
            runner.write(null);
            this.scheduleKill(runner, message)
        }
    }

    scheduleKill (runner: EngineRunner,message: TelegramBot.Message) {
        if (this.timeoutIdMap.has(runner)) {
            return // already scheduled
        }

        this.timeoutIdMap.set(runner, setTimeout(() => {
            console.log('force killing runner ' + runner.id);
            this.api.sendMessage(message.chat.id, 'killed due to timeout').catch(catchHandle);
            runner.kill('SIGKILL');
        }, 30000))
    }

    executeCode(message: TelegramBot.Message, language: string, code: string, isHelloWorld: boolean, isSilent: boolean, isInteractive: boolean) {
        let additionOptions = {
            reply_to_message_id: message.message_id
        }
        
        if (isHelloWorld) {
            code = this.runnerList.filter(function (info) {
                return info.type === language
            })[0].program;
        }
        
        let runner = this.engine.run({
            type: language,
            program: code,
            user: 'debian'
        })
        
        if (isInteractive) {
            this.chatRooms.set(message.chat.id, runner);
            this.api.sendMessage(message.chat.id, `process started in interactive mode
    use | to prefix your text to send it to stdin
    use || to terminate the stdin`, additionOptions).catch(catchHandle);
        }
        
        if (!isSilent || isHelloWorld) this.api.sendMessage(message.chat.id, 'running... \n<pre>' + escapeHtml(code) + '</pre>', {
            parse_mode: 'HTML',
            reply_to_message_id: message.message_id
        }).catch(catchHandle);
        
        let outputLength = 0;
        let outputLimit = isInteractive ? Infinity : 4096;
        let truncated = false;
    
        function output(api: TelegramBot, text: string, prefix: string, flush: boolean) {
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
        let stdoutWaitId: NodeJS.Timeout | null = null;
        runner.on('stdout', (data) => {
            stdoutBuffer += data.text;
            stdoutBuffer = output(this.api, stdoutBuffer, '', false);
            if (stdoutBuffer && !stdoutWaitId) {
                stdoutWaitId = setTimeout(() => {
                    stdoutBuffer = output(this.api, stdoutBuffer, '', true);
                    stdoutWaitId = null;
                }, 1000)
            }
        });
        
        let stderrBuffer = '';
        let stderrWaitId: NodeJS.Timeout | null = null;
        runner.on('stderr', (data) => {
            stderrBuffer += data.text;
            stderrBuffer = output(this.api, stderrBuffer, '', false);
            if (stderrBuffer && !stderrWaitId) {
                stderrWaitId = setTimeout(() => {
                    stderrBuffer = output(this.api, stderrBuffer, '', true);
                    stderrWaitId = null;
                }, 1000)
            }
        })
        
        runner.on('status', (data) => {
            if (data.text !== 'exited') {
                this.api.sendChatAction(message.chat.id, 'typing').catch(catchHandle);
            }
            console.log('status change: ' + data.text)
        });
        
        runner.on('throw', (data) => {
            this.api.sendMessage(message.chat.id, 'error: ' + data.text, additionOptions).catch(catchHandle);
        });
        
        runner.on('error', (data) => {
            this.api.sendMessage(message.chat.id, 'error: ' + data.text, additionOptions).catch(catchHandle);
        });
        
        if (!isInteractive) {
            this.scheduleKill(runner, message)
        }
        
        runner.on('exit', (data) => {
            const id = this.timeoutIdMap.get(runner)
            if (id) {
                clearTimeout(id);
            }
            
            if (stdoutWaitId) {
                clearTimeout(stdoutWaitId);
                stdoutBuffer = output(this.api, stdoutBuffer, '', true);
                stdoutWaitId = null;
            }
            
            if (stderrWaitId) {
                clearTimeout(stderrWaitId);
                stderrBuffer = output(this.api, stderrBuffer, '', true);
                stderrWaitId = null;
            }
            
            if (isInteractive) {
                this.chatRooms.delete(message.chat.id);
            }
            
            try {
                let res = JSON.parse(data.text);
                
                if (!isSilent) {
                    if (res.time) {
                        this.api.sendMessage(
                            message.chat.id, 
                            res.time.map(function (arr: string[]) {
                                return arr[0] + ': ' + arr[1];
                            }).join('\n'), 
                            additionOptions
                        ).catch(catchHandle);
                    }
                }
                
                if (res.code !== 0 || res.signal != null || !isSilent) {
                    this.api.sendMessage(
                        message.chat.id, 
                        'program ended with code ' + res.code + ' and signal ' + res.signal, 
                        additionOptions
                    ).catch(catchHandle);
                } else if (outputLength === 0) {
                    this.api.sendMessage(
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
            runner.on('log', (data) => {
                this.api.sendMessage(message.chat.id, 'info: ' + data.text, additionOptions).catch(catchHandle);
            });
        }
    }
}