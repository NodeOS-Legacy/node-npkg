#!/usr/bin/env node

var os           = require('os');
var fs           = require('fs');
var pp           = require('path');
var http         = require('http');
var crypto       = require('crypto');
var spawn        = require('child_process').spawn;

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

var http_request;
if (process.env.DEBUG) {
  var stream = require('stream');
  http_request = function (opts, callback) {
    console.log('----> HTTP Request <----')
    console.log(opts);
    var buf = ""
    return {
      write: function (d){ buf += d },
      end: function () {
        console.log(JSON.parse(buf));
      }
    }
  };
} else {
  http_request = http.request;
}

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

Controller.prototype.show = function () {
  fs.readdirSync(node_modules).forEach(function (pkg) {
    console.log(pkg);
  });
};

Controller.prototype.run = function (pkg) {

  if (!pkg) return console.log('Run what (try: npkg show)?');

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
  // defined in $HOME/etc/$PKG/defaults.json
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
    config.load(graceful(CONFIG_ROOT + '/defaults.json'));
    config.load(graceful(CONFIG_ROOT + '/' + pkg + '/defaults.json'));
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
    return console.log('Package %s Has No package.json File',pkg);
  var pkg_json = JSON.parse( fs.readFileSync(pkg_json_path) );
  
  if (!pkg_json.scripts || !pkg_json.scripts.start)
    return console.log('Package %s Has No Start Script',pkg);

  var args     = pkg_json.scripts.start.split(/\s+/);
  var exec     = args.shift();
  
  // job stanza to be serialized as the request body
  var stanza = {
    exec     : exec,
    args     : args,
    cwd      : pkg_path,
    envs     : envs
  };

  // notice that we don't deal with the response
  // yah, we should probably fix that
  var proc = spawn(stanza.exec, stanza.args, stanza);
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);
}

Controller.prototype.start = function(pkg){
  
  if (!pkg) return console.log('Start what?');

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
  // defined in $HOME/etc/$PKG/defaults.json
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
    config.load(graceful(CONFIG_ROOT + '/defaults.json'));
    config.load(graceful(CONFIG_ROOT + '/' + pkg + '/defaults.json'));
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
    return console.log('Package %s Has No package.json File',pkg);
  var pkg_json = JSON.parse( fs.readFileSync(pkg_json_path) );
  
  if (!pkg_json.scripts || !pkg_json.scripts.start)
    return console.log('Package %s Has No Start Script',pkg);

  var args     = pkg_json.scripts.start.split(/\s+/);
  var exec     = args.shift();
  
  // launch http request
  //
  // the 'key' is calculated as either the package name
  // when the package is global, or the absolute package
  // path for relative packages, converting forward slashes
  // to semi-colons
  // 
  // npkg start mypkg
  // --> name = mypkg
  //
  // npkg start ./mypkg
  // --> name = Users-jacob-mypkg
  //
  var key;
  if (is_rel) {
    key = pp.resolve(process.cwd(), pkg).replace(/\//g, ';').substr(1);
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
    switch(res.statusCode) {
      case 400:
        console.log('Failure');
        break;
      case 201:
        console.log('Success');
        break;
      default:
        console.log('Unknown Response');
    }
    res.pipe(process.stdout);
    res.on('end', console.log);
  }

  var req = http_request({
    hostname : HOST,
    port     : PORT,
    path     : '/job/' + key + '?' + options.join('&'),
    method   : 'put',
    headers  : {
      'Content-Type': 'application/json'
    }
  }, handle_response);

  req.on('error', function (err) {
    console.log('Error: %s. Is Init Running on Port %d?', err.message, PORT);
    console.log('To start the package in the foreground, try: npkg run %s', pkg);
  });

  req.write(JSON.stringify(job));
  req.end();

  // notice that we don't deal with the response
  // yah, we should probably fix that
};

Controller.prototype.stop = function(pkg){
  var req = http_request({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/job/' + pkg + '/sig/SIGQUIT',
    method: 'put'
  })
  req.on('error', function (err) {
    console.log('Error: %s. Is Init Running on Port %d?', err.message, PORT);
    console.log('Could not stop package', pkg);
  });
  req.end();
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

Controller.prototype.i = 
Controller.prototype.install = function(arg){

  if (!arg) return console.log('Install what?');

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
      // in $HOME/etc/$PACKAGE/defaults.json
      var pkg_config_dir  = pp.join(process.env.HOME, 'etc', arg);
      var pkg_config_file = pp.join(pkg_config_dir, 'defaults.json');
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

Controller.prototype.cfg    =
Controller.prototype.config = function () {
  var subcmd = argv._[1];
  var key    = argv._[2];
  var val    = argv._[3];
  var name   = argv.name || argv.n;

  // the config file can either come from the default,
  // $HOME/etc/defaults.json or a package-specific location
  // $HOME/etc/$PKG/defaults.json
  // either way, we keep our stories straight here
  var cfg_path;
  var cfg_dir = CONFIG_ROOT;
  if (name) cfg_dir += '/' + name;
  cfg_path = cfg_dir + '/defaults.json';
  var config = graceful(cfg_path);

  function cfg_usage() {
    console.log("Usage: npkg config [OPTS] get KEY");
    console.log("       npkg config [OPTS] set (KEY VALUE | KEY=VALUE)");
    console.log("       npkg config [OPTS] list");
    console.log("       npkg config [OPTS] cat");
    console.log("       npkg config [OPTS] generate PACKAGE");
    console.log("");
    console.log("       OPTIONS");
    console.log("");
    console.log("       --name=NAME/-n NAME   name of package (or default)");
    console.log("");
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
      if (config[key]===undefined) console.log('');
      else console.log(config[key]);
      break;
    case 'set':
      if (!key) return cfg_usage();
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
    case 'list':
    case 'ls':
      Object.keys(config).forEach(function (key) {
        console.log(key);
      });
      break;
    case 'gen':
    case 'generate':
      if (!key) return cfg_usage();

      // generate a configuration, interpolating any missing parameters
      // right now this isn't going to generate the same thing as npkg start
      // but we are working on that
      var pkg = key;
      var config = new Config();

      // first thing to do is determine if this is a relative
      // module, or an global module
      //
      // relative modules are *always* started with current
      // environment variables
      //
      // global modules are started with environment values
      // defined in $HOME/etc/$PKG/defaults.json
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
        config.load(graceful(CONFIG_ROOT + '/defaults.json'));
        config.load(graceful(CONFIG_ROOT + '/' + pkg + '/defaults.json'));
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
      config.keys().forEach(function (key) {
        var str = config.get(key);
        console.log("%s=%s", key, interp.expand(str));
      });
      break;
    case 'rm':
    case 'remove':
      delete config[key];
      fs.writeFileSync(cfg_path, JSON.stringify(config), 'utf-8');
      break;
    default:
      cfg_usage();
  }
}

if(controller[command]){
  var target = process.argv[3];
  if (command) controller[command](target);
  else console.log('Please Specify Target');
}else{
  fs.createReadStream(__dirname + "/usage.txt").pipe(process.stdout);
}
