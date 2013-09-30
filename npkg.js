#!/usr/bin/env node

var fs = require('fs');
var pp = require('path');
var spawn = require('child_process').spawn;
var http = require('http');

var command = process.argv[2];

var root = process.env.HOME;
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
  
  var args = pkg_json.scripts.start.split(/\s+/);
  var exec = args.shift();
  
  var job = {
    exec: exec,
    args: args,
    cwd: pkg_path
  }
  
  var req = http.request({
    hostname: '127.0.0.1',
    port: 1,
    path: '/job',
    method: 'post'
  });
  req.write(JSON.stringify(job));
  req.end();
  
}

Controller.prototype.stop = function(){
  
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
    npm.commands.install( arg, function(err,ok){
      if(err) {
        console.log(err);
        process.exit(-1);
      }
    });
  });
}

Controller.prototype.remove = function(){
  
}

var controller = new Controller();

if(controller[command]){
  controller[command](process.argv[3]);
}else{
  console.log("Usage: npkg COMMAND");
}
