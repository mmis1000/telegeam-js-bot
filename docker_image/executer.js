// @ts-check
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const child_process = require("child_process");
const EventEmitter = require("events").EventEmitter;
const canMountProc = !!child_process.execFileSync('capsh', ['--print'], {encoding: 'utf8'}).match('cap_sys_admin');

const rl = readline.createInterface({
  input: process.stdin,
  output: fs.createWriteStream('/dev/null')
});

rl.on('line', (cmd) => {
  main(cmd)
});

/**
 * @param {string} str
 */
function trim(str) {
  return str.replace(/^[\s\r\n]+|[\s\r\n]+$/g, '');
}

function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

/**
 * @param {import("../lib/interfaces").DockerBaseLogger} emitter
 * @param {string} type
 * @param {boolean | undefined} [willKill]
 * @param {string | undefined} [language]
 * @param {string | undefined} [id]
 */
function createLogger(emitter, type, willKill, language, id) {
  /**
   * @param {string | undefined | Buffer | Error} info
   */
  function printData (info) {
    if (info instanceof Buffer) {
      info = info.toString('utf8');
    } else if (info instanceof Error) {
      info = info.stack;
    } else if (String(info) !== info) {
      info = JSON.stringify(info);
    }
    
    var response = {
      type: type,
      text: info,
      language: language,
      id: id
    }
    
    emitter.emit(type, response);
    console.log(JSON.stringify(response));
    
    if (willKill) {
      process.exit(-1);
    }
  }
  return printData
}

/**
 * @class RunnerInfo
 */
class RunnerInfo {
  constructor() {
    /** @type {string[]} */
    this.stdins = [];
    /** @type {(string | number)[]} */
    this.signals = [];
    /** @type {child_process.ChildProcessWithoutNullStreams | null} */
    this.process = null;
    /** @type {import('../lib/interfaces').DockerBaseLogger} */
    this.console;
    /** @type {string} */
    this.pidFilePath;
    this._pid = null;
    this.exited = false;
  }

  /**
   * 
   * @param {() => void} cb 
   * @returns { NodeJS.Timeout|undefined }
   */
  waitAlive (cb) {
    if (this.exited)
      return;

    if (!this.pidFilePath) {
      // self.console.log('self.pidFilePath not set')
      return setTimeout(this.waitAlive.bind(this, cb), 500);
    }

    fs.stat(this.pidFilePath, (err, res) => {
      if (err || !res) {
        // self.console.log(self.pidFilePath + ' not found')
        return setTimeout(this.waitAlive.bind(this, cb), 500);
      }

      cb();
    });
  }

  get pid () {
    if (this._pid) {
      return this._pid;
    }

    if (!this.pidFilePath) {
      return null;
    }

    try {
      var pid = parseInt(fs.readFileSync(this.pidFilePath, { encoding: 'utf-8' }), 10);
      this._pid = pid;
      return pid;
    } catch (e) {
      return null;
    }
  }
}

var con = /** @type { import('../lib/interfaces').DockerLogger } */(new EventEmitter());
con.on('error', function nuzz() {});

con.stdout = createLogger(con, 'stdout')
con.stderr = createLogger(con, 'stderr')
con.log = createLogger(con, 'log')
con.error = createLogger(con, 'error')
con.throw = createLogger(con, 'throw')
con.status = createLogger(con, 'status')
con.exit = createLogger(con, 'exit')
con.createNamedLogger = function (language = 'unknown', id = guidGenerator()) {
  var logger = /** @type { import('../lib/interfaces').DockerBaseLogger } */(new EventEmitter());
  logger.on('error', function nuzz() {});
  
  logger.stdout = createLogger(logger, 'stdout', false, language, id);
  logger.stderr = createLogger(logger, 'stderr', false, language, id);
  logger.log = createLogger(logger, 'log', false, language, id);
  logger.error = createLogger(logger, 'error', false, language, id);
  logger.throw = createLogger(logger, 'throw', false, language, id);
  logger.status = createLogger(logger, 'status', false, language, id);
  logger.exit = createLogger(logger, 'exit', false, language, id);
  
  return logger;
}

var runnerInfos = new Map();

/**
 * @param {string} input
 */
function main (input) {
  // console.log(input.toString('utf8'));
  try {
    var parsedCommand = JSON.parse(input);
  } catch (err) {
    con.error('bad encoding: ' + err.stack);
    return;
  }
  
  if (parsedCommand.id == null) {
    parsedCommand.id = guidGenerator();
  }
  
  var myConsole = runnerInfos.get(parsedCommand.id) ?
    runnerInfos.get(parsedCommand.id).console :
    con.createNamedLogger(parsedCommand.type, parsedCommand.id);
  
  if (parsedCommand.encoding) {
    switch (parsedCommand.encoding) {
      case 'base64':
        try {
          if (parsedCommand.program) {
            parsedCommand.program = new Buffer(parsedCommand.program, 'base64');
          }
          
          if (parsedCommand.stdin) {
            parsedCommand.stdin = new Buffer(parsedCommand.program, 'base64');
          }
        } catch (err) {
          return myConsole.throw('corrupted base 64 string: ' + err.stack);
        }
        break;
      default:
        // throw new Error('bad encoding', parsedCommand.encoding)
        return myConsole.throw('bad encoding: ' + parsedCommand.encoding)
    }
  }
  
  if (!parsedCommand.action || parsedCommand.action === 'spawn') {
    return spawn(parsedCommand, myConsole)
  }
  
  if (parsedCommand.action === 'write') {
    return write(parsedCommand, myConsole)
  }
  
  if (parsedCommand.action === 'kill') {
    return kill(parsedCommand, myConsole)
  }
}

/**
 * @param {{ id: string; stdin?: string; user: string; type: string; program: any; }} parsedCommand
 * @param {import("../lib/interfaces").DockerBaseLogger} con
 */
function spawn(parsedCommand, con) {
  var timeResultPath = '/app/time_results/' + parsedCommand.id + '.txt';
  var pidFilePath = '/app/pids/' + parsedCommand.id + '.pid';
  
  var runnerInfo = new RunnerInfo();
  runnerInfos.set(parsedCommand.id, runnerInfo);
  runnerInfo.console = con;
  runnerInfo.pidFilePath = pidFilePath;
  
  
  function onExitOrThrow() {
    runnerInfos.delete(runnerInfo);
    con.removeListener('throw', onExitOrThrow);
    con.removeListener('exit', onExitOrThrow);
  }
  
  con.once('throw', onExitOrThrow);
  con.once('exit', onExitOrThrow);
  
  if (parsedCommand.stdin !== undefined) {
    runnerInfo.stdins.push(parsedCommand.stdin)
  }
  
  if (parsedCommand.user) {
    var home = "/home/" + parsedCommand.user + '/';
  } else {
    var home = "/root/"
  }
  
  var folder = path.resolve(home, 'runner-' + Date.now())
  fs.mkdirSync(folder);

  /**
   * @type {import('../lib/interfaces').DockerLanguageDef}
   * */
  var runner
  try {
    runner = require('./runner/' + parsedCommand.type)
  } catch (e) {
    return con.throw('cannot find runner for ' + parsedCommand.type + ', aborted.')
  }
  
  con.status('setting up');
  
  runner.setup(folder, parsedCommand.program, /**
  * @param {string} file_path
  */
  function (file_path) {
    // myConsole.log('setup finished');
    con.status('executing')
    if (runner.getExecuteArgs) {
      var temp = runner.getExecuteArgs(file_path);
      var oldPath = temp.path;
      var oldArgs = temp.args || [];
      var oldOpts = temp.opts || {};
      
      var timeBinPath = '/app/time';
      var newArgs = [
        '--verbose', 
        '-o', timeResultPath, 
        '--user', parsedCommand.user || 'root',
        '--pid-file', pidFilePath,
        '--cap-drop', 'cap_sys_admin,cap_setpcap,cap_setfcap',
        oldPath
      ]
      
      if (canMountProc) {
        newArgs.unshift('--pid-namespace');
      }
      
      newArgs = newArgs.concat(oldArgs);
      
      var newOpts = Object.assign({}, oldOpts, {
        cwd: path.dirname(file_path),
        env: Object.assign({}, process.env, {
          HOME: home
        })
      });
      
      con.log('executing ' + timeBinPath + ' ' + newArgs.join(' '));
      
      try {
        var child = child_process.spawn(timeBinPath, newArgs, newOpts);
      } catch (e) {
        return con.throw(e.stack || e.toString());
      }
      
      runnerInfo.process = child;
      
      child.stdin.on('error', con.error)
      child.stdout.on('error', con.error)
      child.stderr.on('error', con.error)
      
      while (runnerInfo.stdins.length > 0) {
        var part = runnerInfo.stdins.shift();
        if (part == null) {
          runnerInfo.process.stdin.end();
        } else {
          runnerInfo.process.stdin.write(part);
        }
      }
        
      runnerInfo.waitAlive(function () {
        while (runnerInfo.signals.length > 0) {
          try {
            if (runnerInfo.pid != null) {
              process.kill(runnerInfo.pid, runnerInfo.signals.shift());
            }
          } catch (e) {}
        }
      })
      
      con.log('starting process with file ' + file_path);
      child.stdout.on('data', con.stdout);
      child.stderr.on('data', con.stderr);
      
      child.on('exit', function (code, sig) {
        runnerInfo.exited = true;
        
        con.status('exited');
        
        fs.readFile(timeResultPath, 'utf8', function (err, res) {
          var time = [];
          
          if (err) {
            time.push(["error", "unknown timing"]);
          } else {
            res = trim(res);
            res.split(/\r?\n/g).forEach(function (line) {
              var temp = line.split(/:/);
              
              if (trim(temp[0]) === "Elapsed (wall clock) time (h") {
                time.push([
                  "Elapsed (wall clock) time (h:mm:ss or m:ss)", 
                  trim(line.replace("Elapsed (wall clock) time (h:mm:ss or m:ss):", ""))
                ])
                return;
              }

              temp[1] = temp[1] || '';
              time.push([trim(temp[0]), trim(temp[1])])
            });
          }
          
          con.log('child exit with code ' + code + ' and signal ' + sig);
          con.exit({code: code, signal: sig, time: time})
          // process.exit();
        })
      })
    } else {
      con.throw('missing handle: ' + parsedCommand.type);
    }
  }, con)
}

/**
 * @param {{ id: string; stdin: undefined; }} parsedCommand
 * @param {{ throw: (arg0: string) => any; error: (arg0: string) => void; }} con
 */
function write(parsedCommand, con) {
  var runnerInfo = runnerInfos.get(parsedCommand.id);
  
  if (!runnerInfo) {
    return con.throw('runner ' + parsedCommand.id + ' does not exist');
  }
  
  if (parsedCommand.stdin === undefined) {
    return con.error('no stdin provided');
  }
  
  runnerInfo.stdins.push(parsedCommand.stdin);
  try {
    if (runnerInfo.process) {
      while (runnerInfo.stdins.length > 0) {
        var part = runnerInfo.stdins.shift();
        if (part == null) {
          runnerInfo.process.stdin.end();
        } else {
          runnerInfo.process.stdin.write(part);
        }
      }
    }
  } catch (err) {
    con.error(err.stack);
  }
}

/**
 * @param {{ id: string; signal: string; }} parsedCommand
 * @param {{ throw: (arg0: string) => any; log: (arg0: string) => void; }} con
 */
function kill(parsedCommand, con) {
  var runnerInfo = runnerInfos.get(parsedCommand.id);
  
  if (!runnerInfo) {
    return con.throw('runner ' + parsedCommand.id + ' does not exist');
  }
  
  if (!parsedCommand.signal) {
    parsedCommand.signal = 'SIGTERM';
  }
  
  runnerInfo.signals.push(parsedCommand.signal);
  
  runnerInfo.waitAlive(/**
     * @param {any} argument
     */
function (argument) {
    con.log('pid is ' + runnerInfo.pid);
    try {
      process.kill(runnerInfo.pid, runnerInfo.signals.shift());
    } catch (e) {}
  })
}