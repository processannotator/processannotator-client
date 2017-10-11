

# process.annotator

## prerequisites

- nodejs (tested with v1.7.9)
- npm (usually comes with nodejs installations)

## install
Run the following command from the projects root directory:

```
npm install
```

However, to properly function you also have to modify `process-annotator.config.json` to include your correct CouchDB server address information.


## Using the application

For testing purposes you can start the process.annotator with:

```
npm start
```

If you want to create a platform specific bundle (eg. an ".app" under Mac OS) run:

```
npm run package
```

If you want to package for a Linux or Windows, you can modify the `package` script in the `package.json` file, or create a new packaging script.
Should you encounter errors during the packing, try to use a node version <= 1.7.9 / npm version <= 4.0.5 when running `npm run package`.

## Notes and Catches

### Security

As this app was developed as a prototype used only by a small group of people, the user authentication is not in a production state. Each user registration is done with the same token/password (see `setNewProfile` in `main.app.js`). However there are some security measures already in place:

- The CouchDB only allows user registration if a certain entry in the submitted data is present `testkey:testuserkey`. All user registration that don't fullfill this requirement are discarded (See: https://github.com/nylki/ProcessAnnotator/blob/master/server/server.js#L166).
