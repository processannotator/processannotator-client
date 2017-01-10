/* eslint no-alert:0*/
'use strict'; /*eslint global-strict:0*/

import BNO055 from './bno055';
// import SpeechRecognition from './speechRecognition'
const electron = require('electron');
const ipc = electron.ipcRenderer;
const { dialog } = electron.remote;
const SERVERADDR = '141.20.168.11';
const PORT = '80';

var localInfoDB, remoteInfoDB, localProjectDB, userDB, remoteProjectDB, localCachedUserDB;
var sync;


Polymer({
	is: 'main-app',

	properties: {
		objectTool: {
			type: 'Object'
		},
		selectedAnnotation: {
			type: 'Object',
			notify: true,
			observer: '_selectedAnnotationChanged'
		}

	},
	observers: [
	],

	attached: function () {
		document.app = this;

		this.setupPenEventHandlers();
		this.penButtonText = 'Connect Pen';
		this.projects = [];
		this.activeProject = {_id: 'collabdb', activeTopic: 'topic_1'};
		this.hasCachedUserDB = false;
		this.remoteUrl = 'http://' + SERVERADDR + ':' + PORT;
		this.isOnline = window.navigator.onLine;
		window.addEventListener("offline", (e) => { this.isOnline = false; });
		window.addEventListener("online", (e) => { this.isOnline = true });

		this.renderView = document.querySelector('render-view');

		localInfoDB = new PouchDB('info');
		remoteInfoDB = new PouchDB(this.remoteUrl + '/info');
		localInfoDB.sync(remoteInfoDB, {live: true, retry: true });
		this.updateProjectList();
		localInfoDB.changes( {live: true, since: 'now'} )
		.on('change', this.updateProjectList)
		.on('error', err => console.log);


		// Contains public user info (color, name) and is used for offline situations
		// and to reduce traffic.
		localCachedUserDB = new PouchDB('localCachedUserDB');
		userDB = new PouchDB(this.remoteUrl + '/_users');


		this.loadPreferences().then(() => {
			return new Promise((resolve, reject) => {
				if(this.activeProfile === ''){
					console.log('NO ACTIVE PROFIL found in the preferences! creating one now.');

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

		}).then(() => {
			console.log('ok, loaded or created the active profile. Now check if there is an active project');
			console.log(this.activeProject);
			if( this.activeProject === undefined || Object.keys(this.activeProject).length === 0) {
				this.projectOpened = false;
				console.log('no active profile yet!');
			} else {
				this.projectOpened = true;
				return this.switchProjectDB(this.activeProject);
			}

		}).then(() => {
			// TODO, design better interval handling for these kind of background tasks
			// as we may have a few more in the future:
			// setInterval(() => { this.updateCachedUserDB()}, 600 * 1000);

			return this.updateElements({updateFile: true});
		})

		window.addEventListener('resize', this.handleResize.bind(this));
		window.addEventListener('keyup', this.keyUp.bind(this));
	},

	// Return false if either whole computer is offline or databases are unreachable
	onlineStatus: function () {
			if(this.isOnline === false) return Promise.resolve(false);
			console.log('ask online status');
			return userDB.info().catch(function (err) {
					return false;
			}).then(() => {
				return true;
			})



	},

	connectOrDisconnectPen: function () {

		if (this.penStatus === 'Connected') {
			ipc.send('disconnectPen');
			console.log('trying to disconnect pen');
		} else {
			ipc.send('startScan');
			console.log('trying to connect pen');
		}
	},

	deleteProjectDB: function (project) {

		// HACK: Only in testing phase, any user can delete any project DB by
		// modifying the array projectsInfo.projects of the `info` db
		// In the future only allow db members to delete their project db, by modifying a users projects array.
		return localInfoDB.get('projectsInfo').then((doc) => {

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
		})
		.catch((err) => {
			console.error('something went wrong deleting', project._id);
			console.error(err);
		});

	},

	switchProjectDB: function(newProject) {
		console.log('switch to projectDB with name', this.activeProject);

		// Reset check wether remote user db got cached, to allow for updatingthe cached
		// when a project is switched
		this.hasCachedUserDB = false;
		this.activeProject = newProject;
		this.annotations = [];
		localProjectDB = new PouchDB(this.activeProject._id, {adapter: 'worker'});
		remoteProjectDB = new PouchDB(this.remoteUrl + '/' + this.activeProject._id, {adapter: 'worker'});

		this.savePreferences();

		sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
			live: true,
			retry: true
		}).on('error', err => {
			console.log('sync error', err);
		});

		localProjectDB.changes({live: true, since: 'now', include_docs: true})
		.on('change', (info) => {
			// only update also the file (for the renderer) if it's not an annotation
			let updateFile = false;
			if(info.doc.type !== 'annotation') {
				updateFile = true;
			}
			// Reduce calls to this.updateElements if there are many simultaneous changes!
			// Therefore only update every 30ms
			// This would not be valid if we only actually update individual elements from changes,
			// as we would have to notify updateElements about the actual changed docs. this is not true yet and may never be, just wanted to note this here in case we ever decide to do so:)
			clearTimeout(this.updateTimeout);
			this.updateTimeout = setTimeout(() => {
				this.updateElements({updateFile: updateFile});
			}, 30);

		})
		.on('complete', function(info) {})
		.on('error', function (err) {console.log(err)});

		localProjectDB.get('info').then(info => {
			this.activeProject.activeTopic = info.activeTopic;
			// TODO: Design more streamlined way for regular intervals like updating user cache
			// put this in a worker perhaps too?
			return this.updateElements({updateFile: true});
		});



		// TODO: this.switchTopic().then(() => {
		//  this.updateElements
		// })

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
	addAnnotation: function({detail: {description='', position={x: 0, y: 0, z: 0}, cameraPosition={x: 0, y: 0, z: 0}, cameraRotation={x: 0, y: 0, z: 0}, cameraUp={x: 0, y: 0, z: 0}, polygon=[]}}) {

		let annotation = {
			_id: 'annotation_' + new Date().toISOString(),
			type: 'annotation',
			status: 'status',
			parentProject: this.activeProject._id,
			parentTopic: this.activeProject.activeTopic,
			parentObject: this.activeObject_id,
			creator: this.activeProfile.name,
			creationDate: new Date().toISOString(),
			cameraPosition,
			// cameraRotation,
			cameraUp,
			description,
			position,
			polygon
		};

		return localProjectDB.put(annotation)
		.catch(err => console.log)
	},

	deleteAnnotation: function (annotation) {
		console.log('removing', annotation);
		return localProjectDB.remove(annotation)
		.catch((err) => {
			console.error('error deleting', id);
			console.error(err);
		});
	},

	login: function(user, password) {
		return userDB.login(user, password);
	},

	loadPreferences: function() {
		return localInfoDB.get('_local/lastSession')
		.then((preferences) => {

			if(preferences !== undefined) {
				console.log(preferences);
				this.preferences = preferences;
				this.activeProfile = preferences.activeProfile;
				this.activeProject = preferences.activeProject;
			} else {
				throw	new Error('No preferences loaded.');
			}


			return this.login(preferences.activeProfile.name, preferences.activeProfile.password);
		})
		.then(response => {
			return userDB.getSession();
		})
    .then(response => {
      if (!response.userCtx.name) {
				console.error('Couldnt get user session: hmm, nobody logged on.');
			}
			this.updateProjectList();

			// got session, that means login works and user remains logged in, get more userInfo now.
			return userDB.getUser(this.activeProfile.name);
		})
		.then(updatedProfile => {
			// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
			this.activeProfile = Object.assign(updatedProfile, this.activeProfile);
			return this.preferences;
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
					return this.loadPreferences();
				})
				.catch((error) => {
					console.log(error);
				});
			} else {
				console.error('possible no internet connection, just use offline data for now', err);
				return this.preferences;
			}
		});
	},

	savePreferences: function() {

		// _local/lastSession should exist because loadPreferences creates it.
		return localInfoDB.get('_local/lastSession').then(doc => {
			doc.activeProfile = this.activeProfile;
			doc.activeProject = this.activeProject;
			return localInfoDB.put(doc);
		})
		.then( result => {
			console.log('saved preferences.', result);
		})
		.catch( err => {
			console.log('error in saving preferences', err);
		});
	},

	setNewProfile: function({prename, surname, email, color}) {
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
		return this.savePreferences()
		.then(() => {
			// The testkey is necessary, otherwise the user will get deleted and won't get the proper db role.
			metadata.testkey = 'testuserkey';
			metadata.projects = [];
			return userDB.signup( name, password, {metadata} );
		})
		.then( response => { return userDB.login(name, password) })
		.then( response => {
			console.log('succesfully created user and logged in.', response);
			return userDB.getUser(name);
		})
		.then( response => {
			this.activeProfile = Object.assign(this.activeProfile, response);
			this.updateProjectList();
		})
		.catch(err => console.error);
	},

	setNewProject: function({projectname, topicname, file, emails}) {
		// Assumes current activeProfile as the creator.
		// We will create a new db for the project.
		// However, only server admins are allowed to create db's in couchdb,
		// so we are sending a message via websockets to let the server create the DB.

		// FIXME: create some kind of queue in the preferences to send out the request
		// at a later time when the server is offline.

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
			// This field will get read on the server, which decices wether to create a
			// DB for it.

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
				if(err.status === 404) {
					return localInfoDB.put({_id: 'projectsInfo', projects: [newProjectDescription]});
				}
			});

			// Finally adding the new project to our app scope, notifying all listeners
			this.push('projects', newProjectDescription);

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

		// Updates the cachedUserDB based on users in a list of annotations
		// This is a bit of a crazy method, as there seems to be no working _users replication
		// for public_fields, therefore bulk fetching user docs, comparing with a local cached
		// db and updating the local db on changes.
		//
		// So, If identical user doc/info/public_fields already in cache
		// -> dont cache again as it is expensive (network traffic)
		updateCachedUserDB: function (annotations) {

			// ALTERNATIVELY fetch annotations itself:
			//
			// localProjectDB.allDocs({
			// 	include_docs: true,
			// 	startkey: 'annotation',
			// 	endkey: 'annotation\uffff'
			// })


			// UPDATE ONLY WHEN ONLNE!!!
			return this.onlineStatus().then((status) => {

				if(status === false) {
					console.log('dont updateCachedUserDB, because offline');
					return Promise.reject();
				}


				let userIDs = new Set();
				let userNames = new Set();

				for (let annotation of annotations) {
					userNames.add(annotation.doc.creator);
					userIDs.add('org.couchdb.user:' + annotation.doc.creator);
				}

				return userDB.allDocs({
					keys: [...userIDs],
					include_docs: true
				})
				.then((result) => {
					let userDocs = result.rows.map(({doc, id}) => {
						// to be compatible with pouchdb-authentication
						// user the user name as id instead of long id:
						doc._id = id.split('org.couchdb.user:')[1];
						return doc;
					});
					return userDocs;

				})
				.then((userDocs) => {

					return localCachedUserDB.allDocs({
						keys: [...userNames],
						include_docs: true

					})
					.then((cachedUserDocs) => {
						cachedUserDocs = cachedUserDocs.rows;
						let updatedUserDocs = [];
						let hasProfileChanged = false;
						let isNewProfile = false;

						for (var i = 0; i < userDocs.length; i++) {

							if((cachedUserDocs[i].error && cachedUserDocs[i].error === 'not_found')) {
								// If user has never been cached before, mark as profile change
								hasProfileChanged = isNewProfile = true;
							} else {
								// compare surname, name, color, etc. for changes
								for (let prop in userDocs[i]) {
									if( ((prop !== '_id' && prop !== 'doc' && prop !== '_rev') && ((cachedUserDocs[i].doc.hasOwnProperty(prop) === false) || (userDocs[i][prop] !== cachedUserDocs[i].doc[prop]))) ){
										hasProfileChanged = true;
										break;
									}
								}
							}

							// If no change found, dont add the userdoc to the bulk update list
							if(hasProfileChanged === true) {
								// Use existing _rev if already not a newly cached profile
								if(isNewProfile === false && cachedUserDocs[i].doc && cachedUserDocs[i].doc._rev !== undefined) {
									userDocs[i]._rev = cachedUserDocs[i].doc._rev;
								}
								updatedUserDocs.push(userDocs[i]);
							}
						}
						return localCachedUserDB.bulkDocs(updatedUserDocs);
					});
				})
				.then((result) => {
					this.hasCachedUserDB = true;
					this.updateElements();
				})
				.catch((err) => console.error);

			}).catch((err) => {console.log})

		},

		// Get all annotation of current project.
		// 1. Update localCachedUserDB based in annotation creators (if userDB is available)
		// 2. Use localCachedUserDB to add profile info (color, name) to annotation.
		// 3. return updated annotations.
		getAnnotations: function() {

			if(localProjectDB === undefined) return false;
			let creators = new Set();
			let updatedCreators = new Set();
			let annotations;

			return localProjectDB.allDocs({
				include_docs: true,
				startkey: 'annotation',
				endkey: 'annotation\uffff'
			})
			.then((result) => {
				annotations = result.rows;
				return this.updateCachedUserDB(annotations);
			})
			.then(() => {

				let promiseUserUpdates = [];
				let updatedAnnotations = [];

				// Annotate/augment all annotation objects with a .creatorProfile field
				// fetched from localCachedUserDB
				for (let {doc} of annotations) {

					let updatedAnnotation = localCachedUserDB.get(doc.creator)
					.then((creatorProfile) => {
						doc.creatorProfile = creatorProfile;
						return doc;
					})
					.catch(err_ => {

						console.log(err_);
					});

					updatedAnnotations.push(updatedAnnotation);
				}

				return Promise.all(updatedAnnotations);
			});
		},

		onAnnotationDeleted(evt) {
			localProjectDB.remove(evt.detail.annotation);
		},

		onAnnotationEdit: function(evt) {

			// If edit is temporary, don't inform the database
			if(evt.detail.temporary === true) {
				this.renderView.labels.get(evt.detail.newAnnotation._id).userData.div.innerHTML = evt.detail.newAnnotation.description;
				return;
			}
			console.log('edited annotation, inform database');




			// emitted when user edits text in annotationbox
			localProjectDB.get(evt.detail.newAnnotation._id).then(doc => {
				doc.description = evt.detail.newAnnotation.description;
				doc.status = evt.detail.newAnnotation.status;
				// TODO: get colors from CSS, so it stays in one place?
				switch (doc.status) {
					case 'comment':
						doc.statusColor = 'blue';
						break;
					case 'task':
						doc.statusColor = 'yellow';
						break;
					case 'problem':
						doc.statusColor = 'red';
						break;
					default: break;
				}

				return localProjectDB.put(doc).then((value) => {});
				// after put into DB, DB change event should be triggered automatically to update
			});//.then(() => {updateElements()})
		},

		updateElements: function(options) {
			if(localProjectDB === undefined) return;

			if((options.updateFile && options.updateFile === true)) {
				localProjectDB.get('info')
				.then((doc) => {
					return localProjectDB.getAttachment(doc.activeTopic, 'file');
				})
				.then((blob) => {
					this.renderView.file = blob;
					return Promise.resolve();
				})
				.catch((err) => console.log);
			}

			this.getAnnotations().then(annotations => {
				this.annotations = annotations;
			});
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

		handleCreateProject: function() {
			let projectOverlay = document.querySelector('#projectSetupOverlay');
			projectOverlay.addEventListener('iron-overlay-closed', (e) => {

				this.setNewProject({
					projectname: projectOverlay.projectname,
					topicname: projectOverlay.topicname,
					file: projectOverlay.file,
					emails: ['test@test.test']
				});

			});
			projectOverlay.open();
		},

		updateProjectList: function () {
			return localInfoDB.get('projectsInfo').then((doc) => {
				this.set('projects', doc.projects);
			}).catch((err) => console.log);
		},

		toggleDashboard: function (e) {
			this.$.dashboard.toggle();
			this.$.projectMenuItem.classList.toggle('selected');
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
			ipc.send('asynchronous-message', 'resetLocalDB');
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
			e.target.classList.toggle('selectedAnnotation');
			let item = Polymer.dom(this.root).querySelector('.annotationListTemplate').itemForElement(e.target);
			this.$.annotationSelector.select(item);
		},

		_selectedAnnotationChanged: function (e) {
			if(this.selectedAnnotation === undefined || this.selectedAnnotation === null) return;
			this.renderView.focusAnnotation(this.selectedAnnotation);
		},

		toolChanged: function (e) {
			this.objectTool = this.$.toolSelector.selected;
			console.log(this.objectTool);
		},

		setupPenEventHandlers() {
			const callback = state => {
				if (!renderView) return;
				this.renderView.physicalModelState = state;
			};

			let annotationIndex = 0;

			const penCallback = (eventName) => {
				if (eventName === 'buttonDown') {
					this.addAnnotation({
						detail: {
							description: `Annotation #${++annotationIndex}`,
							position: this.renderView.pointerSphere.getWorldPosition(),
							cameraPosition: this.renderView.physicalPenModel.getWorldPosition().multiplyScalar(1.3),
							// cameraRotation: camera.rotation,
							cameraUp: this.renderView.camera.up,
						},
					});
				}
			};

			this.bno055 = new BNO055(callback, penCallback);
			ipc.on('connectStatus', (emitter, status, percent) => {
				this.penStatus = status;
				this.penStatusPercent = percent;
				this.penButtonText = status === 'Connecting' ? `${status} (${percent}%)` : `${status}`;
				console.log('Connect status:', status, percent);
				// setTimeout(() => {
				// 	this.bno055.straighten();
				// }, 5000);
				if (status === 'Connected' && percent === 100) {
					this.penButtonText = 'Disconnect Pen';
					this.bno055.reset();
				} else if (status === 'Disconnected') {
					this.penButtonText = 'Connect Pen';
				}
			});

			ipc.on('uartRx', (emitter, data) => this.bno055.push(data));
		}
	});
