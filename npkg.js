#!/usr/bin/env node

var fs           = require('fs');
var pp           = require('path');
var spawn        = require('child_process').spawn;
var http         = require('http');
var PORT         = process.env.PORT || 1;
var command      = process.argv[2];

var root         = process.env.HOME;
var node_modules = pp.join(root,'lib/node_modules');
var node_bins    = pp.join(root,'bin');

function Controller(){
  
}

Controller.prototype.start = function(pkg){
  var pkg_path = pp.join(node_modules,pkg);
  console.log('Calling NPM Start on Package',pkg);
  process.env.NPM_CONFIG_PREFIX = process.env.HOME;
  
  var pkg_json_path = pp.join(pkg_path,"package.json");
  
  if (!fs.existsSync(pkg_json_path))
    return console.log('Package %s Has No Start Script or package.json File',pkg);
  
  var pkg_json = JSON.parse( fs.readFileSync(pkg_json_path) );
  var args     = pkg_json.scripts.start.split(/\s+/);
  var exec     = args.shift();
  
  var job = {
    exec     : exec,
    args     : args,
    cwd      : pkg_path,
    env      : process.env
  }
  
  var req = http.request({
    hostname : '127.0.0.1',
    port     : PORT,
    path     : '/job/' + pkg,
    method   : 'put'
  });

  req.write(JSON.stringify(job));
  req.end();
}

Controller.prototype.stop = function(pkg){
  var req = http.request({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/job/' + pkg + '/sig/SIGQUIT',
    method: 'put'
  }).end();
}

function config(path){
  var configs = {};
  try {
    var f = fs.readFileSync(path);  
    f.trim().split(/\n/).forEach(function (line) {
      var split = line.trim().split(/\s*=\s*/);
      if(split.length<2) return;
      configs[split[0]] = configs[split[1]];
    });
  } catch (e) {
    // nothing
  }
  return configs;
}

Controller.prototype.install = function(arg){
  var npm    = require('npm');
  var home   = process.env.HOME;
  var prefix = pp.join(home);
  npm.load({
    prefix: prefix
  },function(err){
    if(err) return console.log("Error",err);
    npm.config.set('global',true);
    var conf = config(process.env.HOME + '/.npmrc');
    for(key in conf) {
      npm.config.set(key, conf[key]);
    }
    npm.commands.install( arg, function(err,ok){
      if(err) {
        console.log(err);
        process.exit(-1);
      }
    });
  });
}

Controller.prototype.remove = function(){
  console.log('(Not Yet Implemented)');
}

var controller = new Controller();

if(controller[command]){
  var target = process.argv[3];
  if (target) controller[command](target);
  else console.log('Please Specify Target');
}else{
  fs.createReadStream(__dirname + "/usage.txt").pipe(process.stdout);
}
