# Obsolete, using [npm](http://npmjs.com) instead

This repo will remain for reference purposses

----

# NodeOS Package Manager

NodeOS uses NPM for package management, 
but the `npm` command is not sufficient for proper installation of NodeOS packages. 
The `npkg` command handles all OS-related package management.
If you're writing a NodeJS app, you will still use the `npm` command locally.

## Usage

```
Usage: npkg COMMAND PACKAGE

Commands:
  
  install      install package
  remove       remove package
  
  start        start service
  stop         stop service
```

### Installing Packages

Installing via `npkg install` is a lot like `npm install -g`,
except `npkg` *only* installs the package for the current user.
Packages are installed to `$HOME/lib/node_modules` and binaries are linked to `$HOME/bin`.
NodeOS will have a very minimal set of executables outside of `$HOME/bin`,
thus a users command-line experience is almost completely isolated from other users on the system.

Removing a package *only* removes it for the current user.
Packages and linked binaries are always partitioned by user,
thus you do not need to be root to call `npkg`.

Binaries are discovered exactly like `npm install` via the `bin` key in `package.json`.

### Starting Services

Packages can expose services as well as binaries.
Calling `npkg start PACKAGE` is the same as calling `npm start`,
only the stared service is run by init and daemonized.

The `npkg start` command can resolve both global and local packages.
Local packages start with either `./` or `/` and are resolved as relative or absolute URLs.
Global packages are resolved under `$HOME/lib/node_modules`.

**Start a Relative Package**
```
$ cd ~
$ npkg start ./myapp
--> starting ~/myapp
--> reading ~/myapp/package.json
```

**Start a Global Package**
```
$ cd ~
$ npkg start myapp
--> starting ~/lib/node_modules/myapp
--> reading ~/lib/node_modules/myapp/package.json
```

## Programatic API

Access `npkg` programatically:

```
var npkg = require('npkg');
npkg.install(package, function(err,ok){
  // 
});
npkg.start(package, function(err,ok){
  //
});
```

