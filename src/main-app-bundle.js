var asyncToGenerator = function (fn) {
  return function () {
    var gen = fn.apply(this, arguments);
    return new Promise(function (resolve, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }

        if (info.done) {
          resolve(value);
        } else {
          return Promise.resolve(value).then(function (value) {
            step("next", value);
          }, function (err) {
            step("throw", err);
          });
        }
      }

      return step("next");
    });
  };
};











var get = function get(object, property, receiver) {
  if (object === null) object = Function.prototype;
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent === null) {
      return undefined;
    } else {
      return get(parent, property, receiver);
    }
  } else if ("value" in desc) {
    return desc.value;
  } else {
    var getter = desc.get;

    if (getter === undefined) {
      return undefined;
    }

    return getter.call(receiver);
  }
};

















var set = function set(object, property, value, receiver) {
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent !== null) {
      set(parent, property, value, receiver);
    }
  } else if ("value" in desc && desc.writable) {
    desc.value = value;
  } else {
    var setter = desc.set;

    if (setter !== undefined) {
      setter.call(receiver, value);
    }
  }

  return value;
};

/* eslint no-alert:0*/
// Uses rollup-replace to replace "production" with the env set when starting rollup

const SERVERADDR = '127.0.0.1';
const PORT = '80';
const POUCHCONF = {};

var localInfoDB;
var remoteInfoDB;
var localProjectDB;
var userDB;
var remoteProjectDB;
var localCachedUserDB;
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
		}

	},
	observers: [],

	attached: (() => {
		var _ref = asyncToGenerator(function* () {
			var _this = this;

			document.app = this;

			this.penButtonText = 'Connect Pen';
			this.objectButtonText = 'Connect Object';
			this.penButtonConnecting = false;
			this.penButtonConnected = false;
			this.objectButtonConnecting = false;
			this.onlineStatus = false;
			this.OnlineStatusText = '-';

			this.projects = [];
			this.activeProject = { _id: 'collabdb', activeTopic: 'topic_1' };
			this.hasCachedUserDB = false;
			this.lastUserCacheUpdate = -1;
			this.remoteUrl = 'http://' + SERVERADDR + ':' + PORT;
			this.isOnline = window.navigator.onLine;
			window.addEventListener('offline', this.updateOnlineStatus.bind(this));
			window.addEventListener('online', this.updateOnlineStatus.bind(this));

			this.renderView = this.$.renderView;

			localInfoDB = new PouchDB('info', POUCHCONF);
			remoteInfoDB = new PouchDB(this.remoteUrl + '/info', POUCHCONF);
			localInfoDB.sync(remoteInfoDB, { live: true, retry: true });
			this.updateProjectList();
			localInfoDB.changes({ live: true, since: 'now' }).on('change', this.updateProjectList).on('error', function (err) {
				console.log('ERROR');
			});

			setInterval(this.updateOnlineStatus.bind(this), 1000 * 30);
			this.updateOnlineStatus();

			// Contains public user info (color, name) and is used for offline situations
			// and to reduce traffic.
			localCachedUserDB = new PouchDB('localCachedUserDB', POUCHCONF);
			userDB = new PouchDB(this.remoteUrl + '/_users', POUCHCONF);

			this.loadPreferences().then(function () {
				return new Promise((() => {
					var _ref2 = asyncToGenerator(function* (resolve, reject) {
						console.log('Loaded preferences.');

						if (_this.activeProfile === '' || _this.activeProfile === undefined) {
							console.log('NO ACTIVE PROFIL found in the preferences! creating one now.');

							if ((yield _this.updateOnlineStatus()) === false) {
								alert('Error connecting to the database for new user registration. Please check if you are connected to the internet and try again.');
								// ipc.send('quit');
							}

							let profileOverlay = _this.$.profileSetupOverlay;
							profileOverlay.addEventListener('iron-overlay-closed', function (e) {
								_this.setNewProfile({
									prename: profileOverlay.prename,
									surname: profileOverlay.surname,
									color: profileOverlay.color,
									email: profileOverlay.email
								}).then(function (result) {
									resolve(_this.activeProfile);
								});
							});
							profileOverlay.open();
						} else if (_this.activeProfile !== undefined) {
							resolve(_this.activeProfile);
						}
					});

					return function (_x, _x2) {
						return _ref2.apply(this, arguments);
					};
				})());
			}).then(asyncToGenerator(function* () {
				console.log('ok, loaded or created the active profile. Now check if there is an active project');
				console.log(_this.activeProject);

				if (_this.activeProject === undefined || Object.keys(_this.activeProject).length === 0) {
					_this.projectOpened = false;
					console.log('no active profile yet!');
				} else {
					_this.projectOpened = true;
					yield _this.switchProjectDB(_this.activeProject);
				}

				return _this.updateElements({ updateFile: true });
			}));

			window.addEventListener('resize', this.handleResize.bind(this));
			window.addEventListener('keyup', this.keyUp.bind(this));
		});

		return function attached() {
			return _ref.apply(this, arguments);
		};
	})(),

	// Return false if either whole computer is offline or databases are unreachable
	updateOnlineStatus: (() => {
		var _ref4 = asyncToGenerator(function* () {

			let status = false;
			if (window.navigator.onLine === false) {
				status = false;
			} else {
				try {
					let info = yield remoteInfoDB.info();
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
		});

		return function updateOnlineStatus() {
			return _ref4.apply(this, arguments);
		};
	})(),

	deleteProjectDB: (() => {
		var _ref5 = asyncToGenerator(function* (project) {

			// HACK: Only in testing phase, any user can delete any project DB by
			// modifying the array projectsInfo.projects of the `info` db
			// In the future only allow db members to delete their project db, by modifying a users projects array.

			try {
				let doc = yield localInfoDB.get('projectsInfo');
				console.log(doc);
				let index;
				for (var i = 0; i < doc.projects.length; i++) {
					if (doc.projects[i]._id === project._id) {
						index = i;
					}
				}

				if (index === undefined) {
					throw new Error('User tried to delete', project._id, 'but a DB with that name is not listed in the `info` db inside projectsInfo.projects. Perhaps the info DB wasnt properly created?');
				} else {
					doc.projects.splice(index, 1);
					return localInfoDB.put(doc).then(function () {
						localProjectDB.destroy();
						remoteProjectDB.destroy();
					});
				}
			} catch (err) {
				console.error('something went wrong deleting', project._id);
				console.log(err);
			} finally {
				this.updateProjectList();
				this.updateElements();
			}
		});

		return function deleteProjectDB(_x3) {
			return _ref5.apply(this, arguments);
		};
	})(),

	switchProjectDB: (() => {
		var _ref6 = asyncToGenerator(function* (newProject) {
			var _this2 = this;

			console.log('switch to projectDB with name', this.activeProject);

			// Reset check wether remote user db got cached, to allow for updatingthe cached
			// when a project is switched
			this.hasCachedUserDB = false;
			this.lastUserCacheUpdate = -1;
			this.activeProject = newProject;
			this.annotations = [];
			localProjectDB = new PouchDB(this.activeProject._id, Object.assign({}, POUCHCONF, { adapter: 'worker' }));
			remoteProjectDB = new PouchDB(this.remoteUrl + '/' + this.activeProject._id, Object.assign({}, POUCHCONF, { adapter: 'worker' }));

			this.savePreferences();
			let info;
			// console.log(info);
			sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
				live: true,
				retry: true
			}).on('change', function (info_) {
				console.log(info);
				// Deactivate sync status after 100ms
				if (!_this2.dbSyncActive) {
					setTimeout(function () {
						_this2.dbSyncActive = false;
					}, 100);
				}
				_this2.dbSyncActive = true;
			}).on('error', function (err) {
				console.log('sync error', err);
			});

			localProjectDB.changes({ live: true, since: 'now', include_docs: true }).on('change', function (info) {
				// only update also the file (for the renderer) if it's not an annotation
				let updateFile = false;
				// console.log(info.doc);
				if (info.doc.type !== 'annotation' && info.doc._deleted === undefined) {
					updateFile = true;
				}
				// Reduce calls to this.updateElements if there are many simultaneous changes!
				// Therefore only update every 30ms
				// This would not be valid if we only actually update individual elements from changes,
				// as we would have to notify updateElements about the actual changed docs. this is not true yet and may never be, just wanted to note this here in case we ever decide to do so:)
				clearTimeout(_this2.updateTimeout);
				_this2.updateTimeout = setTimeout(function () {
					_this2.updateOnlineStatus();
					_this2.updateElements({ updateFile: updateFile });
				}, 30);
			}).on('complete', function (info) {}).on('active', function () {
				console.log('active...');
			}).on('error', function (err) {
				console.log(err);
			});

			info = yield localProjectDB.get('info');
			this.activeProject.activeTopic = info.activeTopic;
			yield this.updateElements({ updateFile: true });

			return sync;
		});

		return function switchProjectDB(_x4) {
			return _ref6.apply(this, arguments);
		};
	})(),

	addTopic: function () {
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
	addAnnotation: function ({ detail: {
			description = '',
			localCameraPosition = { x: 0, y: 0, z: 0 },
			worldCameraPosition = { x: 0, y: 0, z: 0 },
			localPosition = { x: 0, y: 0, z: 0 },
			worldPosition = { x: 0, y: 0, z: 0 },
			cameraRotation = { x: 0, y: 0, z: 0 },
			cameraUp = { x: 0, y: 0, z: 0 },
			polygon = [] }
	}) {

		let annotation = {
			_id: 'annotation_' + new Date().toISOString(),
			type: 'annotation',
			status: 'comment',
			parentProject: this.activeProject._id,
			parentTopic: this.activeProject.activeTopic,
			parentObject: this.activeObject_id,
			creator: this.activeProfile.name,
			creationDate: new Date().toISOString(),
			localCameraPosition,
			worldCameraPosition,
			// cameraRotation,
			cameraUp,
			description,
			localPosition,
			worldPosition,
			polygon
		};

		return localProjectDB.put(annotation).catch(err => console.log);
	},

	deleteAnnotation: function (annotation) {
		console.log('removing', annotation);
		return localProjectDB.remove(annotation).catch(err => {
			console.error('error deleting', id);
			console.error(err);
		});
	},

	login: function (user, password) {
		return userDB.login(user, password);
	},

	loadPreferences: (() => {
		var _ref7 = asyncToGenerator(function* () {

			try {

				let preferences = yield localInfoDB.get('_local/lastSession');

				if (preferences !== undefined) {
					this.preferences = preferences;
					this.activeProfile = preferences.activeProfile;
					this.activeProject = preferences.activeProject;
				} else {
					throw new Error('No preferences loaded.');
				}

				let response = yield this.login(preferences.activeProfile.name, preferences.activeProfile.password);
				respose = yield userDB.getSession();
				if (!response.name || response.userCtx && !response.userCtx.name) {}
				this.updateProjectList();

				// got session, that means login works and user remains logged in, get more userInfo now.
				let updatedProfile = yield userDB.getUser(this.activeProfile.name);

				// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
				this.activeProfile = Object.assign(updatedProfile, this.activeProfile);

				return this.preferences;
			} catch (err) {

				if (err.message === 'missing') {
					console.log('no preferences yet, creating template.');

					let result = yield localInfoDB.put({
						_id: '_local/lastSession',
						projects: [],
						activeProfile: '',
						activeProject: {}
					});

					//trying to reload preferences after setting fresh initial one.
					return this.loadPreferences();
				} else {
					console.error('possible no internet connection, just use offline data for now', err);
					return this.preferences;
				}
			}
		});

		return function loadPreferences() {
			return _ref7.apply(this, arguments);
		};
	})(),

	savePreferences: (() => {
		var _ref8 = asyncToGenerator(function* () {

			// _local/lastSession should exist because loadPreferences creates it.
			try {
				let doc = yield localInfoDB.get('_local/lastSession');
				doc.activeProfile = this.activeProfile;
				doc.activeProject = this.activeProject;
				let result = yield localInfoDB.put(doc);
				console.log('saved preferences.', result);
			} catch (err) {
				console.log('error in saving preferences', err);
			}
		});

		return function savePreferences() {
			return _ref8.apply(this, arguments);
		};
	})(),

	setNewProfile: (() => {
		var _ref9 = asyncToGenerator(function* ({ prename, surname, email, color }) {

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
			this.activeProfile = { name: name, password, metadata };
			// FIXME: will be problematic when doing an offline 'signup'
			// will need to redo the signup once possible

			// Before trying any network stuff, save preferences with locally created profile.
			yield this.savePreferences();

			// The testkey is necessary, otherwise the user will get deleted and won't get the proper db role.
			metadata.testkey = 'testuserkey';
			metadata.projects = [];

			try {
				yield userDB.signup(name, password, { metadata });
				let response = userDB.login(name, password);
				let profile = yield userDB.getUser(name);
				this.activeProfile = Object.assign(this.activeProfile, profile);
				console.log('succesfully created user and logged in.', response);
				this.updateProjectList();
			} catch (err) {
				console.log('Error signup new user', err);
				alert('Error: Could not signup/login new user:\n' + err);
			}
		});

		return function setNewProfile(_x5) {
			return _ref9.apply(this, arguments);
		};
	})(),

	setNewProject: (() => {
		var _ref10 = asyncToGenerator(function* ({ projectname, topicname, file, emails }) {
			var _this3 = this;

			// Assumes current activeProfile as the creator.
			// We will create a new db for the project.
			// However, only server admins are allowed to create db's in couchdb,
			// so we are sending a message via websockets to let the server create the DB.

			// FIXME: create some kind of queue in the preferences to send out the request
			// at a later time when the server is offline.

			let fileEnding = file.name.split('.').pop();
			if (fileEnding !== 'obj' && fileEnding !== 'dae') {
				alert('For now you can only upload OBJ and DAE files.');
				return;
			}

			if ((yield this.updateOnlineStatus()) === false) {
				alert('Error connecting to the database for Project creation. Please check if you are connected to the internet and try again.');
				return;
			}

			function normalizeCouchDBName(name) {
				return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_$()+/-]/g, '$');
			}

			let topicID = 'topic_' + topicname;
			let newProjectDescription = {
				_id: 'project_' + Date.now() + '_' + normalizeCouchDBName(projectname),
				name: projectname,
				activeTopic: topicID
			};

			userDB.getUser(this.activeProfile.name).then(function (response) {
				// Save intend of user to create new DB into it's 'projects' field.
				// This field will get read on the server, which decides wether to create a
				// DB for it. This is a security measure, so you cant just create a DB on the server
				// but the server evaluates whether it is ok to create one. This may not apply
				// to test couchdb server mode (when running a pouchdb-server eg.)

				response.projects.push(newProjectDescription._id);

				return userDB.putUser(_this3.activeProfile.name, { metadata: { projects: response.projects } });
			}).then(function () {
				_this3.projectOpened = true;
				// Also add an entry in our projectsInfo DB that a new DB was created:
				localInfoDB.get('projectsInfo').then(function (doc) {
					doc.projects.push(newProjectDescription);
					return localInfoDB.put(doc);
				}).catch(function (err) {
					console.log('Hm, something went wrong creating the new Project');
					console.log(err);
					if (err.status === 404) {
						return localInfoDB.put({ _id: 'projectsInfo', projects: [newProjectDescription] });
					}
				});

				// Finally adding the new project to our app scope, notifying all listeners
				_this3.push('projects', newProjectDescription);

				// Set appropriate mime type for blob
				let contentType = 'text/plain';

				if (fileEnding === 'dae') {
					contentType = 'model/vnd.collada+xml';
				} else if (fileEnding === 'obj') {
					contentType = 'text/plain';
				}

				let blob = new Blob([file], { type: contentType });

				// independently of internet connection and remote DB already create local DB
				// and add first topic with object/file
				return new PouchDB(newProjectDescription._id, POUCHCONF).bulkDocs([{
					_id: 'info',
					name: projectname,
					activeTopic: topicID
				}, {
					_id: 'topic_' + topicname,
					fileName: file.name,
					fileEnding: fileEnding,
					'_attachments': {
						'file': { 'content_type': contentType, 'data': blob }
					}
				}]);
			}).then(function () {
				return _this3.switchProjectDB(newProjectDescription);
			}).then(function (result) {
				_this3.activeProject.activeTopic = topicID;
				return _this3.updateElements({ updateFile: true });
			}).catch(function (err) {
				console.log('something went wrong creating the new project db');
				console.log(err);
			});
		});

		return function setNewProject(_x6) {
			return _ref10.apply(this, arguments);
		};
	})(),

	updateCachedUserProfile: (() => {
		var _ref11 = asyncToGenerator(function* (name) {
			if ((yield this.updateOnlineStatus()) === false) {
				console.log('dont updateCachedUserDB, because offline');
				throw new Error('Cant cache user profile because DB cant be reached');
			}

			let updatedProfile = yield userDB.get('org.couchdb.user:' + name);
			updatedProfile._id = name; // instead of org.couchdb.user:name just the name
			delete updatedProfile._rev; // If we update we dont want the remote DBs _rev

			try {
				let cachedProfile = yield localCachedUserDB.get(name);
				updatedProfile._rev = cachedProfile._rev;
			} catch (err) {
				console.log(err);
			} finally {
				localCachedUserDB.put(updatedProfile);
				return updatedProfile;
			}
		});

		return function updateCachedUserProfile(_x7) {
			return _ref11.apply(this, arguments);
		};
	})(),

	getUserProfile: (() => {
		var _ref12 = asyncToGenerator(function* (name) {
			let userProfile;

			try {
				userProfile = yield localCachedUserDB.get(name);
			} catch (err) {
				console.log('User profile not yet cached, do so now.', err);
				// This should only happen if new users appeared therefore the app is online or cache db is deleted/corrupt
				if (err.name === 'not_found') {
					try {
						userProfile = yield this.updateCachedUserProfile(name);
					} catch (err_) {
						console.log('Error in getting user profile, provide unknown user object instead.', err_);
						userProfile = { prename: 'unknown', surname: 'user', color: 'grey' };
					}
				}
			} finally {
				return userProfile;
			}
		});

		return function getUserProfile(_x8) {
			return _ref12.apply(this, arguments);
		};
	})(),

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
	getAnnotations: (() => {
		var _ref13 = asyncToGenerator(function* () {

			if (localProjectDB === undefined) return false;
			let creators = new Set();
			let updatedCreators = new Set();
			let annotations;

			let result = yield localProjectDB.allDocs({
				include_docs: true,
				startkey: 'annotation',
				endkey: 'annotation\uffff'
			});

			annotations = result.rows;

			let promiseUserUpdates = [];
			let updatedAnnotations = [];

			// Annotate/augment all annotation objects with a .creatorProfile field
			// fetched from localCachedUserDB

			for (let { doc } of annotations) {
				doc.creatorProfile = yield this.getUserProfile(doc.creator);
				updatedAnnotations.push(doc);
			}

			return Promise.all(updatedAnnotations);
		});

		return function getAnnotations() {
			return _ref13.apply(this, arguments);
		};
	})(),

	onAnnotationDeleted(evt) {
		localProjectDB.remove(evt.detail.annotation);
	},

	onAnnotationEdit: (() => {
		var _ref14 = asyncToGenerator(function* (evt) {

			// If edit is temporary, don't inform the database yet
			if (evt.detail.temporary === true) {
				return;
			}
			console.log('edited annotation, inform database');

			// emitted when user edits text in annotationbox
			doc = yield localProjectDB.get(evt.detail.newAnnotation._id);

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
				default:
					doc.statusColor = 'blue';
					break;
			}

			return localProjectDB.put(doc);
		});

		return function onAnnotationEdit(_x9) {
			return _ref14.apply(this, arguments);
		};
	})(),

	updateElements: (() => {
		var _ref15 = asyncToGenerator(function* (options) {
			if (localProjectDB === undefined) return;

			if (options.updateFile && options.updateFile === true) {
				try {
					let info = yield localProjectDB.get('info');
					let activeTopic = yield localProjectDB.get(info.activeTopic);
					let blob = yield localProjectDB.getAttachment(info.activeTopic, 'file');
					console.log(activeTopic);
					console.log(activeTopic.fileEnding);
					this.renderView.fileName = activeTopic.fileName;
					this.renderView.fileEnding = activeTopic.fileEnding;
					this.renderView.file = blob;
				} catch (err) {
					console.log(err);
				}
			}

			this.annotations = yield this.getAnnotations();
		});

		return function updateElements(_x10) {
			return _ref15.apply(this, arguments);
		};
	})(),

	handleResize: function (event) {
		console.log('resize!');
		if (this.renderView) {
			this.renderView.resize();
		}
	},

	keyUp: function (evt) {
		// if(evt.keyCode === 189){
		// 	console.log('complete reset');
		// 	completeReset();
		// }
	},

	handleCreateProject: (() => {
		var _ref16 = asyncToGenerator(function* () {
			var _this4 = this;

			if ((yield this.updateOnlineStatus()) === false) {
				alert('Error connecting to the database for new Project creation. Please check if you are connected to the internet and try again.');
				return;
			}

			let projectOverlay = document.createElement('project-setup-overlay');
			projectOverlay.classList.add('fullbleed');
			projectOverlay['with-back-drop'] = true;
			projectOverlay['auto-fit-on-attach'] = true;
			Polymer.dom(this.root).appendChild(projectOverlay);

			projectOverlay.addEventListener('iron-overlay-closed', function (e) {
				if (projectOverlay.pageNumber !== 2) return;

				_this4.setNewProject({
					projectname: projectOverlay.projectname,
					topicname: projectOverlay.topicname,
					file: projectOverlay.file,
					emails: ['test@test.test']
				});

				Polymer.dom(_this4.root).removeChild(projectOverlay);
			}, { once: true });
			projectOverlay.open();
		});

		return function handleCreateProject() {
			return _ref16.apply(this, arguments);
		};
	})(),

	updateProjectList: (() => {
		var _ref17 = asyncToGenerator(function* () {
			let doc = yield localInfoDB.get('projectsInfo');
			this.projects = doc.projects;
		});

		return function updateProjectList() {
			return _ref17.apply(this, arguments);
		};
	})(),

	toggleDashboard: function (e) {
		this.$.dashboard.toggle();
		this.$.projectMenuItem.classList.toggle('selected');
		this.$.dashboard.addEventListener('switch-project-click', e => {
			this.$.projectMenuItem.classList.toggle('selected');
		}, { once: true });
	},

	handleSwitchProject: function (e) {
		return this.switchProjectDB(e.detail);
	},

	handleDeleteProject: function (e) {
		this.deleteProjectDB(e.detail);
	},

	resetLocalDB: function (e) {
		// ipc.send('resetLocalDB');
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
		if (this.selectedAnnotation === undefined || this.selectedAnnotation === null) return;
		// this.renderView.focusAnnotation(this.selectedAnnotation);
	},

	toolChanged: function (e) {
		this.objectTool = this.$.toolSelector.selected;
		console.log(this.objectTool);
	}
});
