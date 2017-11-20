/* eslint no-alert:0*/
'use strict'; /*eslint global-strict:0*/

import BNO055 from './bno055';
// import SpeechRecognition from './speechRecognition'

const electron = require('electron');
const ipc = electron.ipcRenderer;
const { dialog } = electron.remote;
// Uses rollup-replace to replace ENV with the env set when starting rollup


// Set default couchdb address and port
// gets overwritten when requesting the config from node process.
let SERVERADDR = '127.0.0.1';
let PORT = '80';
let POUCHCONF = {};


var localInfoDB, remoteInfoDB, localProjectDB, userDB, remoteProjectDB, localCachedUserDB;
var sync;


Polymer({
	is: 'main-app',

	properties: {
		objectTool: {
			type: Object
		},
		selectedAnnotation: {
			type: Object,
			notify: true,
			observer: '_selectedAnnotationChanged'
		},
		annotations: {
			type: Array,
			notify: true
			// observer: 'annotationsChangedObserver'
		}

	},
	observers: [
		'annotationsChanged(annotations.*)'
	],

	attached: async function () {
		document.app = this;

		// Request config from node process
		let config = ipc.sendSync('getConfig');
		SERVERADDR = config.couchdb.address || SERVERADDR;
		PORT = config.couchdb.port || PORT;

		this.setupPenEventHandlers();

		this.penButtonText = 'Connect Pen';
		this.objectButtonText = 'Connect Object';
		this.penButtonConnecting = false;
		this.penButtonConnected = false;
		this.objectButtonConnecting = false;
		this.onlineStatus = false;
		this.OnlineStatusText = '-';


		this.projects = [];
		this.activeProject = {_id: 'collabdb', activeTopic: 'topic_1'};
		this.hasCachedUserDB = false;
		this.lastUserCacheUpdate = -1;
		this.remoteUrl = 'http://' + SERVERADDR + ':' + PORT;
		console.log(this.remoteUrl);
		this.isOnline = window.navigator.onLine;
		window.addEventListener("offline", this.updateOnlineStatus.bind(this));
		window.addEventListener("online", this.updateOnlineStatus.bind(this));


		this.renderView = document.querySelector('render-view');

		localInfoDB = new PouchDB('info', POUCHCONF);
		remoteInfoDB = new PouchDB(this.remoteUrl + '/info', POUCHCONF);
		localInfoDB.sync(remoteInfoDB, {live: true, retry: true });
		this.updateProjectList();
		localInfoDB.changes( {live: true, since: 'now'} )
		.on('change', this.updateProjectList)
		.on('error', err => {
			console.log('ERROR');
		});

		setInterval(this.updateOnlineStatus.bind(this), 1000 * 30);
		this.updateOnlineStatus();


		// Contains public user info (color, name) and is used for offline situations
		// and to reduce traffic.
		localCachedUserDB = new PouchDB('localCachedUserDB', POUCHCONF);
		userDB = new PouchDB(this.remoteUrl + '/_users', POUCHCONF);

		this.loadPreferences().then(() => {
			return new Promise(async (resolve, reject) => {
				console.log('Loaded preferences.');

				if(this.activeProfile === '' || this.activeProfile === undefined){
					console.log('NO ACTIVE PROFIL found in the preferences! creating one now.');

					if(await this.updateOnlineStatus() === false) {
						dialog.showErrorBox('DokuClient', 'Error connecting to the database for new user registration. Please check if you are connected to the internet and try again.');
						ipc.send('quit');
					}

					let profileOverlay = document.querySelector('#profileSetupOverlay');

					profileOverlay.addEventListener('iron-overlay-closed', (e) => {
						this.setNewProfile({
							prename: profileOverlay.prename,
							surname: profileOverlay.surname,
							color: profileOverlay.color,
							email: profileOverlay.email
						}).then((result) => { resolve(this.activeProfile) });
					});
					profileOverlay.open();

				} else if(this.activeProfile !== undefined) {
					resolve(this.activeProfile);
				}
			});

		}).then(async () => {
			console.log('ok, loaded or created the active profile. Now check if there is an active project');
			console.log(this.activeProject);

			if( this.activeProject === undefined || Object.keys(this.activeProject).length === 0) {
				this.projectOpened = false;
				console.log('no active profile yet!');
			} else {
				this.projectOpened = true;
				await this.switchProjectDB(this.activeProject);
			}

			return this.updateElements({updateFile: true});

		});

		window.addEventListener('resize', this.handleResize.bind(this));
		window.addEventListener('keyup', this.keyUp.bind(this));
	},
	annotationsChanged: function () {
		// TODO: get database annotations and diff them to new ones
		// but also to a timeout!
		//
		// this would make it possible to easier select the just created annotation
	},

	// Return false if either whole computer is offline or databases are unreachable
	updateOnlineStatus: async function () {

			let status = false;
			if(window.navigator.onLine === false) {
				status = false;
			} else {
				try {
					let info = await remoteInfoDB.info();
					console.log(info);
					status = true;
				} catch (err) {
					status = false;
				}
			}


			this.onlineStatus = status;
			this.onlineStatusText = status ? 'DB ONLINE ⦿' : 'DB OFFLINE ○';

			console.log('online status change', this.onlineStatus);
			return status;
	},

	connectOrDisconnectPen: function () {

		if (this.penStatus === 'connected') {
			this.penButtonConnecting = false;
			ipc.send('disconnectPen');
			console.log('trying to disconnect pen');
		} else {
			this.penButtonConnecting = true;
			ipc.send('startScan');
			console.log('trying to connect pen');
		}
	},

	deleteProjectDB: async function (project) {

		// HACK: Only in testing phase, any user can delete any project DB by
		// modifying the array projectsInfo.projects of the `info` db
		// In the future only allow db members to delete their project db, by modifying a users projects array.

		try {
			let doc = await localInfoDB.get('projectsInfo');
			console.log(doc);
			let index;
			for (var i = 0; i < doc.projects.length; i++) {
				if(doc.projects[i]._id === project._id){
					index = i;
				}
			}

			if(index === undefined) {
				throw new Error('User tried to delete', project._id, 'but a DB with that name is not listed in the `info` db inside projectsInfo.projects. Perhaps the info DB wasnt properly created?');
			} else {
				doc.projects.splice(index, 1);
				return localInfoDB.put(doc);
			}

		} catch (err) {
			console.error('something went wrong deleting', project._id);
			console.log(err);
		} finally {
			this.updateProjectList();
			this.updateElements();
		}


	},

	switchProjectDB: async function(newProject) {
		console.log('switch to projectDB with name', this.activeProject);


		// Reset check wether remote user db got cached, to allow for updatingthe cached
		// when a project is switched
		this.hasCachedUserDB = false;
		this.lastUserCacheUpdate = -1;
		this.activeProject = newProject;
		this.annotations = [];
		localProjectDB = new PouchDB(this.activeProject._id,  Object.assign({}, POUCHCONF, {adapter: 'worker'}));
		remoteProjectDB = new PouchDB(this.remoteUrl + '/' + this.activeProject._id,  Object.assign({}, POUCHCONF, {adapter: 'worker'}));

		this.savePreferences();
		let info;
		// console.log(info);
		sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
			live: true,
			retry: true
		})
		.on('change', (info_) => {
			console.log(info);
			// Deactivate sync status after 100ms
			clearTimeout(this.dbSyncSpinnerTimeout);
			this.dbSyncSpinnerTimeout = setTimeout(() => {this.dbSyncActive = false}, 500);
			this.dbSyncActive = true;

		})
		.on('error', err => {
			console.log('sync error', err);
		});

		localProjectDB.changes({live: true, since: 'now', include_docs: true})
		.on('change', (info) => {
			// only update also the file (for the renderer) if it's not an annotation
			let updateFile = false;
			if(info.doc.type !== 'annotation' && !info._deleted && !info.deleted) {
				console.log('\n\nUpdate file because:',info, info.doc.type);
				updateFile = true;
			}
			// Reduce calls to this.updateElements if there are many simultaneous changes!
			// Therefore only update every 30ms
			// This would not be valid if we only actually update individual elements from changes,
			// as we would have to notify updateElements about the actual changed docs. this is not true yet and may never be, just wanted to note this here in case we ever decide to do so:)
			clearTimeout(this.updateTimeout);
			this.updateTimeout = setTimeout(() => {
				this.updateOnlineStatus();
				this.updateElements({updateFile: updateFile});
			}, 10);

		})
		.on('complete', function(info) {})
		.on('active', () => {console.log('active...');})
		.on('error', function (err) {console.log(err)});

		info = await localProjectDB.get('info');
		this.activeProject.activeTopic = info.activeTopic;
		await this.updateElements({updateFile: true});

		return sync;

	},

	addTopic: function() {
		// add new topic to active project
		return localProjectDB.put({
			_id: 'topic_' + 1,
			type: 'topic',
			parentProject: this.activeProject._id,
			creator: this.activeProfile.name,
			creationDate: new Date().toISOString(),
			title: 'a topic title',
			description: 'a description to a topic'
		});
	},

	// this is an event handler, triggering on enter-key event in this.renderView
	// or by a button press on the physical pen.
	addAnnotation: function({detail: {description='', localPosition={x: 0,y: 0,z: 0}, worldPosition={x: 0, y: 0, z: 0}, cameraPosition={x: 0, y: 0, z: 0}, localCameraPosition={x: 0, y: 0, z: 0}, worldCameraPosition={x: 0, y: 0, z: 0}, cameraRotation={x: 0, y: 0, z: 0}, cameraUp={x: 0, y: 0, z: 0}, polygon=[], responses=[]}}) {

		let created = new Date().toISOString();
		let _id = `annotation_${created}`;
		let referedBy = [];
		if(this.referingAnnotation) {
			referedBy = [this.referingAnnotation._id];
			// As this annotation is refered by another one, also add
			// referTo field to the refering annotation:
			this.referingAnnotation.referingTo.push(_id);
			this.editAnnotation({detail: {annotation: this.referingAnnotation}});

		}

		let annotation = {
			_id,
			type: 'annotation',
			status: 'comment',
			motivation: 'commenting', // web annotation model
			responses,
			referedBy,
			referingTo: [],
			parentProject: this.activeProject._id,
			parentTopic: this.activeProject.activeTopic,
			parentObject: this.activeObject_id,
			target: this.activeObject_id,
			creator: this.activeProfile.name,
			creationDate: created,
			created, // same as above, conforms to web-annotation-model
			worldCameraPosition,
			localCameraPosition,
			// cameraRotation,
			cameraUp,
			description,
			worldPosition,
			localPosition,
			polygon
		};

		console.log(annotation);

		return localProjectDB.put(annotation)
		.then(() => {
			console.log('Added annotation.');
			console.log('refer mode active?', this.referMode);
			if(this.referMode) this.toggleReferMode();
		})
		.catch(err => console.log)
	},

	editAnnotation: function (evt) {
		if (evt.defaultPrevented)
			return; // Should do nothing if the key event was already consumed.

		let editedAnnotation = Object.assign({}, evt.detail.annotation);
		delete editedAnnotation.creatorProfile; //purge possibly sensitive info

		console.log('\n\n received annotation to be updated!!\n\n', editedAnnotation);

		if(evt.detail.temporary && evt.detail.temporary === true) {
			console.log('is temporary', evt.detail);
			let index = this.annotations.findIndex((annotation) => annotation._id === editedAnnotation._id);

			this.splice('annotations', index, editedAnnotation);
		} else {
			localProjectDB.get(editedAnnotation._id).then((storedAnnotation) => {
				console.log('saving changes to annotation');
				editedAnnotation.modified = new Date().toISOString();
				editedAnnotation = Object.assign(storedAnnotation, editedAnnotation);

				return localProjectDB.put(editedAnnotation);
			})
		}

	},

	deleteAnnotation: function (e) {
		console.log('removing', e.detail.annotation);
		let id = e.detail.annotation._id;
		return localProjectDB.remove(e.detail.annotation)
		.catch((err) => {
			console.error('error deleting', id);
			console.error(err);
		});
	},

	login: function(user, password) {
		return userDB.login(user, password);
	},

	loadPreferences: async function() {

		try {

			let preferences = await localInfoDB.get('_local/lastSession');

			if(preferences !== undefined) {
				this.preferences = preferences;
				this.activeProfile = preferences.activeProfile;
				this.activeProject = preferences.activeProject;
			} else {
				throw	new Error('No preferences loaded.');
			}

			let response = await this.login(preferences.activeProfile.name, preferences.activeProfile.password);
			response = await userDB.getSession();
			if (!response.name || (response.userCtx && !response.userCtx.name)) {
			}
			this.updateProjectList();

			// got session, that means login works and user remains logged in, get more userInfo now.
			let updatedProfile = await userDB.getUser(this.activeProfile.name);

			// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
			this.activeProfile = Object.assign(updatedProfile, this.activeProfile);

			return this.preferences;

		} catch (err) {

			if(err.message === 'missing'){
				console.log('no preferences yet, creating template.');

				let result = await localInfoDB.put({
					_id: '_local/lastSession',
					projects: [],
					activeProfile: '',
					activeProject: {}
				})

				//trying to reload preferences after setting fresh initial one.
				return this.loadPreferences();

			} else {
				console.error('possible no internet connection, just use offline data for now', err);
				return this.preferences;
			}
		};


	},

	savePreferences: async function() {

		// _local/lastSession should exist because loadPreferences creates it.
		try {
			let doc = await localInfoDB.get('_local/lastSession');
			doc.activeProfile = this.activeProfile;
			doc.activeProject = this.activeProject;
			let result = await localInfoDB.put(doc);
			console.log('saved preferences.', result);
		} catch (err) {
			console.log('error in saving preferences', err);
		}

	},

	setNewProfile: async function({prename, surname, email, color}) {

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
		this.activeProfile = {name: name, password, metadata};
		// FIXME: will be problematic when doing an offline 'signup'
		// will need to redo the signup once possible

		// Before trying any network stuff, save preferences with locally created profile.
		await this.savePreferences();

		// The testkey is necessary, otherwise the user will get deleted and won't get the proper db role.
		metadata.testkey = 'testuserkey';
		metadata.projects = [];

		try {
			await userDB.signup( name, password, {metadata} );
			let response = userDB.login(name, password);
			let profile = await userDB.getUser(name);
			this.activeProfile = Object.assign(this.activeProfile, profile);
			console.log('succesfully created user and logged in.', response);
			this.updateProjectList();
		} catch (err) {
			console.log('Error signup new user', err);
			dialog.showErrorBox('DokuClient', 'Error: Could not signup/login new user:\n', err);
		}

	},

	setNewProject: async function({projectname, topicname, file, emails}) {
		// Assumes current activeProfile as the creator.
		// We will create a new db for the project.
		// However, only server admins are allowed to create db's in couchdb,
		// so we are sending a message via websockets to let the server create the DB.

		// FIXME: create some kind of queue in the preferences to send out the request
		// at a later time when the server is offline.

		let fileEnding = file.name.split('.').pop();
		if(fileEnding !== 'obj' && fileEnding !== 'dae') {
			alert('For now you can only upload OBJ and DAE files.');
			return;
		}

		if(await this.updateOnlineStatus() === false) {
			alert('Error connecting to the database for Project creation. Please check if you are connected to the internet and try again.');
			return;
		}

		function normalizeCouchDBName(name) {
			return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_$()+/-]/g, '$');
		}


		let topicID = 'topic_' + topicname;
		let newProjectDescription = {
			_id: 'project_' + (Date.now()) + '_' + normalizeCouchDBName(projectname),
			name: projectname,
			activeTopic: topicID
		};

		userDB.getUser(this.activeProfile.name).then((response) => {
			// Save intend of user to create new DB into it's 'projects' field.
			// This field will get read on the server, which decides wether to create a
			// DB for it. This is a security measure, so you cant just create a DB on the server
			// but the server evaluates whether it is ok to create one. This may not apply
			// to test couchdb server mode (when running a pouchdb-server eg.)

			response.projects.push(newProjectDescription._id);

			return userDB.putUser(
				this.activeProfile.name,
				{metadata: {projects: response.projects}}
			);

		})
		.then(() => {
			this.projectOpened = true;
			// Also add an entry in our projectsInfo DB that a new DB was created:
			localInfoDB.get('projectsInfo').then((doc) => {
				doc.projects.push(newProjectDescription);
				return localInfoDB.put(doc);
			})
			.catch((err) => {
				console.log('Hm, something went wrong creating the new Project');
				console.log(err);
				if(err.status === 404) {
					return localInfoDB.put({_id: 'projectsInfo', projects: [newProjectDescription]});
				}
			});

			// Finally adding the new project to our app scope, notifying all listeners
			this.push('projects', newProjectDescription);

			// Set appropriate mime type for blob
			let contentType = 'text/plain';

			if(fileEnding === 'dae') {
				contentType = 'model/vnd.collada+xml';
			} else if (fileEnding === 'obj') {
				contentType = 'text/plain';
			}

			let blob = new Blob([file], {type: contentType});

			// independently of internet connection and remote DB already create local DB
			// and add first topic with object/file
			return new PouchDB(newProjectDescription._id, POUCHCONF).bulkDocs(
				[{
					_id: 'info',
					name: projectname,
					activeTopic: topicID
				},
				{
					_id: 'topic_' + topicname,
					fileName: file.name,
					fileEnding: fileEnding,
					'_attachments': {
						'file': { 'content_type': contentType, 'data': blob}
					}
				}]);
			})
			.then(() => {
				return this.switchProjectDB(newProjectDescription);
			})
			.then((result) => {
				this.activeProject.activeTopic = topicID;
				return this.updateElements({updateFile: true});
			})
			.catch(function (err) {
				console.log('something went wrong creating the new project db');
				console.log(err);
			});
		},

		updateCachedUserProfile: async function (name) {
			if(await this.updateOnlineStatus() === false) {
				console.log('dont updateCachedUserDB, because offline');
				throw new Error('Cant cache user profile because DB cant be reached')
			}

			let updatedProfile = await userDB.get('org.couchdb.user:' + name);
			updatedProfile._id = name; // instead of org.couchdb.user:name just the name
			delete updatedProfile._rev; // If we update we dont want the remote DBs _rev

			try {
				let cachedProfile = await localCachedUserDB.get(name);
				updatedProfile._rev = cachedProfile._rev;
			} catch  (err){
				console.log(err);
			} finally {
				localCachedUserDB.put(updatedProfile);
				return updatedProfile;
			}

		},

		getUserProfile: async function (name) {
			let userProfile;

			try {
				userProfile = await localCachedUserDB.get(name);
			} catch (err) {
				console.log('User profile not yet cached, do so now.', err);
				// This should only happen if new users appeared therefore the app is online or cache db is deleted/corrupt
				if(err.name === 'not_found') {
					try {
						userProfile = await this.updateCachedUserProfile(name);
					} catch (err_) {
						console.log('Error in getting user profile, provide unknown user object instead.', err_);
						userProfile = {prename: 'unknown', surname: 'user', color: 'grey'}
					}
				}
			} finally {
				return userProfile;
			}
		},

		// Updates the cachedUserDB based on users in a list of annotations
		// This is a bit of a crazy method, as there seems to be no working _users replication
		// for public_fields, therefore bulk fetching user docs, comparing with a local cached
		// db and updating the local db on changes.
		//
		// So, If identical user doc/info/public_fields already in cache
		// -> dont cache again as it is expensive (network traffic)


		// INFO/TODO: deprecate this one? because fetch on need is implemented with updateCachedUserProfile
		// Think about user DB updates once we actually change user info

		// updateCachedUserDB: async function (annotations) {
		//
		// 	// ALTERNATIVELY fetch annotations itself:
		// 	//
		// 	// localProjectDB.allDocs({
		// 	// 	include_docs: true,
		// 	// 	startkey: 'annotation',
		// 	// 	endkey: 'annotation\uffff'
		// 	// })
		// 	console.log(this.lastUserCacheUpdate === -1);
		// 	console.log(new Date() - this.lastUserCacheUpdate);
		// 	if(this.lastUserCacheUpdate !== -1 || new Date() - this.lastUserCacheUpdate <= 1000 * 60 * 10) {
		// 		console.log('updated user cache only 10 minutes ago, continue');
		// 		return;
		// 	} else {
		// 		console.log('not updated user cache for a longer time, do it now');
		// 	}
		//
		//
		// 	// UPDATE ONLY WHEN ONLNE!!!
		// 	if(await this.updateOnlineStatus() === false) {
		// 		console.log('dont updateCachedUserDB, because offline');
		// 		return false;
		// 	}
		//
		// 	let userIDs = new Set();
		// 	let userNames = new Set();
		//
		// 	for (let annotation of annotations) {
		// 		userNames.add(annotation.doc.creator);
		// 		userIDs.add('org.couchdb.user:' + annotation.doc.creator);
		// 	}
		//
		// 	return userDB.allDocs({
		// 		keys: [...userIDs],
		// 		include_docs: true
		// 	})
		// 	.then((result) => {
		// 		let userDocs = result.rows.map(({doc, id}) => {
		// 			// to be compatible with pouchdb-authentication
		// 			// user the user name as id instead of long id:
		// 			doc._id = id.split('org.couchdb.user:')[1];
		// 			return doc;
		// 		});
		// 		return userDocs;
		//
		// 	})
		// 	.then((userDocs) => {
		//
		// 		return localCachedUserDB.allDocs({
		// 			keys: [...userNames],
		// 			include_docs: true
		//
		// 		})
		// 		.then((cachedUserDocs) => {
		// 			cachedUserDocs = cachedUserDocs.rows;
		// 			let updatedUserDocs = [];
		// 			let hasProfileChanged = false;
		// 			let isNewProfile = false;
		//
		// 			for (var i = 0; i < userDocs.length; i++) {
		//
		// 				if((cachedUserDocs[i].error && cachedUserDocs[i].error === 'not_found')) {
		// 					// If user has never been cached before, mark as profile change
		// 					hasProfileChanged = isNewProfile = true;
		// 				} else {
		// 					// compare surname, name, color, etc. for changes
		// 					for (let prop in userDocs[i]) {
		// 						if( ((prop !== '_id' && prop !== 'doc' && prop !== '_rev') && ((cachedUserDocs[i].doc.hasOwnProperty(prop) === false) || (userDocs[i][prop] !== cachedUserDocs[i].doc[prop]))) ){
		// 							hasProfileChanged = true;
		// 							break;
		// 						}
		// 					}
		// 				}
		//
		// 				// If no change found, dont add the userdoc to the bulk update list
		// 				if(hasProfileChanged === true) {
		// 					// Use existing _rev if already not a newly cached profile
		// 					if(isNewProfile === false && cachedUserDocs[i].doc && cachedUserDocs[i].doc._rev !== undefined) {
		// 						userDocs[i]._rev = cachedUserDocs[i].doc._rev;
		// 					}
		// 					updatedUserDocs.push(userDocs[i]);
		// 				}
		// 			}
		//
		// 				return localCachedUserDB.bulkDocs(updatedUserDocs);
		// 			});
		// 		})
		// 		.then((result) => {
		// 			this.hasCachedUserDB = true;
		// 			console.log('updated user cache successfully');
		// 			this.lastUserCacheUpdate = new Date();
		// 			console.log(this.lastUserCacheUpdate);
		// 			this.updateElements();
		// 		})
		// 		.catch((err) => console.error);
		//
		//
		// },

		// Get all annotation of current project.
		// 1. Update localCachedUserDB based in annotation creators (if userDB is available)
		// 2. Use localCachedUserDB to add profile info (color, name) to annotation.
		// 3. return updated annotations.
		getAnnotations: async function() {

			if(localProjectDB === undefined) return false;
			let creators = new Set();
			let updatedCreators = new Set();
			let annotations;

			let result = await localProjectDB.allDocs({
				include_docs: true,
				startkey: 'annotation',
				endkey: 'annotation\uffff'
			});

			annotations = result.rows;

			let promiseUserUpdates = [];
			let updatedAnnotations = [];

			// Annotate/augment all annotation objects with a .creatorProfile field
			// fetched from localCachedUserDB

			for (let {doc} of annotations) {
				doc.creatorProfile = await this.getUserProfile(doc.creator);
				updatedAnnotations.push(doc);
			}

			return Promise.all(updatedAnnotations);
		},



		updateElements: async function(options) {
			if(localProjectDB === undefined) return;

			if((options.updateFile && options.updateFile === true)) {
				try {
					let info = await localProjectDB.get('info');
					let activeTopic = await localProjectDB.get(info.activeTopic);
					let blob = await localProjectDB.getAttachment(info.activeTopic, 'file');
					this.renderView.fileEnding = activeTopic.fileEnding;
					this.renderView.fileName = activeTopic.fileName;
					this.renderView.file = blob;

				} catch (err) {
					console.log(err);
				}
			}

			let updatedAnnotations = await this.getAnnotations();
			let previousSelected;
			// try selection of previous selected annotation for new list
			if(this.selectedAnnotation) {
				previousSelected = updatedAnnotations.find((annotation) => annotation._id === this.selectedAnnotation._id);
			} else {
				// Select newly created annotation
				// HACK: Its a bit hacky, because we just assume that if the last annotation
				// has no text, that it must be a newly created one. But it works.
				let lastAnnotation = updatedAnnotations[updatedAnnotations.length - 1];
				console.log('\n\n');
				console.log(lastAnnotation);
				if(lastAnnotation && lastAnnotation.description === '') previousSelected = lastAnnotation;
			}

			this.annotations = updatedAnnotations;
			// reselect previous annotation after updating ^
			if(previousSelected) {
				console.log('SELECT');
				console.log(previousSelected);
				this.$.annotationSelector.select(previousSelected);
			}

		},

		handleResize: function(event) {
			if(this.renderView) {
				this.renderView.resize();
			}
		},

		keyUp: function(evt) {
			// if(evt.keyCode === 189){
			// 	console.log('complete reset');
			// 	completeReset();
			// }
		},

		handleCreateProject: async function() {
			if(await this.updateOnlineStatus() === false) {
				dialog.showErrorBox('DokuClient', 'Error connecting to the database for new Project creation. Please check if you are connected to the internet and try again.');
				return;
			}

			let projectOverlay = document.createElement('project-setup-overlay');
			projectOverlay.classList.add("fullbleed");
			projectOverlay['with-back-drop'] = true;
			projectOverlay['auto-fit-on-attach'] = true;
			Polymer.dom(this.root).appendChild(projectOverlay);

			projectOverlay.addEventListener('iron-overlay-closed', (e) => {
				if(projectOverlay.pageNumber !== 2) return;

				this.setNewProject({
					projectname: projectOverlay.projectname,
					topicname: projectOverlay.topicname,
					file: projectOverlay.file,
					emails: ['test@test.test']
				});

				Polymer.dom(this.root).removeChild(projectOverlay);

			}, {once: true});
			projectOverlay.open();
		},

		updateProjectList: async function () {
			let doc = await localInfoDB.get('projectsInfo');
			this.projects = doc.projects;

		},

		toggleDashboard: function (e) {
			this.$.dashboard.toggle();
			this.$.projectMenuItem.classList.toggle('selected');
			this.$.dashboard.addEventListener('switch-project-click', (e) => {
				this.$.projectMenuItem.classList.toggle('selected');
			}, {once: true});
		},

		handleSwitchProject: function (e) {
			return this.switchProjectDB(e.detail);
		},

		handleDeleteProject: function (e) {

			dialog.showMessageBox({
				type: 'info',
				buttons: ['cancel', 'delete local and remote project files'],
				defaultId: 0,
				title: 'Delete Project',
				message: 'Are you sure you want to delete the project, including all annotations, files by all users inside \'' + e.detail.name + '\'? This will delete local and files on the server and can not be reversed.',
				cancelId: 0
			}, (response) => {
				console.log('going to delete??', e.detail);
				if(response === 1) this.deleteProjectDB(e.detail);
			});
		},

		resetLocalDB: function (e) {
			ipc.send('resetLocalDB');
		},

		mouseOutAnnotationLabel: function (e) {
			clearTimeout(this.labelHoverTimeout);
		},

		mouseOverAnnotationLabel: function (e) {
			// this.labelHoverTimeout = setTimeout(() => {
			// 	let annotationBox = document.getElementById('annotationbox_' + e.detail);
			// 	annotationBox.scrollIntoView({block: 'end', behavior: 'smooth'});
			// }, 500);
		},

		annotationBoxClicked: function (e) {
			console.log('annotation box clicked', e);
			console.log(e.target);
			e.target.classList.toggle('selectedAnnotation');

			let item = Polymer.dom(this.root).querySelector('.annotationListTemplate').itemForElement(e.target);
			this.$.annotationSelector.select(item);

			console.log('SELECTED ANNO', this.selectedAnnotation);

		},
		annotationBoxMouseover: function (e) {
			let item = Polymer.dom(this.root).querySelector('.annotationListTemplate').itemForElement(e.target);
			this.hoveredAnnotation = item;
		},

		_selectedAnnotationChanged: function (e) {
			if(this.renderView) this.renderView.render();
			if(this.selectedAnnotation === undefined || this.selectedAnnotation === null) return;
		},

		toolChanged: function (e) {
			this.objectTool = this.$.toolSelector.selected;
			console.log(this.objectTool);
		},
		toggleReferMode: function (e) {
			console.log('in main.app.js');


			if(this.referMode) {
				console.log('refering annotaitonEl', this.referingAnnotationEl);
				this.referMode = false;
				this.referingAnnotationEl.toggleReferIcon();
				this.referingAnnotation = undefined;
			} else {
				this.referMode = true;
				this.referingAnnotationEl = e.target;
				this.referingAnnotation = e.detail;
				this.$.toolSelector.selected = 'point';
			}
		},

		showFullAnnotationList: function (e) {
			this.$.sidePanel.increase();
		},
		getAnnotationDiff: function (e) {
			let changedAnnotations = [];
			let addedAnnotations = [];
			let removedAnnotations = [];

			// Get changed and new annotations
			for (let newAnnotation of this.annotations) {
				let oldAnnotation = oldAnnotations.find(({_id}) => _id === newAnnotation._id);

				if(oldAnnotation && oldAnnotation._rev !== newAnnotation._rev) {
					// changd annotation
					changedAnnotations.push(newAnnotation)
				} else if (oldAnnotation === undefined) {
					// new annotation
					addedAnnotations.push(newAnnotation)
				}
			}

			// Get removed annotations
			removedAnnotations = oldAnnotations === undefined ? [] : oldAnnotations.filter((oldAnnotation) => {
				return this.annotations.find((annotation) => annotation._id === oldAnnotation._id) === undefined;
			}) || [];

			return {changedAnnotations, addedAnnotations, removedAnnotations}
		},

		setupPenEventHandlers() {
			const onPenSensorState = state => {
				if (!this.renderView) return;
				this.renderView.penState = state;
			};

			const onPhysicalModelSensorState = state => {
				if (!this.renderView) return;
				this.renderView.physicalModelState = state;
			};

			let annotationIndex = 0;

			const onPenEvent = (eventName) => {
				if (eventName === 'buttonDown') {
					// this.renderView.tap(eventName);
					let worldPosition = this.renderView.pointerSphere.getWorldPosition();
					let localPosition = worldPosition.clone();
					this.renderView.fileRepresentation.worldToLocal(localPosition);
					this.renderView.mainGroupGL.worldToLocal(worldPosition);

					let worldCameraPosition = this.renderView.physicalPenModel.getWorldPosition().multiplyScalar(2.0);
					let localCameraPosition = worldCameraPosition.clone();
					this.renderView.fileRepresentation.worldToLocal(localCameraPosition);

					this.addAnnotation({
						detail: {
							description: `Annotation #${++annotationIndex}`,
							worldPosition: worldPosition,
							localPosition: localPosition,
							worldCameraPosition: worldCameraPosition,
							localCameraPosition: localCameraPosition,

							// cameraRotation: camera.rotation,
							cameraUp: this.renderView.physicalPenModel.up.clone(),
						},
					});
				}
			};

			const onPhysicalModelSensorEvent = (eventName) => {
				if (eventName === 'buttonDown') {
					this.parsers['Project Annotator Asset'].straighten();
				}
			};

			this.parsers = {
				'Project Annotator Pen': new BNO055(onPenSensorState, onPenEvent),
				'Project Annotator Asset': new BNO055(onPhysicalModelSensorState, onPhysicalModelSensorEvent),
				// 'DokuPen': new BNO055(onPenSensorState, onPenEvent),
				'Adafruit Bluefruit LE': new BNO055(onPhysicalModelSensorState, onPhysicalModelSensorEvent),

			};

			ipc.on('connectStatus', (emitter, deviceName, status, percent) => {
				console.log('\n\ndevicename:', deviceName);
				console.log('status:', status);
				this.penStatus = status;
				this.penStatusPercent = percent;
				this.penButtonText = status === 'connecting' ? `${status} (${percent}%)` : `${status}`;
				console.log('Connect status:', status, percent);
				if (status === 'connected' && percent === 100) {
					this.penButtonText = 'Disconnect Sensors';
					this.parsers[deviceName].reset();
					this.penButtonConnected = true;
					this.penButtonConnecting = false;
					setTimeout(() => {
						this.penSensorDataParser.straighten();
					}, 5000);
				} else if (status === 'disconnecting') {
					this.penButtonText = 'Connect Sensors';
					this.penButtonConnected = false;
				}


				console.log('Connect status:', status, percent);
				// setTimeout(() => {
				// 	this.bno055.straighten();
				// }, 5000);

			});

			ipc.on('uartRx', (emitter, deviceName, data) => {
				this.parsers[deviceName].push(data);
			});
		}
	});
