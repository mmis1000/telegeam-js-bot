import type { Engine, EngineRunner } from '../interfaces';
import type * as Config from '../../config';
import * as TelegramBot from 'node-telegram-bot-api'
import runner = require("../utils/docker-engine");
import { Runnable } from '../utils/runnable';
import c = require('../../docker_image/runner/c');

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
    let S4 = function () {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

// how long before the bot should just split the message
const MERGE_MESSAGE_LIMIT = 4000

// how long before the bot should just split the message
const LENGTH_LIMIT = 7800

const BEFORE_SEND_INTERVAL = 1 * 1000
// delay after it send ant message
const WAIT_INTERVAL = 2 * 1000
// delay after it receive 429 error
const WAIT_429_INTERVAL = 20 * 1000

type messageSnippet = {
    label?: string,
    message: string
}

type SendInfo = {
    type: 'text',
    message: string,
    sendOptions?: TelegramBot.SendMessageOptions,
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
} | {
    type: 'text-merged',
    messages: messageSnippet[],
    /** 
     * used only when it is sending instead of patching.
     * reply_mode will ignored, text will be encoded
     */
    sendOptions?: TelegramBot.SendMessageOptions,
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
} | {
    type: 'wait',
    length: number,
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
} | {
    // separate the group
    type: 'separate',
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
}

export class ManagerEngine {
    private engine: Engine
    private chatRooms: Map<number, import('../interfaces').EngineRunner> = new Map();
    private timeoutIdMap: WeakMap<import('../interfaces').EngineRunner, ReturnType<typeof setTimeout>> = new WeakMap()
    private messageQueues = new Map<number, Runnable<SendInfo>>()

    constructor(
        private runnerList: { type: string; program: string; }[],
        private api: TelegramBot,
        config: typeof Config
    ) {
        this.engine = runner.createEngine(guidGenerator(), config.engineOpts);
        this.engine.on('destroyed', () => {
            this.engine = runner.createEngine();
        })

    }

    getRunner(group: number) {
        if (this.messageQueues.has(group)) {
            return this.messageQueues.get(group)!
        }

        const countStrLength = (str: string) => {
            let length = 0
            for (let s of str) {
                if (s === '>' || s === '<') {
                    length += 4
                } else if (s === '&') {
                    length += 5
                } else {
                    length += s.length
                }
            }
            return length
        }

        const countLength = (arg: messageSnippet[]) => {
            let length = 0
            for (let seg of arg) {
                if (seg.label != null) {
                    // 11 => <pre></pre>
                    length += (11 + countStrLength(seg.label))
                }

                length += countStrLength(seg.message)
                // 2 => \n\n
                length += 2
            }
            return length
        }

        const formalizeMessage = (msgs: messageSnippet[]) => {
            const out = []
            let prev: messageSnippet | null = null

            for (let item of msgs) {
                if (prev != null && item.label === prev!.label) {
                    prev!.message += item.message
                } else {
                    const clone = {
                        ...item
                    }
                    out.push(clone)
                    prev = clone
                }
            }

            return out
        }

        const groupMessage = (msgs: messageSnippet[], limit: number) => {
            type labeledMessageGroup = {
                full: boolean,
                group: messageSnippet[]
            }
            const formatted = formalizeMessage(msgs)
            let currentLength = 0
            let grouped: labeledMessageGroup[] = []
            let currentGroup: labeledMessageGroup = {
                full: false,
                group: []
            }

            grouped.push(currentGroup)

            for (let item of formatted) {
                const newLength = countLength(formalizeMessage([...currentGroup.group, item]))
                if (newLength < limit - 100) {
                    // not full yet
                    currentLength = newLength
                    currentGroup.group.push(item)
                } else if (newLength < limit) {
                    // finish the group gracefully
                    currentLength = 0
                    currentGroup.group.push(item)
                    currentGroup.full = true
                    currentGroup = {
                        full: false,
                        group: []
                    }
                    grouped.push(currentGroup)
                } else {
                    // cut it

                    const overflow = newLength - limit

                    const captured: messageSnippet = {
                        label: item.label,
                        message: item.message.slice(0, item.message.length - overflow)
                    }

                    currentGroup.group.push(captured)

                    const remain: messageSnippet = {
                        label: item.label,
                        message: item.message.slice(-overflow)
                    }

                    formatted.push(remain)

                    currentLength = 0
                    currentGroup.full = true
                    currentGroup = {
                        full: false,
                        group: []
                    }
                    grouped.push(currentGroup)
                }
            }

            if (grouped[grouped.length - 1]!.group.length === 0) {
                grouped.pop()
            }

            return grouped
        }

        const formatMessage = (msgs: messageSnippet[]) => {
            let msg = ''
            for (let item of msgs) {
                if (item.label != null) {
                    msg += escapeHtml(item.label)
                }
                msg += '<pre>'
                msg += escapeHtml(item.message)
                msg += '</pre>'
            }
            return msg
        }

        let lastMergedMessage: messageSnippet[] = []
        let lastMergedMessageId: number | null = null
        let lastMergedMessageRepliedId: number | null = null

        const sleep = (time: number) => new Promise<void>((r) => {
            setTimeout(() => r(), time)
        })

        const runner = new Runnable<SendInfo>(async (task, queue) => {
            const handleError = (err: any) => {
                if (err instanceof (TelegramBot as any).errors.TelegramError) {
                    const response: import('http').IncomingMessage = err.response

                    // wait and redo
                    if (response.statusCode === 429) {
                        queue.unshift(task)
                        queue.unshift({
                            type: 'wait',
                            length: WAIT_429_INTERVAL
                        })
                    }
                } else {
                    ; (task.rejectFunctions ?? []).forEach(it => it(err))
                }
            }
            if (task.type === 'separate') {
                lastMergedMessage = []
                lastMergedMessageId = null
                lastMergedMessageRepliedId = null
            } if (task.type === 'wait') {
                return sleep(task.length)
            } else if (task.type === 'text-merged') {
                try {
                    let res: any
                    let first, remain

                    if (
                        lastMergedMessageId !== null &&
                        lastMergedMessageRepliedId !== null &&
                        lastMergedMessageRepliedId === task.sendOptions?.reply_to_message_id
                    ) {
                        ;[first, ...remain] = groupMessage([...lastMergedMessage, ...task.messages], MERGE_MESSAGE_LIMIT)
    
                        res = await this.api.editMessageText(formatMessage(first.group), {
                            chat_id: group,
                            message_id: lastMergedMessageId,
                            parse_mode: 'HTML'
                        })

                        if (first.full) {
                            lastMergedMessageId = null
                            lastMergedMessage = []
                        } else {
                            lastMergedMessage = first.group
                        }
                    } else {
                        ;[first, ...remain] = groupMessage([...task.messages], MERGE_MESSAGE_LIMIT)

                        res = await this.api.sendMessage(group, formatMessage(first.group), {
                            ...task.sendOptions,
                            parse_mode: 'HTML'
                        })

                        if (!first.full) {
                            lastMergedMessageRepliedId = task.sendOptions?.reply_to_message_id ?? null
                            lastMergedMessageId = res.message_id
                            lastMergedMessage = first.group
                        } else {
                            lastMergedMessageRepliedId = null
                            lastMergedMessageId = null
                            lastMergedMessage = []
                        }
                    }

                    if (remain.length > 0) {
                        await sleep(WAIT_INTERVAL)
                        queue.unshift({
                            // also pass the resolveFunctions...etc to it
                            ...task,
                            messages: remain.flatMap(i => i.group)
                        })
                    } else {
                        await sleep(WAIT_INTERVAL)
                            ; (task.resolveFunctions ?? []).forEach(it => it(res))
                    }
                } catch (err) {
                    handleError(err)
                }
            } else if (task.type === 'text') {
                try {
                    lastMergedMessage = []
                    lastMergedMessageId = null
                    const message = await this.api.sendMessage(group, task.message, task.sendOptions)
                    await sleep(WAIT_INTERVAL)
                        ; (task.resolveFunctions ?? []).forEach(it => it(message))
                } catch (err) {
                    handleError(err)
                }
            }
        })

        this.messageQueues.set(group, runner)
        return runner
    }

    sendLabeledMessage(group: number, text: string, label: string, options?: TelegramBot.SendMessageOptions) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(group).updateQueue(queue => {
                const last = queue[queue.length - 1]
                if (
                    last &&
                    last.type === 'text-merged' &&
                    last.sendOptions?.reply_to_message_id != null &&
                    last.sendOptions?.reply_to_message_id === options?.reply_to_message_id
                ) {
                    last.messages.push({
                        label: label,
                        message: text
                    })
                    last.resolveFunctions = last.resolveFunctions || []
                    last.resolveFunctions!.push(resolve)
                    last.rejectFunctions = last.rejectFunctions || []
                    last.rejectFunctions!.push(reject)
                } else {
                    queue.push({
                        type: 'text-merged',
                        messages: [{
                            label: label,
                            message: text
                        }],
                        sendOptions: options,
                        resolveFunctions: [resolve],
                        rejectFunctions: [reject]
                    })
                }
            })
        })
    }

    sendMessage(group: number, text: string, options?: TelegramBot.SendMessageOptions) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(group).updateQueue(queue => {
                queue.push({
                    type: 'text',
                    message: text,
                    sendOptions: options,
                    resolveFunctions: [resolve],
                    rejectFunctions: [reject]
                })
            })
        })
    }

    wait(group: number, time: number) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(group).updateQueue(queue => {
                queue.push({
                    type: 'wait',
                    length: time
                })
            })
        })
    }

    stopGroup(group: number) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(group).updateQueue(queue => {
                queue.push({
                    type: 'separate'
                })
            })
        })
    }

    hasInteractiveSession(roomId: number) {
        return this.chatRooms.has(roomId)
    }


    sendStdin(roomId: number, input: any) {
        this.stopGroup(roomId)
        const runner = this.chatRooms.get(roomId)
        if (runner) {
            runner.write(input)
        }
    }

    terminateStdin(roomId: number, message: TelegramBot.Message) {
        this.stopGroup(roomId)
        const runner = this.chatRooms.get(roomId)
        if (runner) {
            runner.write(null);
            this.scheduleKill(runner, message)
        }
    }

    scheduleKill(runner: EngineRunner, message: TelegramBot.Message) {
        if (this.timeoutIdMap.has(runner)) {
            return // already scheduled
        }

        this.timeoutIdMap.set(runner, setTimeout(() => {
            console.log('force killing runner ' + runner.id);
            this.sendMessage(message.chat.id, 'killed due to timeout').catch(catchHandle);
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
            this.sendMessage(message.chat.id, `process started in interactive mode
    use | to prefix your text to send it to stdin
    use || to terminate the stdin`, additionOptions).catch(catchHandle);
        }

        if (!isSilent || isHelloWorld) {
            this.sendMessage(message.chat.id, 'Running... \n<pre>' + escapeHtml(code) + '</pre>', {
                parse_mode: 'HTML',
                reply_to_message_id: message.message_id
            }).catch(catchHandle);
        }

        let outputLength = 0;
        let outputLimit = isInteractive ? Infinity : LENGTH_LIMIT;
        let truncated = false;

        this.stopGroup(message.chat.id)
        this.wait(message.chat.id, BEFORE_SEND_INTERVAL)

        runner.on('stdout', async (data) => {
            if (truncated) return;

            if (outputLength + data.text.length <= outputLimit) {
                outputLength += data.text.length

                this.sendLabeledMessage(message.chat.id, data.text, '', {
                    reply_to_message_id: message.message_id
                }).catch(catchHandle);
            } else {
                const text = data.text.slice(0, outputLimit - outputLength)
                outputLength = outputLimit
                truncated = true

                await this.sendLabeledMessage(message.chat.id, text, '', {
                    reply_to_message_id: message.message_id
                }).catch(catchHandle);

                this.sendLabeledMessage(message.chat.id, 'Some text was truncated because output is too long', 'Error: ', {
                    reply_to_message_id: message.message_id
                }).catch(catchHandle);
            }
        });

        runner.on('stderr', async (data) => {
            if (truncated) return;

            if (outputLength + data.text.length <= outputLimit) {
                outputLength += data.text.length

                this.sendLabeledMessage(message.chat.id, data.text, 'Stderr: ', {
                    reply_to_message_id: message.message_id
                }).catch(catchHandle);
            } else {
                const text = data.text.slice(0, outputLimit - outputLength)
                outputLength = outputLimit
                truncated = true

                await this.sendLabeledMessage(message.chat.id, text, 'Stderr: ', {
                    reply_to_message_id: message.message_id
                }).catch(catchHandle);

                this.sendLabeledMessage(message.chat.id, 'Some text was truncated because output is too long', 'Error: ', {
                    reply_to_message_id: message.message_id
                }).catch(catchHandle);
            }
        })

        runner.on('status', (data) => {
            if (data.text !== 'exited') {
                this.api.sendChatAction(message.chat.id, 'typing').catch(catchHandle);
            }
            console.log('status change: ' + data.text)
        });

        runner.on('throw', (data) => {
            this.sendMessage(message.chat.id, 'Error: ' + data.text, additionOptions).catch(catchHandle);
        });

        runner.on('error', (data) => {
            this.sendMessage(message.chat.id, 'Error: ' + data.text, additionOptions).catch(catchHandle);
        });

        if (!isInteractive) {
            this.scheduleKill(runner, message)
        }

        runner.on('exit', (data) => {
            const id = this.timeoutIdMap.get(runner)
            if (id) {
                clearTimeout(id);
            }

            if (isInteractive) {
                this.chatRooms.delete(message.chat.id);
            }

            try {
                let res = JSON.parse(data.text);

                if (!isSilent) {
                    if (res.time) {
                        this.sendMessage(
                            message.chat.id,
                            res.time.map(function (arr: string[]) {
                                return `${escapeHtml(arr[0])}: <code>${escapeHtml(arr[1])}</code>`;
                            }).join('\n'),
                            {
                                ...additionOptions,
                                parse_mode: 'HTML'
                            }
                        ).catch(catchHandle);
                    }
                }

                if (res.code !== 0 || res.signal != null || !isSilent) {
                    this.sendMessage(
                        message.chat.id,
                        'Program ended with code ' + res.code + ' and signal ' + res.signal,
                        additionOptions
                    ).catch(catchHandle);
                } else if (outputLength === 0) {
                    this.sendMessage(
                        message.chat.id,
                        'Program ended with code ' + res.code + ' and signal ' + res.signal + ' but doesn\'t has any output at all',
                        additionOptions
                    ).catch(catchHandle);
                }
            } catch (e) {
                console.error(e);
            }
        })

        if (!isSilent) {
            runner.on('log', (data) => {
                this.sendMessage(message.chat.id, 'Info: <code>' + escapeHtml(data.text) + '</code>', { ...additionOptions, parse_mode: 'HTML' }).catch(catchHandle);
            });
        }
    }
}