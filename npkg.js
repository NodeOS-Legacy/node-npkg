#!/usr/bin/env node

var fs           = require('fs');
var pp           = require('path');
var spawn        = require('child_process').spawn;
var http         = require('http');

var mkdirp       = require('lib-mkdirp');
var Config       = require('lib-config');
var Interp       = require('lib-interpolate');

var PORT         = process.env.PORT || 1;
var command      = process.argv[2];

var root         = process.env.HOME;
var node_modules = pp.join(root,'lib/node_modules');
var node_bins    = pp.join(root,'bin');

var CONFIG_ROOT  = process.env.HOME + '/etc';

function graceful(file) {
  var config;
  try {
    config = JSON.parse(
      fs.readFileSync(file, 'utf-8')
    );
  } catch (e) {
    // default empty config
    config = {};
  }
  return config;
}

function Controller(){
  
}

Controller.prototype.start = function(pkg){

  // --
  // -- load environment
  // --

  var config = new Config();

  // load the default config
  // load the package specific config
  config.load(process.env);
  config.load(graceful(CONFIG_ROOT + '/npkg/config.json'));
  config.load(graceful(CONFIG_ROOT + '/' + pkg + '/config.json'));

  // interpolated values for the environment variables
  // each value is expanded wherever %{VAR} is found
  // e.g. %{home} --> /home/jacob
  //      %{user} --> jacob
  var map = {
    home    : process.env.HOME,
    user    : process.env.USER,
    package : pkg
  };
  var interp = new Interp(map);

  // envs will hold the environment variables 
  // of our child process
  var envs = {};
  config.keys().forEach(function (key) {
    // get the config value and interpolate it
    // against the above map
    envs[key] = interp.expand(config.get(key));
  });

  // make sure some directories exist
  // part of the package/init contract is that 
  // a temp and var directory are available
  // this seems like as good a time as any to 
  // ensure these directories are here
  mkdirp(envs.VARDIR);
  mkdirp(envs.TEMPDIR);

  // --
  // -- child process
  // --

  // the job is started by sending an HTTP request
  // the the init daemon
  //
  // POST /job/$PACKAGE_NAME
  // {
  //   stanza
  // }
  //
  var pkg_path = pp.join(node_modules,pkg);
  console.log('Calling NPM Start on Package',pkg);
  process.env.NPM_CONFIG_PREFIX = process.env.HOME;
  
  // the 'exec' field of the stanza is copied directly
  // from the start script in package.json
  var pkg_json_path = pp.join(pkg_path,"package.json");
  if (!fs.existsSync(pkg_json_path))
    return console.log('Package %s Has No Start Script or package.json File',pkg);
  var pkg_json = JSON.parse( fs.readFileSync(pkg_json_path) );
  var args     = pkg_json.scripts.start.split(/\s+/);
  var exec     = args.shift();
  
  // job stanza to be serialized as the request body
  var job = {
    exec     : exec,
    args     : args,
    cwd      : pkg_path,
    env      : envs
  }
  
  // launch http request
  var req = http.request({
    hostname : '127.0.0.1',
    port     : PORT,
    path     : '/job/' + pkg,
    method   : 'put'
  });
  req.write(JSON.stringify(job));
  req.end();

  // notice that we don't deal with the response
  // yah, we should probably fix that
}

Controller.prototype.stop = function(pkg){
  var req = http.request({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/job/' + pkg + '/sig/SIGQUIT',
    method: 'put'
  }).end();
}

// parse an npmrc file into an object
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

      // if all goes well, we create an empty config file
      // in $HOME/etc/$PACKAGE/config.json
      var pkg_config_dir  = path.join(process.env.HOME, 'etc', arg);
      var pkg_config_file = path.join(pkg_config_dir, 'config.json');
      mkdirp(pkg_config_dir);
      if (!fs.existsSync(pkg_config_file))
        fs.writeFileSync(pkg_config_file, '{}');
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
