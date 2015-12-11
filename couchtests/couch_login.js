// init pouchdb
var PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-authentication'))

var db = new PouchDB('http://localhost:5984/authtestdb', {skipSetup: true})

db.login('Artur Kong', 'geheim').then( (response, err) => {
  if(response.ok) {
    console.log(response.name, 'succesfully logged in.')
  } else {
    console.log('login not "ok", see response for details:', response)
  }
}).catch((err) => {
  if (err.name === 'unauthorized') {
    console.error('login denied.')
  } else {
    console.error('unknown problem with authentication.')
  }
})
