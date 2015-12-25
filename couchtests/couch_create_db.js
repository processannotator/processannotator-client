// init pouchdb
var PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-authentication'))

var localDB = new PouchDB('authtest')
var remoteDB = new PouchDB('http://127.0.0.1:5984/authtest')


var sync = PouchDB.sync(localDB, remoteDB, {
			live: true,
			retry: true
		}).on('change', function(info) {
			console.log('sync change!!')
			console.log('TODO: now sync all DOM elements...')

		}).on('paused', () => {
			console.log('sync pause')

			// replication paused (e.g. user went offline)
		}).on('active', () => {
			console.log('sync active')

			// replicate resumed (e.g. user went back online)
		}).on('denied', info => {
			console.log('sync denied')

			// a document failed to replicate, e.g. due to permissions
		}).on('complete', info => {
			console.log('sync complete')
			// handle complete
		}).on('error', err => {
			console.log('sync error')

			// handle error
		})
