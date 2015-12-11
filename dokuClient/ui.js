/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')
var PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-authentication'))
var localDB = new PouchDB('collabdb')
var remoteDB = new PouchDB('http://127.0.0.1:5984/collabdb')
var sync








var db = new PouchDB('http://127.0.0.1:5984/db', {skipSetup: true})
    var db_new
    console.log('first trying to signup user, without login. This should fail with standar user')
    db.login('tom', '***REMOVED***')
    .then( (response, err) => {
      if(response.ok) {
        console.log(response.name, 'succesfully logged in.')
        console.log('now trying to register new DB')
        db_new = new PouchDB('http://127.0.0.1:5984/meganew')
        return db_new
      }
    }).catch((err) => {
			console.log(err)
      if (err.name === 'unauthorized') {
        console.error('login denied.')
        return Promise.reject()
      } else {
        console.error('unknown problem with authentication.')
      }
      return err
    })
    .then((res) => {
      var test_doc = {
        _id: 'somerandomid' + Math.random(),
        title: 'test'
      }
      return db_new.put(test_doc)
    })
    .then((res) => {
      console.log(res)
    }).catch((err) => {
      console.error(err.message, err.reason)
      console.info('the above error is normal and wanted for non-admin users.')
    })









var annotationElements = new Map()

// DOM elements
var imageContainer
var annotationList
var renderView
var activeProfile = undefined
var activeProject = {_id: 'project_1'}
var activeTopic = {_id: 'topic_1'}

function addProject(file) {
	// first create DB entry for new project
	// then create a new topic from file/.. which belongs to the newly created project
	return localDB.put({
		_id: 'project_' + 1,
		type: 'project',
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a project title',
		description: 'a description to a project'
	})
	.then(localDB.get('project' + 1))
	.then((newProject) => {
		activeProject = newProject
		return addNewTopic(file)
	})
	// finally return the new projects object
	.then(() => activeProject)
	.catch((err) => {
		console.error('error creating new project in DB', err)
	})


}

function addTopic() {
	// add new topic to active project
	return localDB.put({
		_id: 'topic_' + 1,
		type: 'topic',
		parentProject: activeProject._id,
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: 'a description to a topic'
	})
}

function addAnnotation({description='', position={x: 0, y: 0, z: 0}, polygon=[]}) {
	let annotation = {
		_id: 'annotation_' + new Date().toISOString(),
		type: 'annotation',
		parentProject: activeProject._id,
		parentTopic: activeTopic._id,
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: description,
		position: position,
		polygon: polygon
	}

	console.log('put annotation into DB')
	return localDB.put(annotation)
}

function loadPreferences() {

	return localDB.get('_local/lastSession').then(preferences => {
		// now get the actual profile via ID from database
		console.log(preferences)
		console.log('preferences.activeProfile_id', preferences.activeProfile_id)
		return localDB.get(preferences.activeProfile_id).then(profile => {
			activeProfile = profile

		}).catch((err) => {
			console.error(err)
			activeProfile = undefined
		})

		// activeProject = preferences.activeProject !== undefined ? preferences.activeProject : undefined
		// activeTopic = preferences.activeTopic !== undefined ? preferences.activeTopic : undefined

	}).catch((err) => {
		if(err.message === 'missing'){
			return localDB.put({
				_id: '_local/lastSession',
				activeProfile: '',
				activeProject: '',
				activeTopic: ''
			})
		}
	})

}

function savePreferences() {
	// _local/lastSession should exist because loadPreferences creates the doc
	localDB.get('_local/lastSession')
	.then(doc => {
		doc.activeProfile_id = activeProfile._id
		doc.activeProject = activeProject
		doc.activeTopic = activeTopic
		return localDB.put(doc)
	}
).then(localDB.get('_local/lastSession'))

}

function setNewProfile({prename, surname, email, color}) {

	let newProfile = {
		_id: 'profile_' + Math.random(),
		type: 'userProfile',
		surname: surname,
		prename: prename,
		email: email,
		color: color,
		creationDate: new Date().toISOString()
	}
	// put the new profile into the database
	localDB.put(newProfile).then(() => {

		// then update the active profile to the new profile
		activeProfile = newProfile

		// and save preferences
		return savePreferences()
	})
}


function removeAnnotationElements(id) {
	// get DOM objects belonging to id
	let [annotationBox] = annotationElements.get(id)
	// annotationPoint.parentNode.removeChild(annotationPoint)
	annotationBox.parentNode.removeChild(annotationBox)
}


function addElementsForAnnotation(annotation){
	// add both, annotation box and annotation point to DOM
	// only handle creation of DOM element, actual DB updates
	// are done independently
	// TODO: also create 3D Labels here??
	//
	let annotationBox = document.createElement('annotation-box')
	annotationBox.annotation = annotation

	if (annotation.position.x === undefined) {
		throw Error('position.x === undefined', annotation)
	}

	annotationList.appendChild(annotationBox)
	annotationElements.set(annotation._id, [/*annotationPoint,*/ annotationBox])
}


function fetchAnnotations() {

	return localDB.allDocs({
		include_docs: true,
		attachments: true,
		startkey: 'annotation', /* using startkey and endkey is faster than querying by type */
		endkey: 'annotation\uffff' /* and keeps the cod more readable  */
	})
	.then(result => {
		// now fetch the profile of the annotation creator
		// and append it to the annotation object to be used by the app (color of annotation etc.)

		let fetchedProfiles = []
		for (let {doc} of result.rows) {

			fetchedProfiles.push(
				localDB.get(doc.creator).then(profile => {
					doc.creatorProfile = profile
					return doc
				}).catch(err => console.error(err))
			)

		}
		return Promise.all(fetchedProfiles)
	})
	.catch(err => console.error('error fetching annotations', err))
}

function rebuildAnnotationElements() {
	// this function removes all created representations for annotations
	// and re-creates and appends them to the view

	return fetchAnnotations().then( function(annotations) {

		// first clean old annotation elements
		for (let id of annotationElements.keys()) {
			removeAnnotationElements(id)
		}

		// then add new annotation elements to the list
		// FIXME: outsource this to the annotationlist element
		for (let annotation of annotations) {
			addElementsForAnnotation(annotation)
		}

		// then add annotations to renderview and let it render them in threedimensional space
		renderView.annotations = annotations


	})
}


var alertOnlineStatus = function() {
	// window.alert(navigator.onLine ? 'online' : 'offline')
}

function handleResize(event) {
	if(renderView) {
		renderView.resize()
	}
}

window.addEventListener('online', alertOnlineStatus)
window.addEventListener('offline', alertOnlineStatus)
window.addEventListener('resize', handleResize)



function init() {
	let profileOverlay = document.querySelector('#profileSetupOverlay')
	loadPreferences().then(preferences => {
		// if after loading the preferences, no profile was found
		if(activeProfile === undefined){
			console.log('NO ACTIVE PROFILE!!')
			profileOverlay.addEventListener('iron-overlay-closed', (e) => {
				setNewProfile({
					prename: profileOverlay.prename,
					surname: profileOverlay.surname,
					color: profileOverlay.color,
					email: profileOverlay.email
				})
			})
			profileOverlay.open()
		} else {
			console.log('active profile:', activeProfile)
			rebuildAnnotationElements()
		}
	}).then(() => {

		imageContainer = document.querySelector('.object-view')
		annotationList = document.querySelector('.annotation-list')
		renderView = document.querySelector('render-view')

		// perhaps also on change localDB to rebuildAnnotation elements?
		sync = PouchDB.sync(localDB, remoteDB, {
			live: true,
			retry: true
		}).on('change', function(info) {
			console.log('sync change!!')
			console.log('TODO: now sync all DOM elements...')
			rebuildAnnotationElements()


		}).on('paused', () => {
			console.log('sync pause')

			// replication paused (e.g. user went offline)
		}).on('active', () => {
			console.log('sync active')

			// replicate resumed (e.g. user went back online)
		}).on('denied', info => {
			console.log('sync denied')

			// a document failed to replicate, e.g. due to permissions
		}).on('complete', info => {
			console.log('sync complete')
			// handle complete
		}).on('error', err => {
			console.log('sync error')

			// handle error
		})

		localDB.info().then((result) => {
			console.log('localDB info:', result)

			// update the renderView with new annotation
			renderView.addEventListener('initialized', () => {
				rebuildAnnotationElements()
			})

		})
	})



}


init()




/////////////////////////////////////////////
// OLD STUFF down there. maybe useful later!?
/////////////////////////////////////////////

// ipc.on('someNotification', function(annotation, status) {
// 	console.log('annotation with image arrived')
// })
