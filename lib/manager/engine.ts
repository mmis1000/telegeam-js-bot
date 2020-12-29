import type { Engine, EngineRunner, EngineRunnerParsedExitData } from '../interfaces';
import type * as Config from '../../config';
import * as TelegramBot from 'node-telegram-bot-api'
import runner = require("../utils/docker-engine");
import { Runnable } from '../utils/runnable';
import { sleep } from '../utils/promise-utils';
import { formalizeMessage, formatMessage, groupMessage, MessageSnippet } from '../utils/text-group-utils';
import { findOrCreate } from '../utils/array-util';

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

const ONE_SHOT_TIMEOUT = 30000

// how long before the bot should just split the message
const MERGE_MESSAGE_LIMIT = 4000

// how long before the bot should just split the message
const LENGTH_LIMIT = 7800

// delay before send the first message to group
const BEFORE_SEND_INTERVAL = 1 * 1000
// delay after it send ant message
const WAIT_INTERVAL = 2 * 1000
// delay after it receive 429 error
const WAIT_429_INTERVAL = 20 * 1000

// interval of inline message or edit
const INLINE_INTERVAL = 0.5 * 1000

const INLINE_LENGTH_LIMIT = 2000

type GroupSendInfo = {
    type: 'text',
    message: string,
    sendOptions?: TelegramBot.SendMessageOptions,
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
} | {
    type: 'text-merged',
    messages: MessageSnippet[],
    /** 
     * used only when it is sending instead of patching.
     * reply_mode will ignored, text will be encoded
     */
    sendOptions?: TelegramBot.SendMessageOptions,
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
} | {
    type: 'wait',
    duration: number,
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
} | {
    // separate the group
    type: 'separate',
    resolveFunctions?: ((...args: any[]) => any)[],
    rejectFunctions?: ((...args: any[]) => any)[]
}

type InlineOp = {
    id: any,
    fn: (...args: any[]) => any,
    resolveFunctions: ((...args: any[]) => any)[],
    rejectFunctions: ((...args: any[]) => any)[]
}

export const INLINE_QUERY_RESULT_IDENTIFIER = 'run-inline:'

export class ManagerEngine {
    private engine: Engine
    private groupRunnerMap: Map<number, import('../interfaces').EngineRunner> = new Map();
    private groupTimeoutIdMap: WeakMap<import('../interfaces').EngineRunner, ReturnType<typeof setTimeout>> = new WeakMap()
    private groupMessageQueueMap = new Map<number, Runnable<GroupSendInfo>>()
    private inlineRunner = new Runnable<InlineOp>(async (op, ops) => {
        try {
            const res = await op.fn()

            await sleep(INLINE_INTERVAL)

            try {
                op.resolveFunctions.forEach(it => it(res))
            } catch (err) { }
        } catch (err) {
            await sleep(INLINE_INTERVAL)

            try {
                op.rejectFunctions.forEach(it => it(err))
            } catch (err) { }
        }
    })

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

    getRunner(chatId: number) {
        if (this.groupMessageQueueMap.has(chatId)) {
            return this.groupMessageQueueMap.get(chatId)!
        }

        let lastMergedMessage: MessageSnippet[] = []
        let lastMergedMessageId: number | null = null
        let lastMergedMessageRepliedId: number | null = null

        const runner = new Runnable<GroupSendInfo>(async (task, queue) => {
            const handleError = async (err: any) => {
                if (err instanceof (TelegramBot as any).errors.TelegramError) {
                    const response: import('http').IncomingMessage = err.response

                    // wait and redo
                    if (response.statusCode === 429) {
                        queue.unshift(task)
                        queue.unshift({
                            type: 'wait',
                            duration: WAIT_429_INTERVAL
                        })
                    }
                } else {
                    await sleep(WAIT_INTERVAL)
                        ; (task.rejectFunctions ?? []).forEach(it => it(err))
                }
            }
            if (task.type === 'separate') {
                lastMergedMessage = []
                lastMergedMessageId = null
                lastMergedMessageRepliedId = null
            } if (task.type === 'wait') {
                return sleep(task.duration)
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
                            chat_id: chatId,
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

                        res = await this.api.sendMessage(chatId, formatMessage(first.group), {
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
                    const message = await this.api.sendMessage(chatId, task.message, task.sendOptions)
                    await sleep(WAIT_INTERVAL)
                        ; (task.resolveFunctions ?? []).forEach(it => it(message))
                } catch (err) {
                    handleError(err)
                }
            }
        })

        this.groupMessageQueueMap.set(chatId, runner)
        return runner
    }

    sendLabeledMessage(chatId: number, text: string, label: string, options?: TelegramBot.SendMessageOptions) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(chatId).updateQueue(queue => {
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

    sendMessage(chatId: number, text: string, options?: TelegramBot.SendMessageOptions) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(chatId).updateQueue(queue => {
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

    waitGroup(chatId: number, time: number) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(chatId).updateQueue(queue => {
                queue.push({
                    type: 'wait',
                    duration: time
                })
            })
        })
    }

    stopGroup(chatId: number) {
        return new Promise<TelegramBot.Message>((resolve, reject) => {
            this.getRunner(chatId).updateQueue(queue => {
                queue.push({
                    type: 'separate'
                })
            })
        })
    }

    hasInteractiveSession(chatId: number) {
        return this.groupRunnerMap.has(chatId)
    }

    sendStdin(chatId: number, input: any) {
        this.stopGroup(chatId)
        const runner = this.groupRunnerMap.get(chatId)
        if (runner) {
            runner.write(input)
        }
    }

    terminateStdin(chatId: number, message: TelegramBot.Message) {
        this.stopGroup(chatId)
        const runner = this.groupRunnerMap.get(chatId)
        if (runner) {
            runner.write(null);
            this.scheduleKill(runner, message)
        }
    }

    scheduleKill(runner: EngineRunner, message: TelegramBot.Message) {
        if (this.groupTimeoutIdMap.has(runner)) {
            return // already scheduled
        }

        this.groupTimeoutIdMap.set(runner, setTimeout(() => {
            console.log('force killing runner ' + runner.id);
            this.sendMessage(message.chat.id, 'killed due to timeout').catch(catchHandle);
            runner.kill('SIGKILL');
        }, ONE_SHOT_TIMEOUT))
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
            this.groupRunnerMap.set(message.chat.id, runner);
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
        this.waitGroup(message.chat.id, BEFORE_SEND_INTERVAL)

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
                this.api
                    .sendChatAction(message.chat.id, 'typing')
                    .catch(catchHandle);
            }
            console.log('status change: ' + data.text)
        });

        runner.on('throw', (data) => {
            this
                .sendLabeledMessage(message.chat.id, data.text, 'Compile error:', additionOptions)
                .catch(catchHandle);
        });

        runner.on('error', (data) => {
            this
                .sendLabeledMessage(message.chat.id, data.text, 'Compile error:', additionOptions)
                .catch(catchHandle);
        });

        if (!isInteractive) {
            this.scheduleKill(runner, message)
        }

        runner.on('exit', (data) => {
            const id = this.groupTimeoutIdMap.get(runner)

            if (id) {
                clearTimeout(id);
            }

            if (isInteractive) {
                this.groupRunnerMap.delete(message.chat.id);
            }

            try {
                let res: EngineRunnerParsedExitData = JSON.parse(data.text);

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
                this.sendMessage(
                    message.chat.id,
                    'Info: <code>' + escapeHtml(data.text) + '</code>',
                    {
                        ...additionOptions,
                        parse_mode: 'HTML'
                    }
                ).catch(catchHandle);
            });
        }
    }

    scheduleInline<T extends (...args: any[]) => Promise<any>>(id: any, fn: T): ReturnType<T> {
        return this.inlineRunner.updateQueue((queue: InlineOp[]) => {
            return new Promise(function (resolve, reject) {
                const task = findOrCreate(
                    queue,
                    it => it.id === id,
                    () => ({
                        id,
                        fn,
                        resolveFunctions: [],
                        rejectFunctions: []
                    })
                )
                task.fn = fn
                task.resolveFunctions.push(resolve)
                task.rejectFunctions.push(reject)
                queue.push(task)
            }) as unknown as ReturnType<T>
        })
    }

    executeCodeInline(chosenResult: TelegramBot.ChosenInlineResult) {
        if (!chosenResult.result_id.startsWith(INLINE_QUERY_RESULT_IDENTIFIER)) {
            // not even a run request
            return
        }

        const inlineMessageId = chosenResult.inline_message_id

        const code = chosenResult.query
        const language = chosenResult.result_id.replace(INLINE_QUERY_RESULT_IDENTIFIER, '')


        if (!this.runnerList.find(it => it.type === language)) {
            // I don't know what is this
            // just give up
            this.scheduleInline(inlineMessageId, () => this.api.editMessageText(`Error: unknown language ${language}`, {
                inline_message_id: inlineMessageId
            })).catch(catchHandle);

            return
        }

        let runner = this.engine.run({
            type: language,
            program: code,
            user: 'debian'
        })

        this.scheduleInline(
            inlineMessageId,
            () => new Promise(resolve => setTimeout(resolve, BEFORE_SEND_INTERVAL))
        )

        let timeoutKilled = false

        let badResponse = false

        let exited = false
        let exitCode: number | null = 0
        let exitSignal: any = null

        let truncated = false
        let stdout = ''
        let stderr = ''

        let compileError = ''

        let id = setTimeout(() => {
            timeoutKilled = true;
            runner.kill('SIGKILL');
        }, ONE_SHOT_TIMEOUT)

        const sendMessage = () => {
            const messages: MessageSnippet[] = []

            messages.push({
                label: 'Language:',
                message: language
            })

            messages.push({
                label: 'Code:',
                message: code
            })

            if (stdout.length > 0) {
                messages.push({
                    label: 'Stdout:',
                    message: stdout
                })
            }

            if (stderr.length > 0) {
                messages.push({
                    label: 'Stderr:',
                    message: stderr
                })
            }

            if (compileError.length > 0) {
                messages.push({
                    label: 'Compile Error:',
                    message: compileError
                })
            }

            if (exited) {
                if (exitCode != 0 || (!stdout && !stderr)) {
                    messages.push({
                        label: 'Exit code:',
                        message: String(exitCode)
                    })
                }
                if (exitSignal != null) {
                    messages.push({
                        label: 'Exit signal:',
                        message: String(exitSignal)
                    })
                }
            }

            if (truncated) {
                messages.push({
                    label: 'Note:',
                    message: 'Some message was truncated because output is too long.\n'
                })
            }

            if (timeoutKilled) {
                messages.push({
                    label: 'Note:',
                    message: `Killed due to timeout (${ONE_SHOT_TIMEOUT}ms).\n`
                })
            }

            if (badResponse) {
                messages.push({
                    label: 'Error:',
                    message: 'Something went wrong internally.\n'
                })
            }

            const formatted = formatMessage(formalizeMessage(messages))

            this.scheduleInline(inlineMessageId, () => this.api.editMessageText(
                formatted,
                {
                    inline_message_id: inlineMessageId,
                    parse_mode: 'HTML'
                }
            )).catch(catchHandle);
        }

        const getTotalLength = () => stdout.length + stderr.length + compileError.length

        const errorHandle = (data: any) => {
            if (truncated) return
            const str: string = data.text

            if (getTotalLength() + str.length >= INLINE_LENGTH_LIMIT) {
                truncated = true
                compileError += str.slice(0, INLINE_LENGTH_LIMIT - getTotalLength())
            } else {
                compileError += str
            }

            sendMessage()
        }

        runner.on('throw', errorHandle)
        runner.on('error', errorHandle)

        runner.on('stdout', async (data) => {
            if (truncated) return
            const str: string = data.text

            if (getTotalLength() + str.length >= INLINE_LENGTH_LIMIT) {
                truncated = true
                stdout += str.slice(0, INLINE_LENGTH_LIMIT - getTotalLength())
            } else {
                stdout += str
            }

            sendMessage()
        })

        runner.on('stderr', async (data) => {
            if (truncated) return
            const str: string = data.text

            if (getTotalLength() + str.length >= INLINE_LENGTH_LIMIT) {
                truncated = true
                stderr += str.slice(0, INLINE_LENGTH_LIMIT - getTotalLength())
            } else {
                stderr += str
            }

            sendMessage()
        })

        runner.on('exit', (data) => {
            clearTimeout(id)

            try {
                let res: EngineRunnerParsedExitData = JSON.parse(data.text);
                exited = true
                exitCode = res.code
                exitSignal = res.signal
                sendMessage()
            } catch (err) {
                badResponse = true
                sendMessage()
            }
        })
    }



    executeCodeHeadless (language: string, code: string, stdin: string = '') {
        if (!this.runnerList.find(it => it.type === language)) {
            return Promise.reject(new Error(`Unknown language: ${language}`))
        }

        type Results = {
            stdout: string
            stderr: string
            throw: string
            error: string
            log: string
            exit: EngineRunnerParsedExitData
        }

        return new Promise<Results>((resolve ,reject) => {
            let runner = this.engine.run({
                type: language,
                program: code,
                user: 'debian'
            })

            if (stdin) {
                runner.write(stdin)
                runner.write(null)
            }
    
            const results = {
                stdout: '',
                stderr: '',
                throw: '',
                error: '',
                log: ''
            }
    
            runner.on('stdout', (data) => results.stdout += data.text)
            runner.on('stderr', (data) => results.stderr += data.text)
            runner.on('throw', (data) => results.throw += data.text)
            runner.on('error', (data) => results.error += data.text)
            runner.on('log', (data) => results.log += data.text)
            runner.on('exit', (data) => {
                try {
                    let res: EngineRunnerParsedExitData = JSON.parse(data.text);
                    resolve({
                        ...results,
                        exit: res
                    })
                } catch (err) {
                    reject(err)
                }
            })
        })
    }
}