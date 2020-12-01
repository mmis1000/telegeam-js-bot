// @ts-check
const config = require("../config");
const child_process = require("child_process");
const spawn = child_process.spawn;
const EventEmitter = require("events").EventEmitter;
const assert = require("assert");
const readline = require("readline");

function guidGenerator() {
    let S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function createEngine(name, opts) {
    
    name = name || guidGenerator();
    
    opts = opts || {};
    
    const p = spawn('docker', [
        'run',
        '-i',
        '--rm',
        '--net=none',
        '-m=' + (opts.memory || 256) + 'M',
        '--memory-swap=' + (opts.memory || 256) + 'M',
        '--pids-limit=64',
        '--cpuset-cpus=1',
        '--cap-add=sys_admin', // for mount proc, will redrop latter
         '--security-opt', 'apparmor=js_bot',
        // '-u=ubuntu',
        '-h=localhost',
        '--name=' + name,
        config.image_name,
        'node',
        'executer.js'
    ]);
    
    p.stderr.pipe(process.stderr, {end: false});
    
    p.stderr.on('end', function () {
        p.stderr.unpipe(process.stderr)
    })
    
    p.on('exit', function () {
        engine.destroyed = true;
        
        child_process.execFile('docker', ['rm', '-f', name], function (err ,stdout, stderr) {
            // console.log(err ,stdout, stderr)
        })
        
        engine.emit('destroyed')
    })
        
    const rl = readline.createInterface({
        input: p.stdout
    });
    
    rl.on('line', (cmd) => {
        try {
            const parsedCmd = JSON.parse(cmd);
            engine.emit('raw', parsedCmd);
            engine.emit(parsedCmd.type, cmd);
        } catch (err) {
            console.error(err.stack);
        }
    })
    
    let engine = /** @type {import('./interfaces').Engine} */(new EventEmitter());
    engine.name = name;
    engine._docker = p;
    engine.destroyed = false;
    
    engine.on('error', function (cmd) {
        if (cmd.id) {
            // let runner handle it;
            return;
        }
        console.error(cmd.test);
    })
    
    engine.destroy = function() {
        if (engine.destroyed) {
            return;
        }

        engine.destroyed = true;
        p.kill('SIGTERM');
        
        child_process.execFile('docker', ['rm', '-f', name], function(err, stdout, stderr) {
            // console.log(err, stdout, stderr)
        })
        
        engine.emit('destroyed')
    }

    engine.run = function(conf) {
        let runner = /** @type {import('./interfaces').EngineRunner} */(new EventEmitter());
        // @ts-ignore
        assert.ok(conf.type);
        // @ts-ignore
        assert.ok(conf.program);
        
        if (!conf.id) {
            conf.id = guidGenerator();
        }
        
        let id = conf.id;
        runner.id = id;
        
        p.stdin.write(JSON.stringify(conf) + '\n');
        
        let rawListener = function (cmd) {
            if (cmd.id === id) {
                runner.emit('raw', cmd);
                runner.emit(cmd.type, cmd);
            }
        };
        
        engine.on('raw', rawListener);
        
        let destroyListener = function () {
            runner.emit('throw', {
                type: 'throw',
                text: 'engine killed',
                id: id
            })
        }
        
        engine.on('destroyed', destroyListener);
        
        let exitListener = function () {
            engine.removeListener('raw', rawListener);
            engine.removeListener('destroyed', destroyListener);
            runner.removeListener('exit', exitListener);
            runner.removeListener('throw', exitListener);
        };
        
        runner.once('exit', exitListener);
        runner.once('throw', exitListener);
        
        runner.on('error', function (cmd) {
            // prevent if from cause process to throw
            // console.log(cmd.text);
        });
        
        runner.write = function (stdin) {
            let info = {
                action: 'write',
                id: conf.id,
                stdin: stdin
            }
            
            if (stdin instanceof Buffer) {
                info.encoding = 'base64';
                info.stdin = info.stdin.toString('base64');
            }
            
            p.stdin.write(JSON.stringify(info) + '\n')
        }
        
        runner.kill = function (signal) {
            let killInfo = {
                action: 'kill',
                id: id,
                signal: signal
            }
            
            p.stdin.write(JSON.stringify(killInfo) + '\n');
        }
        
        return runner;
    };
    
    return engine;
}

module.exports = {
    createEngine
}