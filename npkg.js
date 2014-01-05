#!/usr/bin/env node

var os           = require('os');
var fs           = require('fs');
var pp           = require('path');
var http         = require('http');
var crypto       = require('crypto');

var optimist     = require('optimist');
var mkdirp       = require('lib-mkdirp');
var Config       = require('lib-config');
var Interp       = require('lib-interpolate');

var argv         = optimist.argv;
var PORT         = process.env.PORT || 1;
var HOST         = process.env.HOST || '127.0.0.1';
var command      = process.argv[2];

var root         = process.env.HOME;
var node_modules = pp.join(root,'lib/node_modules');

var CONFIG_ROOT  = process.env.HOME + '/etc';

// try to load a file, and parse it into an object
// if that fails, just return an empty object
// this shouldn't throw an error
// it's a big boy, it deals with it's own problems
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

// is a module relative or global
// global modules are refered to by name
// relative modules are refered to with an
// absolute path, or path starting with ./
function is_relative(pth) {
  return (pth[0] === '.' || pth[0] === '/');
}

Controller.prototype.start = function(pkg){

  // --
  // -- load environment
  // --

  var config = new Config();

  // first thing to do is determine if this is a relative
  // module, or an global module
  //
  // relative modules are *always* started with current
  // environment variables
  //
  // global modules are started with environment values
  // defined in $HOME/etc/$PKG/config.json
  //
  var pkg_path;
  var is_rel;

  // this is a relative module
  if (is_rel = is_relative(pkg)) {
    pkg_path = pp.resolve(process.cwd(), pkg);
    config.load(process.env);

    // We leave the environment un-touched,
    // except we make sure the node_modules/.bin
    // directory is in the PATH and accssible to the module.
    // To do otherwise would encourage strange behaviour
    //
    // we write logs to the current directory
    config.load({
      "PATH"   : "%{root}/node_modules/.bin : %{path}",
      "LOGDIR" : process.cwd()
    });
  }

  // this is a global module
  else {
    pkg_path = pp.join(node_modules, pkg);

    // load the default config first
    // the package specific config can override default values
    config.load(graceful(CONFIG_ROOT + '/npkg/config.json'));
    config.load(graceful(CONFIG_ROOT + '/' + pkg + '/config.json'));
  }

  // interpolated values for the environment variables
  // each value is expanded wherever %{VAR} is found
  // e.g. %{home} --> /home/jacob
  //      %{user} --> jacob
  var map = {
    home     : process.env.HOME,
    user     : process.env.USER,
    root     : pkg_path,
    package  : pkg,
    path     : process.env.PATH,
    hostname : os.hostname(),
    tmpdir   : os.tmpdir()
  };
  var interp = new Interp(map);

  // envs will hold the environment variables of our job
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
  if (!is_rel) {
    mkdirp(envs.VARDIR);
    mkdirp(envs.TEMPDIR);
    mkdirp(envs.LOGDIR);
  }

  // --
  // -- spawn job via http
  // --

  // the job is started by sending an HTTP request
  // the the init daemon
  //
  // PUT /job/$PACKAGE_NAME
  // {
  //   stanza
  // }
  //
  process.env.NPM_CONFIG_PREFIX = process.env.HOME;
  
  // the 'exec' and 'args' field of the stanza is copied directly
  // from the start script in package.json
  var pkg_json_path = pp.join(pkg_path, "package.json");
  if (!fs.existsSync(pkg_json_path))
    return console.log('Package %s Has No Start Script or package.json File',pkg);
  var pkg_json = JSON.parse( fs.readFileSync(pkg_json_path) );
  var args     = pkg_json.scripts.start.split(/\s+/);
  var exec     = args.shift();
  
  // launch http request
  //
  // the 'key' is calculated as either the package name
  // when the package is global, or the package directory
  // plus a random token for relative packages
  // 
  // npkg start mypkg
  // --> name = mypkg
  //
  // npkg start ./mypkg
  // --> name = mypkg-39f0ea18
  //
  var key;
  if (is_rel) {
    key = pp.basename(pkg)
          + '-'
          + crypto.randomBytes(3).toString('hex');
  } else {
    key = pkg;
  }

  // job stanza to be serialized as the request body
  var job = {
    exec     : exec,
    args     : args,
    cwd      : pkg_path,
    env      : envs,
    stdio    : {
      // we log to the logs directory
      // currently now ay to provide a stdin
      stdout: pp.join(envs.LOGDIR, key + '.log'),
      stderr: pp.join(envs.LOGDIR, key + '.log')
    }
  };

  // job options
  var options = [
    // debugging services is a pain in the ass, so we
    // stream the contents back to npkg
    // you can ^C at any time to stop receiving output
    // this in no way affects the job
    'stdio=stream'
  ];

  function handle_response(res) {
    res.pipe(process.stdout);
  }

  var req = http.request({
    hostname : HOST,
    port     : PORT,
    path     : '/job/' + key + '?' + options.join('&'),
    method   : 'put'
  }, handle_response);
  req.write(JSON.stringify(job));
  req.end();

  // notice that we don't deal with the response
  // yah, we should probably fix that
};

Controller.prototype.stop = function(pkg){
  http.request({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/job/' + pkg + '/sig/SIGQUIT',
    method: 'put'
  }).end();
};

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
    for(var key in conf) {
      npm.config.set(key, conf[key]);
    }
    npm.commands.install(arg, function(err){
      if(err) {
        console.log(err);
        process.exit(-1);
      }

      // if all goes well, we create an empty config file
      // in $HOME/etc/$PACKAGE/config.json
      var pkg_config_dir  = pp.join(process.env.HOME, 'etc', arg);
      var pkg_config_file = pp.join(pkg_config_dir, 'config.json');
      mkdirp(pkg_config_dir);
      if (!fs.existsSync(pkg_config_file))
        fs.writeFileSync(pkg_config_file, '{}');
    });
  });
};

Controller.prototype.remove = function(){
  console.log('(Not Yet Implemented)');
};

var controller = new Controller();

Controller.prototype.config = function () {
  var subcmd = argv._[1];
  var key    = argv._[2];
  var val    = argv._[3];
  var name   = argv.name;

  // the config file can either come from the default,
  // $HOME/etc/npkg/config.json or a package-specific location
  // $HOME/etc/$PKG/config.json
  // either way, we keep our stories straight here
  var cfg_path;
  var cfg_dir = CONFIG_ROOT + '/' + (name || 'npkg');
  cfg_path = cfg_dir + '/config.json';
  var config = graceful(cfg_path);

  function cfg_usage() {
    console.log('Please Specify "config get|set|cat"');
    process.exit(1);
  }

  function cfg_fmt(obj) {
    Object.keys(obj).forEach(function (key) {
      console.log('%s=%s', key, obj[key]);
    });
  }

  // the config option has subcommands
  // basically a CRUD for config settings
  switch (subcmd) {
    case 'get':
      if (!key) return cfg_usage();
      if (config[key]) console.log(config[key]);
      else cfg_usage();
      break;
    case 'set':
      mkdirp(cfg_dir);

      // let the user also use KEY=VAL style
      // e.g. npkg config set NAME=jacob
      if (!val) {
        var _split = key.split('=');
        key = _split[0];
        val = _split[1];
      }

      config[key] = val;
      fs.writeFileSync(cfg_path, JSON.stringify(config), 'utf-8');
      break;
    case 'cat':
      cfg_fmt(config);
      break;
    default:
      cfg_usage();
  }
}

if(controller[command]){
  var target = process.argv[3];
  if (target) controller[command](target);
  else console.log('Please Specify Target');
}else{
  fs.createReadStream(__dirname + "/usage.txt").pipe(process.stdout);
}
