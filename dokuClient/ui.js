/* eslint no-alert:0*/
'use strict'; /*eslint global-strict:0*/

const ipcRenderer = require('electron').ipcRenderer;
const SERVERADDR = '141.20.168.11';
const PORT = '80';

var localInfoDB, remoteInfoDB, localProjectDB, userDB, remoteProjectDB, localCachedUserDB;
var sync;
var ws; //websocket connection
// require('./test').test();

var annotationElements = new Map();

// DOM elements
var app = document.querySelector('#app');
var imageContainer;
var annotationList;
var renderView;
app.projects = [];
app.activeProject = {_id: 'collabdb', activeTopic: 'topic_1'};
app.remoteUrl = 'http://' + SERVERADDR + ':' + PORT;
console.log(app.remoteUrl);

app.switchProjectDB = function(newProject) {

	console.log('switch project DB');

	// TODO: check if dname is a valid database name for a project
	app.activeProject = newProject;
	console.log('switch to projectDB with name', app.activeProject);
	localProjectDB = new PouchDB(app.activeProject._id);
	remoteProjectDB = new PouchDB('http://' + SERVERADDR + ':' + PORT + '/' + app.activeProject._id);

	app.savePreferences();
	localProjectDB.changes({live: true, since: 'now', include_docs: true})
	.on('change', (info) => {
		app.updateElements({updateFile: false});
	})
	.on('complete', function(info) {
		// changes() was canceled
	}).on('error', function (err) {
		console.log(err);
	});

	// perhaps also on change localInfoDB to rebuildAnnotation elements?
	sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
		live: true,
		retry: true
	}).on('change', function(info) {
		// console.log('sync change!!');
		// console.log(info);
		// // TODO: implement function that only updates elements that changed
		// app.updateElements(info.change.docs);

	}).on('paused', (info) => {
		console.log('sync pause', info);

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
		console.log('info', info);
		app.activeProject.activeTopic = info.activeTopic;

		app.updateElements({updateFile: true});
	});

	// TODO: app.switchTopic().then(() => {
	//  app.updateElements
	// })

	return sync;
};

function completeReset() {
	alert('pressed "-", doing a complete reset.');
	return localInfoDB.get('_local/lastSession').then(doc => {
		doc.activeProfile = {};
		doc.activeProject = {};
		return localInfoDB.put(doc);
	})
	.then(() => localInfoDB.destroy())
	.then(() => renderView.annotations = []);
}

app.addTopic = function() {
	// add new topic to active project
	return localProjectDB.put({
		_id: 'topic_' + 1,
		type: 'topic',
		parentProject: app.activeProject._id,
		creator: app.activeProfile.name,
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
		parentTopic: app.activeProject.activeTopic,
		parentObject: app.activeObject_id,
		creator: app.activeProfile.name,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: description,
		position: position,
		polygon: polygon
	};

	return localProjectDB.put(annotation).then((result) => {
		console.log('added an annotation', result);
	})
	.catch((err) => {
		console.log(err);
	});
};

function login(user, password) {
	return userDB.login(user, password);
}

app.loadPreferences = function() {

	return localInfoDB.get('_local/lastSession')
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
		console.log(preferences.activeProfile.name);
		console.log(preferences.activeProfile.password);
		return login(preferences.activeProfile.name, preferences.activeProfile.password);
	})
	.then(response => {
		console.log('successfully logged in: ', response);
		return userDB.getSession();
	})
	.then(response => {
		if(!response.userCtx.name){
			console.error('Couldnt get user session: hmm, nobody logged on.');
		}
		// got session, that means login works and user remains logged in, get more userInfo now.
		return userDB.getUser(app.activeProfile.name);
	})
	.then(updatedProfile => {
		console.log('loaded user info from server', updatedProfile);
		console.log('current activeProfile', app.activeProfile);
		console.log('got profile from server:', updatedProfile);
		// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
		app.activeProfile = Object.assign(updatedProfile, app.activeProfile);
		console.log(updatedProfile);
		return app.preferences;
	})
	.catch((err) => {
		if(err.message === 'missing'){
			console.log('no preferences yet, creating template.');
			return localInfoDB.put({
				_id: '_local/lastSession',
				projects: [],
				activeProfile: '',
				activeProject: {}
			})
			.then((result) => {
				//trying to reload preferences after setting fresh initial one.
				return app.loadPreferences();
			})
			.catch((error) => {
				console.log(error);
			});
		} else {
			console.error('possible no internet connection, just use offline data for now', err);
			return app.preferences;
		}

	});

};

app.savePreferences = function() {
	console.log('saving preferences...');
	// _local/lastSession should exist because loadPreferences creates it.

	return localInfoDB.get('_local/lastSession').then(doc => {
		console.log('getting lastSession for saving:', doc);
		doc.activeProfile = app.activeProfile;
		doc.activeProject = app.activeProject;
		doc.projects = app.projects;
		return localInfoDB.put(doc);
	})
	.then((result) => {
		console.log('saved preferences.', result);
	})
	.catch((err) => {
		console.log('error in saving prefs');
		console.log(err);
	});

};

app.setNewProfile = function({prename, surname, email, color}) {

	let metadata = {
		surname: surname,
		prename: prename,
		email: email,
		color: color,
		creationDate: new Date().toISOString()
	};

	let name = metadata.prename + metadata.surname;
	// TODO: this is only a testing password for all users
	let password = 'thisisasupersecrettestingpassworduntilthebeta';

	// Then set the current active profile to the new profile.
	app.activeProfile = {name: name, password, metadata};
	// FIXME: will be problematic when doing an offline "signup"
	// will need to redo the signup once possible

	// Before trying any network stuff, save preferences with locally created profile.
	return app.savePreferences()
	.then(() => {
		// The testkey is necessary, otherwise the user will get deleted and won't get the proper db role.
		metadata.testkey = 'testuserkey';
		metadata.projects = [];
		console.log('signing up');
		return userDB.signup( name, password, {metadata} );
	})
	.then((response) => userDB.login(name, password))
	.then((response) => {
		console.log('succesfully created user and logged in.', response);
		return userDB.getUser(name);
	})
	.then((response) => {
			console.log(response);
			app.activeProfile = Object.assign(app.activeProfile, response);
			console.log('showing activeProfile:');
			console.log(app.activeProfile);

	})
	.catch(err => console.error(err));
};

function normalizeCouchDBName(name) {
	return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_$()+/-]/g, '$');
}

app.setNewProject = function({projectname, topicname, file, emails}) {
	// Assumes current activeProfile as the creator.
	// We will create a new db for the project.
	// However, only server admins are allowed to create db's in couchdb,
	// so we are sending a message via websockets to let the server create the DB.

	// FIXME: create some kind of queue in the preferences to send out the request
	// at a later time when the server is offline.

	let topicID = 'topic_' + topicname;
	let newProjectDescription = {
		_id: 'project_' + (Date.now()) + '_' + normalizeCouchDBName(projectname),
		name: projectname,
		activeTopic: topicID
	};

	userDB.getUser(app.activeProfile.name).then((response) => {
		// Save intend of user to create new DB into it's 'projects' field.
		// This field will get read on the server, which decices wether to create a
		// DB for it.
		response.projects.push(newProjectDescription._id);
		return userDB.putUser(
			app.activeProfile.name,
			{metadata: {projects: response.projects}}
		);
	}).then(() => {
		app.projectOpened = true;
		console.log('new project description');
		console.log(newProjectDescription);

		localInfoDB.get('projectsInfo').then((doc) => {
			doc.projects.push(newProjectDescription);
			return localInfoDB.put(doc);
		}).catch((err) => {
			if(err.status === 404) {
				return localInfoDB.put({_id: 'projectsInfo', projects: [newProjectDescription]});
			}
		});

		app.push('projects', newProjectDescription);
		// independently of internet connection and remote DB already create local DB
		// and add first topic with object/file
		return new PouchDB(newProjectDescription._id).bulkDocs(
			[{
				_id: 'info',
				name: projectname,
				activeTopic: topicID
			},
			{
				_id: 'topic_' + topicname,
				_attachments: {
					'file': { type: file.type, data: file, something: 'else'}
				}
			}]);
	})
	.then(() => {
		return app.switchProjectDB(newProjectDescription);
	})
	.then((result) => {
		console.log('created project', projectname, 'with first topic', topicname, 'locally.');
		app.activeProject.activeTopic = topicID;
		app.updateElements({updateFile: true});
	})
	.catch(function (err) {
			console.log('something went wrong creating the new project db');
			console.log(err);
		});
};

// Get all annotation of current project.
// 1. Update localCachedUserDB based in annotation creators (if userDB is available)
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
		startkey: 'annotation',
		endkey: 'annotation\uffff'
	})
	.then(result => {
		annotations = result.rows;
		let promiseUserUpdates = [];
		let updatedAnnotations = [];
		// now fetch the profile of the annotation creator and try to get it from userDB
		// to update the localCachedUserDB.
		// Collect all creator names and fetch them from localCachedUserDB
		// for (let {doc: {creator}} of annotations) {
		// 	creators.add(creator);
		// }
		// TODO:
		// HACK! This is inefficient. In future update localCachedUserDB periodically (try every 10 mins?)
		// And update annotations only from local cache
		for (let {doc} of annotations) {
			console.log(doc.creator);
			let updatedAnnotation = userDB.getUser(doc.creator).then((creatorProfile) => {
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
		return localProjectDB.put(doc).then((value) => {app.updateElements({updateFile: false}); });
		// after put into DB, DB change event should be triggered automatically to update
	});//.then(() => {updateElements()})
};


app.updateElements = function(options) {
	if(options.updateFile && options.updateFile === true) {
		localProjectDB.get('info')
		.then((doc) => localProjectDB.getAttachment(doc.activeTopic, 'file'))
		.then(blob => {
			app.$.renderView.file = blob;
			return Promise.resolve();
		})
		.catch((err) => {
			console.log(err);
		});
}


	app.getAnnotations().then(annotations => {
		// IDEA: use app.annotation = annotations
		// and then define in UI that annotationList.items = (app.)annotations
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

		ws = new WebSocket('ws://' + SERVERADDR + ':7000', ['protocolbla']);

		ws.onopen = function (event) {
			resolve(ws);
		};

		ws.onmessage = function (event) {
			let msg = JSON.parse(event.data);
			switch (msg.type) {
				case '':
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
	console.log('init app');
	imageContainer = document.querySelector('.object-view');
	annotationList = document.querySelector('.annotation-list');
	renderView = document.querySelector('render-view');

	// This is only a temporary DB, will be replaced once switchDB(dbname) is called soon.
	localInfoDB = new PouchDB('info');
	remoteInfoDB = new PouchDB('http://' + SERVERADDR + ':' + PORT + '/info');
	localInfoDB.sync(remoteInfoDB, {live: true, retry: true });
	localInfoDB.changes({live: true, since: 'now'})
		.on('change', (info) => {
			console.log('localInfoDB change...', info);
			localInfoDB.get('projectsInfo').then((doc) => {
				console.log('new project list!!', doc);
				app.set('projects', doc.projects);
			});
		})
		.on('error', function (err) {
			console.log(err);
		});

	// Contains public user info (color, name) and is used for offline situations
	// and to reduce traffic.
	localCachedUserDB = new PouchDB('localCachedUserDB');
	userDB = new PouchDB('http://' + SERVERADDR + ':' + PORT + '/_users');

	// this.initWebsockets()
	// .then(() => console.log('websocket succesfully connected'))
	// .catch(err => console.error(err));

	app.loadPreferences().then(() => {
		console.log('Loaded preferences.');
		console.log('active profile:', app.activeProfile);

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
			console.log('NO ACTIVE PROFILE YET!');
		} else {
			console.log('loaded a project, show the renderview');
			app.projectOpened = true;
			return app.switchProjectDB(app.activeProject);
		}


	}).then(() => {
		console.log('continue');
		app.updateElements({updateFile: true});
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

app.resetLocalDB = function (e) {
	ipcRenderer.send('asynchronous-message', 'resetLocalDB');
};




/////////////////////////////////////////////
// OLD STUFF down there. maybe useful later!?
/////////////////////////////////////////////

//
// ipcRenderer.on('asynchronous-reply', function(event, arg) {
//   console.log(arg); // prints "pong"
// });
