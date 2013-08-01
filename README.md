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

Calling `npkg start` will *always* resolve packages installed to `$HOME/lib/node_modules`.
