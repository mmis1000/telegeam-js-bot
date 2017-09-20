const readline = require('readline');
const fs = require('fs');
const path = require('path');
const child_process = require("child_process");
const EventEmitter = require("events").EventEmitter;

const rl = readline.createInterface({
  input: process.stdin,
  output: fs.createWriteStream('/dev/null')
});

rl.on('line', (cmd) => {
  main(cmd)
});

function trim(str) {
  return str.replace(/^[\s\r\n]+|[\s\r\n]+$/g, '');
}

function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function createLogger(emitter, type, willKill, language, id) {
  return function (info) {
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
}

function RunnerInfo() {
  this.stdins = [];
  this.signals = [];
  this.process = null;
  this.console = null;
  this.pidFilePath = null;
  this._pid = null;
  
  var self = this;
  this.waitAlive = function wait(cb) {
    if (!self.pidFilePath) {
      // self.console.log('self.pidFilePath not set')
      return setTimeout(wait.bind(null, cb), 500);
    }
    
    fs.stat(self.pidFilePath, function (err, res) {
      if (err || !res) {
        // self.console.log(self.pidFilePath + ' not found')
        return setTimeout(wait.bind(null, cb), 500);
      }
      
      cb();
    })
  }
  
  Object.defineProperty(this, 'pid', {
    get: function () {
      if (this._pid) {
        return this._pid
      }
      
      if (!this.pidFilePath) {
        return null;
      }
      
      try {
        var pid = parseInt(fs.readFileSync(this.pidFilePath), 10);
        this._pid = pid
        return pid;
      } catch (e) {
        return null;
      }
    }
  })
}

var con = global.con = new EventEmitter();
con.on('error', function nuzz() {});

con.stdout = createLogger(con, 'stdout')
con.stderr = createLogger(con, 'stderr')
con.log = createLogger(con, 'log')
con.error = createLogger(con, 'error')
con.throw = createLogger(con, 'throw')
con.status = createLogger(con, 'status')
con.exit = createLogger(con, 'exit')
con.createNamedLogger = function (language, id) {
  language = language || 'unknown';
  
  if (id == null) {
    id = guidGenerator();
  }
  
  var logger = new EventEmitter();
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

function main (input) {
  // console.log(input.toString('utf8'));
  try {
    var parsedCommnad = JSON.parse(input);
  } catch (err) {
    con.error('bad encoding: ' + err.stack)
  }
  
  if (parsedCommnad.id == null) {
    parsedCommnad.id = guidGenerator();
  }
  
  var myConsole = runnerInfos.get(parsedCommnad.id) ?
    runnerInfos.get(parsedCommnad.id).console :
    con.createNamedLogger(parsedCommnad.type, parsedCommnad.id);
  
  if (parsedCommnad.encoding) {
    switch (parsedCommnad.encoding) {
      case 'base64':
        try {
          if (parsedCommnad.program) {
            parsedCommnad.program = new Buffer(parsedCommnad.program, 'base64');
          }
          
          if (parsedCommnad.stdin) {
            parsedCommnad.stdin = new Buffer(parsedCommnad.program, 'base64');
          }
        } catch (err) {
          return myConsole.throw('corruoted base 64 string: ' + err.stack);
        }
        break;
      default:
        // throw new Error('bad encoding', parsedCommnad.encoding)
        return myConsole.throw('bad encoding: ' + parsedCommnad.encoding)
    }
  }
  
  if (!parsedCommnad.action || parsedCommnad.action === 'spawn') {
    return spawn(parsedCommnad, myConsole)
  }
  
  if (parsedCommnad.action === 'write') {
    return write(parsedCommnad, myConsole)
  }
  
  if (parsedCommnad.action === 'kill') {
    return kill(parsedCommnad, myConsole)
  }
}

function spawn(parsedCommnad, con) {
  // var timeResultPath = process.env.HOME + '/time_results/' + parsedCommnad.id + '.txt';
  // var pidFilePath = process.env.HOME + '/pids/' + parsedCommnad.id + '.pid';
  
  var timeResultPath = '/app/time_results/' + parsedCommnad.id + '.txt';
  var pidFilePath = '/app/pids/' + parsedCommnad.id + '.pid';
  
  var runnerInfo = new RunnerInfo();
  runnerInfos.set(parsedCommnad.id, runnerInfo);
  runnerInfo.console = con;
  runnerInfo.pidFilePath = pidFilePath;
  
  
  function onExitOrThrow() {
    runnerInfos.delete(runnerInfo);
    con.removeListener('throw', onExitOrThrow);
    con.removeListener('exit', onExitOrThrow);
  }
  
  con.once('throw', onExitOrThrow);
  con.once('exit', onExitOrThrow);
  
  if (parsedCommnad.stdin) {
    runnerInfo.stdins.push(parsedCommnad.stdin)
  }
  
  if (parsedCommnad.user) {
    var home = "/home/" + parsedCommnad.user + '/';
  } else {
    var home = "/root/"
  }
  
  var folder = path.resolve(home, 'runner-' + Date.now())
  fs.mkdirSync(folder);
  
  // myConsole.log(parsedCommnad);
  try {
    var runner = require('./runner/' + parsedCommnad.type)
  } catch (e) {
    return con.throw('cannot find runner for ' + parsedCommnad.type + ', aborted.')
  }
  
  con.status('setting up');
  
  runner.setup(folder, parsedCommnad.program, function (file_path) {
    // myConsole.log('setup finished');
    con.status('executing')
    if (runner.getExecuteArgs) {
      var temp = runner.getExecuteArgs(file_path);
      var oldPath = temp.path;
      var oldArgs = temp.args || [];
      var oldOpts = temp.opts || {};
      
      var timeBinPath = '/usr/bin/time';
      var newArgs = [
        '--verbose', 
        '-o', timeResultPath, 
        '/app/wrapper',
        pidFilePath,
        parsedCommnad.user || 'root',
        oldPath
      ].concat(oldArgs);
      
      var newOpts = Object.assign({}, oldOpts, {
        cwd: path.dirname(file_path),
        env: Object.assign({}, process.env, {
          HOME: home
        })
      });
      
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
        child.stdin.write(runnerInfo.stdins.shift());
      }
        
      runnerInfo.waitAlive(function () {
        while (runnerInfo.signals.length > 0) {
          try {
            process.kill(runnerInfo.pid, runnerInfo.signals.shift());
          } catch (e) {}
        }
      })
      
      con.log('starting process with file ' + file_path);
      child.stdout.on('data', con.stdout);
      child.stderr.on('data', con.stderr);
      
      child.on('exit', function (code, sig) {
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
      con.throw('missing handle: ' + parsedCommnad.type);
    }
  }, con)
}

function write(parsedCommnad, con) {
  var runnerInfo = runnerInfos.get(parsedCommnad.id);
  
  if (!runnerInfo) {
    return con.throw('runner ' + parsedCommnad.id + ' does not exist');
  }
  
  if (!parsedCommnad.stdin) {
    return con.error('no stdin provided');
  }
  
  runnerInfo.stdins.push(parsedCommnad.stdin);
  try {
    if (runnerInfo.process) {
      while (runnerInfo.stdins.length > 0) {
        runnerInfo.process.stdin.write(runnerInfo.stdins.shift());
      }
    }
  } catch (err) {
    con.error(err.stack);
  }
}

function kill(parsedCommnad, con) {
  var runnerInfo = runnerInfos.get(parsedCommnad.id);
  
  if (!runnerInfo) {
    return con.throw('runner ' + parsedCommnad.id + ' does not exist');
  }
  
  if (!parsedCommnad.signal) {
    parsedCommnad.signal = 'SIGTERM';
  }
  
  runnerInfo.signals.push(parsedCommnad.signal);
  
  runnerInfo.waitAlive(function (argument) {
    con.log('pid is ' + runnerInfo.pid);
    try {
      process.kill(runnerInfo.pid, runnerInfo.signals.shift());
    } catch (e) {}
  })
}