'use strict'

var WebSocketServer = require('ws').Server
, wss = new WebSocketServer({ port: 7000 });

let nano = require('nano')('http://couchadmin:thisisacouchdbpassword@localhost:5984');
let users = nano.use('_users');
let auth;

// Check for new users: if they got the dev key, add the role 'testuser'.
var listenForNewUsers = function () {
  console.log('Listening for new users...');

  var feed = users.follow({since: 'now', include_docs: true, filter: isNewUser});
  feed.on('change', function (change) {
    console.log('new user.');

    // Immediately remove invalid users.
    if(isValidTestUser(change.doc) === false) {
      console.log('Invalid new user: ' + change.doc._id + ' .Deleting user...');
      change.doc._deleted = true;
      users.insert(change.doc);
      return;
    } else if ((change.doc.roles && change.doc.roles.length === 0) || change.doc.roles === undefined) {
      console.log('valid user, add it!');
      // Add new role to valid user.
      if(change.doc.roles === undefined) {
        change.doc.roles = {};
      }
      change.doc.roles.push('testuser');
      users.insert(change.doc);
    }
  });
  feed.follow();
  process.nextTick(function () {
  });

  function isNewUser(doc, req) {
    return (doc._deleted === undefined);
  }

  function isValidTestUser(doc, req) {
    console.log('is valid test user', (doc.testkey !== undefined && doc.testkey === 'testuserkey'));
    // filter out invalid users (that include no valid testKey)
    return (doc.testkey !== undefined && doc.testkey === 'testuserkey');
  }

};

var createDB = function (message) {
  return new Promise((resolve, reject) => {

    nano.db.create(message.projectname, function (err, body) {
      if(err) {
        console.log(err);
        reject(err);
      }
      console.log('database created!');
      // Now add _security doc, to allow only certain users and roles to write the DB.
      let newdb = nano.use(message.projectname);
      newdb.insert({
        'members': {
          'names': [],
          'roles': ['testuser']
        },
        'admins': {
          'names': [],
          'roles': []
          }
        },
        '_security',
        function (insert_err, insert_body) {
          if(insert_err) {
            console.log(insert_err);
            reject(insert_err);
          }
          resolve(body);
        });

      });
  });
};

  wss.on('connection', function connection(ws) {
    console.log('new connection');

    ws.on('close', function closing() {
      console.log('disconnected');
    });
    ws.on('message', function incoming(rawmessage) {
      console.log('received: %s', rawmessage);
      let message = JSON.parse(rawmessage);

      // handle different messages
      switch (message.type) {
        case 'createDB':
        let response = {type: 'createDB', projectname: message.projectname};

        createDB(message).then(result => {
          response.successful = true;
          ws.send(JSON.stringify(response));
        }).catch(err => {
          response.successful = false;
          ws.send(JSON.stringify(response));
        });
        break;
        default:

      }
    });


  });



listenForNewUsers();
