/* eslint no-alert:0*/
'use strict'; /*eslint global-strict:0*/

var ipc = require('ipc');

var localDB, localProjectDB, remoteDB, remoteProjectDB, localCachedUserDB;
var sync;
var ws; //websocket connection
require('./test').test();

var annotationElements = new Map();

// DOM elements
var app = document.querySelector('#app');
var imageContainer;
var annotationList;
var renderView;
app.projects = [];
app.activeProject = {_id: 'collabdb', activeTopic: 'topic_1'};

app.switchProjectDB = function(newProject) {
	console.log('switch to projectDB with name', newProject._id);
	// TODO: check if dname is a valid database name for a project
	app.activeProject = newProject;
	localProjectDB = new PouchDB(app.activeProject._id);
	remoteProjectDB = new PouchDB('http://127.0.0.1:5984/' + app.activeProject._id);
	app.savePreferences();

	// perhaps also on change localDB to rebuildAnnotation elements?
	sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
		live: true,
		retry: true
	}).on('change', function(info) {
		console.log('sync change!!');
		// TODO: implement function that only updates elements that changed
		app.updateElements(info.change.docs);

	}).on('paused', () => {
		console.log('sync pause');

		// replication paused (e.g. user went offline)
	}).on('active', () => {
		console.log('sync active');

		// replicate resumed (e.g. user went back online)
	}).on('denied', info => {
		console.log('sync denied');

		// a document failed to replicate, e.g. due to permissions
	}).on('complete', info => {
		console.log('sync complete');
		console.log(info);

		// handle complete
	}).on('error', err => {
		console.log('sync error');
		// handle error
	});

	localProjectDB.get('info').then(info => {
		app.activeProject.activeTopic = info.activeTopic;
	});

	// TODO: app.switchTopic().then(() => {
	//  app.updateElements
	// })

	app.updateElements();
	return sync;
};

function completeReset() {
	alert('pressed "-", doing a complete reset.');
	return localDB.get('_local/lastSession').then(doc => {
		doc.activeProfile = {};
		doc.activeProject = {};
		return localDB.put(doc);
	})
	.then(() => localDB.destroy())
	.then(() => renderView.annotations = []);
}

app.addTopic = function() {
	// add new topic to active project
	return localDB.put({
		_id: 'topic_' + 1,
		type: 'topic',
		parentProject: app.activeProject._id,
		creator: app.activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: 'a description to a topic'
	});
};

// this is an event handler, triggering on enter-key event in renderview
app.addAnnotation = function({detail: {description='', position={x: 0, y: 0, z: 0}, polygon=[]}}) {
	console.log('about to add annotation to', app.activeProject._id);
	let annotation = {
		_id: 'annotation_' + new Date().toISOString(),
		type: 'annotation',
		parentProject: app.activeProject._id,
		parentTopic: app.activeProject.activeTopic._id,
		parentObject: app.activeObject_id,
		creator: app.activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: description,
		position: position,
		polygon: polygon
	};
	console.log('double check, is this the annotation?:');
	console.log(annotation);
	console.log('creator', app.activeProfile);
	console.log('put annotation into DB');
	return localProjectDB.put(annotation);
};

function login(user, password) {
	// IDEA: maybe save cookie or do notifactions.
	return remoteDB.login(user, password);
}

app.loadPreferences = function() {

	return localDB.get('_local/lastSession')
	.then((preferences) => {
		console.log('preferences loaded?');
		if(preferences !== undefined) {
			console.log('setting active profile, project and topic from local preferences');
			console.log(preferences);
			app.preferences = preferences;
			app.projects = 	preferences.projects;
			app.activeProfile = preferences.activeProfile;
			app.activeProject = preferences.activeProject;
		}
		if (preferences === undefined) {
			throw	new Error('preferences missing, this error shouldnt happen at all!');
			// because if preferences is undefined, it should have thrown an error before!
		}

		// try to login to profile thats saved in preferences info from remote server
		// to get up-to-date profile info and save it later
		console.log('got prefs: ' + preferences);
		console.log('Use the profile info from preferences to login and possibly update activeProject');
		console.log(preferences.activeProfile._id);
		console.log(preferences.activeProfile.password);
		return login(preferences.activeProfile._id, preferences.activeProfile.password);
	})
	.then(response => {
		console.log('successfully logged in: ', response);
		return remoteDB.getSession();
	})
	.then(response => {
		if(!response.userCtx.name){
			console.error('Couldnt get user session: hmm, nobody logged on.');
		}
		// got session, that means login works and user remains logged in, get more userInfo now.
		return remoteDB.getUser(app.activeProfile._id);
	})
	.then(updatedProfile => {
		console.log('loaded user info from server', updatedProfile);
		console.log('current activeProfile', app.activeProfile);
		if(app.activeProfile) {
			// don't use the verbose couchdb:etc username, but keep the simple one
			updatedProfile._id = app.activeProfile._id;
		}

		console.log('got profile from server:', updatedProfile);
		// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
		app.activeProfile = updatedProfile;
		return app.preferences;
	})
	.catch((err) => {
		console.log('some error loading the preferences...');
		console.log(err);

		if(err.message === 'missing'){
			console.log('no preferences yet, creating template.');
			return localDB.put({
				_id: '_local/lastSession',
				projects: [],
				activeProfile: '',
				activeProject: {}
			})
			.then((result) => {
				console.log('trying to reload preferences after setting fresh initial one.');
				return app.loadPreferences();
			})
			.catch((error) => {
				console.log(error);
			});
		} else {
			console.log('possible no internet connection, just use offline data for now');
			return app.preferences;
		}

	});

};

app.savePreferences = function() {
	console.log('saving preferences...');
	// _local/lastSession should exist because loadPreferences creates the doc
	return localDB.get('_local/lastSession').then(doc => {
		doc.activeProfile = app.activeProfile;
		doc.activeProject = app.activeProject;
		doc.projects = app.projects;
		return localDB.put(doc);
	})
	.then(() => localDB.get('_local/lastSession'));

};

app.setNewProfile = function({prename, surname, email, color}) {

	let metadata = {
		surname: surname,
		prename: prename,
		email: email,
		color: color,
		creationDate: new Date().toISOString()
	};

	let id = metadata.prename + metadata.surname;
	// TODO: this is only a testing password for all users
	let password = 'thisisasupersecrettestingpassworduntilthebeta';

	// then update the active profile to the new profile
	app.activeProfile = {_id: id, password, metadata};
	console.log(app.activeProfile);
	// FIXME: will be problematic when doing an offline "signup"
	// will need to redo the signup once possible

	// before trying any network stuff, save preferences with locally created profile
	return app.savePreferences()
	.then(() => {
		// Signup with testuser key:
		metadata.testkey = 'testuserkey';
		return remoteDB.signup( id, password, {metadata} );
	})
	// put the new profile into the database
	.then( (response) => {
		console.log('tryed to signup');
		console.log(response);
		return remoteDB.login(id, password);
	} )
	.then( response => {
		console.log('succesfully created user and logged in.');
		console.log(response);
		return remoteDB.getSession();
	})
	.then((response) => {
		if(!response.userCtx.name){
			console.error('Couldnt get user session: hmm, nobody logged on.');
		} else {
			console.log(response);
		}
	})
	.catch(err => console.log(err));
};

app.setNewProject = function({projectname, topicname, file, emails}) {
	// assumes current activeProfile as the creator
	// we will create a new DB for the project
	// however, as we can't just do that from here for the server, we are telling
	// the server via websockets to create one

	// FIXME: create some kind of queue in the preferences to send out the request
	// at a later time when the server is offline
	ws.send(JSON.stringify({type: 'createDB', projectname, emails}));

	console.log('not waiting for response from server, just hoping it works');
	console.log('if not, we\'ll have to retry once they are online');
	console.log('listening for', ('db-' + projectname + '-created'));

	app.addEventListener('db-' + projectname + '-created', (e) => {
		if(e.detail.successful) {
			console.log('database creation was successful');
			app.projectOpened = true;
		} else {
			console.log('database creation was _not_ successful');
		}
	});

	// independently of internet connection and remote DB already create local DB
	// and add first topic with object/file
	// TODO: test with switching first
	app.projects.push({_id: projectname, activeTopic: ('topic_' + topicname)});
	console.log('pushing new file');
	console.log(projectname);

	new PouchDB(projectname).put({
		_id: 'info',
		activeTopic: 'topic_' + topicname
	});

	new PouchDB(projectname).put({
		_id: 'topic_' + topicname,
		_attachments: {
			'file': {
				type: file.type,
				data: file,
				something: 'else'
			}
		}
	}).then(() => {
		console.log('created project', projectname, 'with first topic', topicname, 'locally.');
		console.log('now set a timeout of 1 second to try a live sync.');
		setTimeout(() => {
			app.switchProjectDB({_id: projectname});
		}, 1000);

	}).catch(function (err) {
		console.log(err);
	});


};

// Get all annotation of current project.
// 1. Update localCachedUserDB based in annotation creators (if remoteDB is available)
// 2. Use localCachedUserDB to add profile info (color, name) to annotation.
// 3. return updated annotations.
app.getAnnotations = function() {
	let creators = new Set();
	let updatedCreators = new Set();
	let annotations;

	function annotationWithCreatorProfile(doc) {
		return localCachedUserDB.get(doc.creator)
		.then(profile => {
			doc.creatorProfile = profile;
			return doc;
		}).catch(err => {
			console.log(err);
			doc.creatorProfile = {};
			return doc;
		});
	}

	return localProjectDB.allDocs({
		include_docs: true,
		attachments: true,
		startkey: 'annotation', /* using startkey and endkey is faster than querying by type */
		endkey: 'annotation\uffff' /* and keeps the cod more readable  */
	})
	// now fetch the profile of the annotation creator and try to get it from remoteDB
	// to update the localCachedUserDB.
	.then(result => {
		annotations = result.rows;
		let promiseUserUpdates = [];
		let updatedAnnotations = [];

		// Collect all creator names and fetch them from localCachedUserDB
		// for (let {doc: {creator}} of annotations) {
		// 	creators.add(creator);
		// }
		// TODO:
		// HACK! This is inefficient. In future update localCachedUserDB periodically (try every 10 mins?)
		// And update annotations only from local cache
		for (let {doc} of annotations) {
			let updatedAnnotation = remoteDB.getUser(doc.creator).then((creatorProfile) => {
				let {color, name, prename} = creatorProfile;
				doc.creatorProfile = {color, name, prename};

				// also update localCachedUserDB if not done yet.
				if(updatedCreators.has(doc.creator) === false) {
					updatedCreators.add(doc.creator);
					localCachedUserDB.get(doc.creator).then((cachedProfile) => {
						cachedProfile.color = color;
						cachedProfile.name = name;
						cachedProfile.prename = prename;
						console.log('put user info into pouchdb cache');
						return localCachedUserDB.put(cachedProfile);
					})
					.catch((err) => {
						// No local cache of user info yet, cache it now!
						if(err.status === 404) {
							console.log('No local cache of user info yet, cache it now!');
							return localCachedUserDB.put({_id: doc.creator, color, name, prename});
						} else {
							console.error(err);
						}
					});
				}
				return doc;
			})
			.catch((err) => {
				console.log(err);
				console.log('try to get from localCache');
				// Try to get creatorProfile from cache instead.
				console.log(doc.creator);
				return localCachedUserDB.get(doc.creator).then((creatorProfile) => {
					console.log(creatorProfile);
					doc.creatorProfile = creatorProfile;
					return doc;
				})
				.catch((err_) => {
					console.error(err_);
				});
			});
			updatedAnnotations.push(updatedAnnotation);
		}
		return Promise.all(updatedAnnotations);
	});
};


app.onAnnotationEdit = function(evt) {
	console.log(evt);
	// emitted when user edits text in annotationbox and hits enter
	localProjectDB.get(evt.detail.newAnnotation._id).then(doc => {
		doc.description = evt.detail.newAnnotation.description;
		console.log('changing annotation');
		return localProjectDB.put(doc).then((value) => {app.updateElements(); });
		// after put into DB, DB change event should be triggered automatically to update
	});//.then(() => {updateElements()})
};


app.updateElements = function() {
	console.log('update elements, getting attachment?');
	console.log(app.activeProject);

	localProjectDB.get('info')
	.then((doc) => {
		console.log('got info!');
		console.log(doc);
		return doc.activeTopic;
	})
	.then((activeTopic) => {
		console.log('get attachments for', activeTopic);
		return localProjectDB.getAttachment(activeTopic, 'file');
	})
	.then(blob => {
		console.log('got a file');
		console.log(blob);
		app.$.renderView.file = blob;
		return;
	})
	.catch((err) => {
		console.log(err);
	});

	app.getAnnotations().then(annotations => {
		console.log(annotations);
		app.$.annotationList.items = annotations;
		app.$.renderView.annotations = annotations;
	});
};


var alertOnlineStatus = function() {
	if(navigator.onLine === 'offline')
	window.alert('You are not connected to the internet.');
};

app.handleResize = function(event) {
	if(app.$.renderView) {
		app.$.renderView.resize();
	}
};


app.keyUp = function(evt) {
	if(evt.keyCode === 189){
		console.log('complete reset');
		completeReset();
	}
};

window.addEventListener('online', alertOnlineStatus);
window.addEventListener('offline', alertOnlineStatus);
window.addEventListener('resize', app.handleResize);
window.addEventListener('keyup', app.keyUp);


function websockettest() {

}

app.initWebsockets = function() {
	return new Promise((resolve, reject) => {

		ws = new WebSocket('ws:/localhost:7000', ['protocolbla']);

		ws.onopen = function (event) {
			resolve(ws);
		};

		ws.onmessage = function (event) {
			let msg = JSON.parse(event.data);
			switch (msg.type) {
				case 'createDB':
				let e = new CustomEvent('db-' + msg.projectname + '-created', {detail: msg});

				console.log('attention, dispatching event', ('db-' + msg.projectname + '-created'), '!');
				app.dispatchEvent(e);
				break;
				default:
				console.log('unknown websockets event:', msg);
			}
		};
	});

};

app.createProject = function() {
	console.log('create Project');
	let projectOverlay = document.querySelector('#projectSetupOverlay');
	projectOverlay.addEventListener('iron-overlay-closed', (e) => {
		console.log('overlay closed');
		console.log(projectOverlay.projectname, projectOverlay.file);
		console.log(projectOverlay);

		app.setNewProject({
			projectname: projectOverlay.projectname,
			topicname: projectOverlay.topicname,
			file: projectOverlay.file,
			emails: ['bla']
		});

	});
	projectOverlay.open();
};


app.init = function() {

	imageContainer = document.querySelector('.object-view');
	annotationList = document.querySelector('.annotation-list');
	renderView = document.querySelector('render-view');

	// This is only a temporary DB, will be replaced once switchDB(dbname) is called soon.
	localDB = new PouchDB('collabdb');
	// Contains public user info (color, name) and is used for offline situations
	// and to reduce traffic.
	localCachedUserDB = new PouchDB('localCachedUserDB');
	remoteDB = new PouchDB('http://127.0.0.1:5984/collabdb');

	this.initWebsockets()
	.then(() => console.log('websocket succesfully connected'))
	.catch(err => console.error(err));

	app.loadPreferences().then(() => {
		console.log('active profile:');
		console.log(app.activeProfile);

		return new Promise((resolve, reject) => {
			if(app.activeProfile === ''){
				console.log('NO ACTIVE PROFIL found in the preferences! creating one now.');

				let profileOverlay = document.querySelector('#profileSetupOverlay');

				profileOverlay.addEventListener('iron-overlay-closed', (e) => {
					app.setNewProfile({
						prename: profileOverlay.prename,
						surname: profileOverlay.surname,
						color: profileOverlay.color,
						email: profileOverlay.email
					}).then((result) => resolve(app.activeProfile));
				});
				profileOverlay.open();

			} else if(app.activeProfile !== undefined) {
				resolve(app.activeProfile);
			}
		});

	}).then(() => {
		console.log('ok, loaded or created the active profile. Now check if there is an active project');
		console.log(app.activeProject);
		if(app.activeProject === undefined || Object.keys(app.activeProject).length === 0) {
			app.projectOpened = false;
			throw new Error('no active Project, yet!');
		} else {
			console.log('loaded a project, show the renderview');
			app.projectOpened = true;
			return app.switchProjectDB(app.activeProject);
		}


	}).then(() => {
		console.log('continue');
		app.updateElements();
	});

};

app.toggleDashboard = function (e) {
	console.log('toggle dashboard');

	app.$.dashboard.toggle();
	// app.$.objectview.classList.toggle('hidden')
	console.log(app.$.dashboard);

};

app.addEventListener('dom-change', () => {
	console.log('app is ready.');
	app.init();
});

app.switchProject = function (e) {
	app.switchProjectDB(e.detail);
	console.log(e);
};




/////////////////////////////////////////////
// OLD STUFF down there. maybe useful later!?
/////////////////////////////////////////////

// ipc.on('someNotification', function(annotation, status) {
// 	console.log('annotation with image arrived')
// })
