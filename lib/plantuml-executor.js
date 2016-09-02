'use strict'

var childProcess = require('child_process')
var path = require('path')
var nailgun = require('node-nailgun-server')
var ngClient = require('node-nailgun-client')
var process = require('process')

var PLANTUML_JAR = path.join(__dirname, '../vendor/plantuml.jar')
var PLANTUML_NAIL_JAR = path.join(__dirname, '../nail/plantumlnail.jar')
var PLANTUML_NAIL_CLASS = 'PlantumlNail'
var PLANTUML_LIMIT_SIZE = '4096'

// Allow the environment to override the path to the PLANTUML jar
if (process.env.NODE_PLANTUML_JAR !== undefined) {
  PLANTUML_JAR = process.env.NODE_PLANTUML_JAR
}

// Allow the environment to override the path to the PLANTUML NAIL jar
if (process.env.NODE_PLANTUML_NAIL_JAR !== undefined) {
  PLANTUML_NAIL_JAR = process.env.NODE_PLANTUML_NAIL_JAR
}

if (process.env.PLANTUML_LIMIT_SIZE !== undefined) {
  PLANTUML_LIMIT_SIZE = process.env.PLANTUML_LIMIT_SIZE
}

var LOCALHOST = 'localhost'
var GENERATE_PORT = 0

var nailgunServer
var clientOptions
var nailgunRunning = false

module.exports.useNailgun = function (callback) {
  var options = { address: LOCALHOST, port: GENERATE_PORT }
  nailgunServer = nailgun.createServer(options, function (port) {
    clientOptions = {
      host: LOCALHOST,
      port: port
    }

    ngClient.exec('ng-cp', [PLANTUML_JAR], clientOptions)
    ngClient.exec('ng-cp', [PLANTUML_NAIL_JAR], clientOptions)

    // Give Nailgun some time to load the classpath
    setTimeout(function () {
      nailgunRunning = true
      if (typeof callback === 'function') {
        callback()
      }
    }, 50)
  })

  return nailgunServer
}

// TODO: proper error handling
function execWithNailgun (argv, cwd, cb) {
  clientOptions.cwd = cwd || process.cwd()
  return ngClient.exec(PLANTUML_NAIL_CLASS, argv, clientOptions)
}

// TODO: proper error handling
function execWithSpawn (argv, cwd, cb, javaCfg) {
  cwd = cwd || process.cwd()
  javaCfg = javaCfg || {jarPath: PLANTUML_JAR,
                        javaOpt: [ '-DPLANTUML_LIMIT_SIZE=' + PLANTUML_LIMIT_SIZE ] }
  var opts = [
    '-Dplantuml.include.path=' + cwd,
    '-Djava.awt.headless=true'
  ]
  if (javaCfg.javaOpt && (javaCfg.javaOpt.length > 0)) {
    opts = opts.concat(javaCfg.javaOpt)
  }

  if (typeof javaCfg.jarPath === 'string') {
    opts.push('-jar', javaCfg.jarPath)
  } else {
    opts.push('-jar', PLANTUML_JAR)
  }
  // Tack on the PlantUML specific options
  opts = opts.concat(argv)
  return childProcess.spawn('java', opts)
}

module.exports.exec = function (argv, cwd, callback, javaCfg) {
  if (typeof argv === 'function') {
    callback = argv
    argv = undefined
    cwd = undefined
  } else if (typeof cwd === 'function') {
    callback = cwd
    cwd = undefined
  }

  var task
  if (nailgunRunning) {
    task = execWithNailgun(argv, cwd, callback)
  } else {
    task = execWithSpawn(argv, cwd, callback, javaCfg)
  }

  if (typeof callback === 'function') {
    var chunks = []
    task.stdout.on('data', function (chunk) { chunks.push(chunk) })
    task.stdout.on('end', function () {
      var data = Buffer.concat(chunks)
      callback(null, data)
    })
    task.stdout.on('error', function () {
      callback(new Error('error while reading plantuml output'), null)
    })
  }

  return task
}
