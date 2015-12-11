// init pouchdb
var PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-authentication'))

var db = new PouchDB('http://localhost:5984/authtestdb', {skipSetup: true})
db.then((result) => {
  console.log(result)
})

// signup user
db.signup('Artur Kong', 'geheim').then( response => {
  if(response.ok) {
    console.log(response.id, 'succesfully registered.')
  }
}).catch((err) => {
  if (err.name === 'conflict') {
    console.error('username already exists, choose another username')
  } else if (err.name === 'forbidden') {
    console.error('invalid username')
  } else {
    console.error('error, see details:', err)
  }
})
