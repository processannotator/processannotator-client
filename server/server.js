'use strict'

var fs = require('fs');
var config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

var WebSocketServer = require('ws').Server
, wss = new WebSocketServer({ port: 7000 });

let nano = require('nano')('http://' + config.admin + ':' + config.adminpassword + '@localhost:5984');
let users = nano.use('_users');
let info;


let auth;


// Init design functions and the info DB
// Wont do anything if they exist already
var init = function () {

  nano.db.create('info', function(err, body) {
    if (!err) {
      info = nano.use('info');
      info.insert({ _id: 'projectsInfo', projects: [] }, function(err_, body_) {
        if (err_) console.log(err);
      });
    }
  });

  // To disallow anonymous users to delete other users and only to add own docs,
  // add following design document to _users db:
  users.insert({
    _id: "_design/no_anonymous_delete",
    language: "javascript",
    validate_doc_update: "function(newDoc, oldDoc, userCtx, secObj){ \n    if('_admin' in userCtx.roles) return; // skip anonymous in Admin Party case;\n    if(!userCtx.name && newDoc._deleted){\n      throw({'forbidden': 'auth first before delete something'});\n    }\n}"
  }, function (err, body) {
      if(err_) console.log(err);
  });

};

// Check for new users: if they got the dev key, add the role 'testuser'.
var listenForNewUsers = function () {
  console.log('Listening for new users...');

  let feed = users.follow({since: 'now', include_docs: true, filter: isNewUser, inactivity_ms: 10000});
  feed.on('change', function (change) {
    console.log('user change:', change.doc);

    // Skip design docs
    if(isDesignDoc(change.doc)) {
      return;
    }
    // Immediately remove invalid users.
    else if(isValidTestUser(change.doc) === false) {
      console.log('Invalid new user: ' + change.doc._id + '. Deleting user...');
      change.doc._deleted = true;
      change.doc.projects = [];
      users.insert(change.doc);

    // Approve valid testusers.
    } else if ((change.doc.roles && change.doc.roles.length === 0) || change.doc.roles === undefined) {
      console.log('valid _new_ user, add it!');
      // Add new role to valid user.
      if(change.doc.roles === undefined) {
        change.doc.roles = {};
      }
      change.doc.roles.push('testuser');
      users.insert(change.doc);

    // Already regisered and verified user changed something.
    } else {
      // Check if user requests any new project DBs to add.
      // let newProjects = getRequestedProjects(change.doc);
      getRequestedProjects(change.doc).then((newProjects) => {
        newProjects.forEach(createDB);
      });
    }
  });

  feed.follow();
  process.nextTick(function () {
  });

  function getRequestedProjects(doc) {
    // Filter if projects in its "projects" field, has any new projects that don't
    // exist yet. If so, create a DB for it.

    return new Promise((resolve, reject) => {
      if(doc.projects && doc.projects.length !== 0) {
        nano.db.list(function(err, dbs) {
          resolve( doc.projects.filter((project) => !dbs.includes(project) ) );
        });
      }
    });
  }

};

// Check for requests to delete projects, by observing the `info` db and checking its projectsInfo.projects array
var listenForInfoChanges = function () {
  console.log('Listening for changes in the info DB...');
  console.log('In the testing phase every user of group testuser can delete databases by removing an entry in the info document');

  let feed = info.follow({since: 'now', include_docs: true, filter: isProjectsInfo, inactivity_ms: 10000});
  feed.on('change', function (change) {
    console.log('DEBUG:');
    console.log('Change on info db');
    console.log(change);

    // Skip design docs
    if(isDesignDoc(change.doc)) {
      return;
    }

    getRemovedProjects(change.doc.projects).then(removedProjects => {
      if(removedProjects === undefined || removedProjects.length === 0) return;
      console.log('Destroy', removedProjects, 'upon user action.');
      removedProjects.forEach(nano.db.destroy);
    });

  });

  feed.follow();
  process.nextTick(function () {});

  function getRemovedProjects(updatedProjectList) {
    // Get the project DBs that should get deleted by comparing the
    return new Promise((resolve, reject) => {
      if(updatedProjectList !== undefined && updatedProjectList.length !== 0) {
        nano.db.list(function(err, dbs) {
          resolve( dbs.filter((existingProject) => !updatedProjectList.includes(existingProject) ) );
        });
      }
    });
  }

};



function isDesignDoc(doc, req) {
  return doc._id.startsWith('_design');
}

function isValidTestUser(doc, req) {
  // filter out invalid users (that include no valid testKey)
  return (doc.testkey !== undefined && doc.testkey === 'testuserkey');
}

function isNewUser(doc, req) {
  // Filter out deleted users and the admin.
  return (doc._deleted === undefined && doc._id !== ('org.couchdb.user:' + config.admin));
}

function isProjectsInfo(doc, req) {
  return doc._id === 'projectsInfo';
}






var createDB = function (projectname) {
  return new Promise((resolve, reject) => {

    nano.db.create(projectname, function (err, body) {
      if(err) {
        console.log(err);
        reject(err);
      }

      // Now add _security doc, to allow only certain users and roles to write the DB.
      let newdb = nano.use(projectname);
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
          console.log('database created!');
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
        // case 'createDB':
        // let response = {type: 'createDB', projectname: message.projectname};
        //
        // createDB(message).then(result => {
        //   response.successful = true;
        //   ws.send(JSON.stringify(response));
        // }).catch(err => {
        //   response.successful = false;
        //   ws.send(JSON.stringify(response));
        // });
        // break;
        default:

      }
    });


  });


init();
listenForNewUsers();
listenForInfoChanges();
