# ProjectAnnotator
## Overview
### Server
- Handles realtime communication with clients via websockets
- Creates CouchDB databases on their behalve (because only admin users are allowed to do so)
- Useful for certain notifications

### Client
- This is an [Electron](http://electron.atom.io/) application, that has access to NodeJS under the hood, and also serves a minimal chromium
- UI is HTML/CSS rendered in electrons chromium instance
- We are using [Polymer](http://polymer-project.org/) for templating UI elements like our *annotation-box* or *dashboard*
- Polymer uses the W3C standard [https://www.w3.org/TR/components-intro/](Web Components)
- To communicate with the CouchDB backend, we are using [PouchDB](http://pouchdb.com/) in the Chromium context
- This makes it easy to use the application offline, because pouchdb creates a local DB (basically an [IndexDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) that uses the backend CouchDB when possible but falls back to the local storage when the user or server is offline. Both local pouchdb, and CouchDB get synced automatically by pouchdb!


## Getting Started
### Prerequisites
To use ProjectAnnotator with your own infrastructure you first need to install following dependencies **on your server** (For testing this can be identical with your localhost/client):
- couchdb
- nodejs (>5 tested, might or might not work with lower versions)
- npm (should get installed with nodejs)

On Debian base systems:
`apt-get install couchdb nodejs`

On RedHat/Fedora:
`dnf install couchdb nodejs`

To always get the most recent version of node, you may want to use the node version manager (nvm) instead of the version that comes with your distro.


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
Clone the repo on your server and
```.sh
git clone git@github.com:nylki/ProjectAnnotator.git
cd ProjectAnnotator/server
// Install dependencies
npm install
// Start server. If you want to start it automatically, I recommend putting it into the crontab, or creating a systemd service
npm start
```


