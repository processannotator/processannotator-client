#!/usr/bin/env bash
killall node
killall electron
couchdb &
node --harmony server/server.js &
electron DokuClient &
cd kameraClient; make; make run;
echo please start couchdb service manually.
