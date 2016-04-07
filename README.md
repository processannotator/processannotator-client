# ProjectAnnotator
## Overview
### Backend
The Backend consinsts of a running CouchDB instance and a *NodeJS* script that handles realtime communication with clients via websockets and reates CouchDB databases on their behalve (because only admin users are allowed to do so)

### Client

- The Client is an [Electron](http://electron.atom.io/) application (Has access to NodeJS under the hood, and also serves a minimal chromium for rendering and also JS executation). It is basically a Website that runs locally on the users computer and has access to NodeJS, which a regular website does not. Right now we are not depending on NodeJS, so we could still think about making a hosted website client.

- The UI is done with HTML/CSS rendered in electrons chromium instance

- We are using [Polymer](http://polymer-project.org/) for templating UI elements like our *annotation-box* or *dashboard*. Polymer uses the W3C standard [https://www.w3.org/TR/components-intro/](Web Components).

- To communicate with the CouchDB backend, [PouchDB](http://pouchdb.com/) is used. his makes it easy to use the application offline, because pouchdb creates a local DB (basically an [IndexDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) that uses the backend CouchDB when possible but falls back to the local storage when the user or server is offline. Both local pouchdb, and CouchDB get synced automatically by pouchdb!


## Getting Started
### Prerequisites
To use ProjectAnnotator with your own infrastructure you first need to install following dependencies **on your server** (For testing this can be identical with your localhost/client of course):
- couchdb
- nodejs (>5 tested, might or might not work with lower versions)
- npm (should get installed with nodejs)

On Debian base systems:

`apt-get install couchdb nodejs`

On RedHat/Fedora:

`dnf install couchdb nodejs`

Please Note: In some distros, the nodejs version is quite old. I recommend using [the node version manager (nvm)](https://github.com/creationix/nvm) if you have version 4.x or older.


### Configure CouchDB
ProjectAnnotator uses a CouchDB as backend. Therefore it has to be configured first and needs to run in the background.
First edit your CouchDB configuration called `local.ini`. You can get it's location with:

`couchdb -c`

Open it in your editor of choice (you need to have write access, so don't forget eg. to `sudo`), I use vim:

`vim /usr/local/etc/couchdb/local.ini`


If you installed the dependencies you should be able to (on distros using systemd, such as Fedora, Debian, ..):

```.sh
sudo systemctl enable couchdb
sudo systemctl start couchdb
```



## Installing ProjectAnnotator
Clone the repo on your server and execute:
```.sh
git clone git@github.com:nylki/ProjectAnnotator.git
cd ProjectAnnotator/server
# Install dependencies
npm install
# Start server
# If you want to start it automatically, I recommend putting it into the crontab, or creating a systemd service
npm start
```

## Running the electron client
clone the repo and run the client:
```.sh
git clone git@github.com:nylki/ProjectAnnotator.git
cd ProjectAnnotator/dokuClient
# Install dependencies
npm install
# Start app
npm start
```

If you want to distribute the app, run:
```
npm run package
// this creates distributable binaries
```


