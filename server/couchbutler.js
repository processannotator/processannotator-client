'use strict'



var WebSocketServer = require('ws').Server
, wss = new WebSocketServer({ port: 7000 });

let nano = require('nano')('http://localhost:5984')
let auth




var createDB = function (message) {
  console.log('now create the db')
  return new Promise((resolve, reject) => {
    nano.auth('tom', '***REMOVED***', function (err, body, headers) {
      if (headers && headers['set-cookie']) {
        auth = headers['set-cookie']
      }

      if (err) {
        console.log(err)
        reject(err)
      }

      let nano2 = require('nano')({url: 'http://localhost:5984', cookie: auth, jar: true})

      nano2.session(function(err_, session) {
        if (err_) {
          console.log(err_)
          reject(err_)
        } else {
          nano2.db.create(message.projectname, function (err__, body__) {
            console.log('ok, got some response…')
            if(!err__) {
              console.log('database created!')
              resolve(body__)
            } else {
              console.log(err__)
              reject(err__)
            }
          })
        }
        console.log('user is %s and has these roles: %j', session.userCtx.name, session.userCtx.roles)
      })

    })

  })

}

  wss.on('connection', function connection(ws) {
    console.log('new connection')

    ws.on('message', function incoming(rawmessage) {
      console.log('received: %s', rawmessage)
      let message = JSON.parse(rawmessage)

      // handle different messages
      switch (message.type) {
        case 'createDB':
        let response = {type: 'createDB', projectname: message.projectname}

        createDB(message).then(result => {
          response.successful = true
          ws.send(JSON.stringify(response))
        }).catch(err => {
          response.successful = false
          ws.send(JSON.stringify(response))
        })
        break;
        default:

      }


    });


  });
