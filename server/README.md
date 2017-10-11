# How to set up the server
Use atleast Fedora 23.
Install nvm (node version manager) to user (no superuser rights please!).
Then install the stable node version (6.10 at the time of writing).

`nvm install stable`
`nvm use stable`


Then install couchdb via Fedora repos and configure couchdb to use cors, or alternatively use `add-cors-to-couchdb` by the pouchdb devs to add it for you:

```
sudo dnf install couchdb
npm install -g add-cors-to-couchdb
add-cors-to-couchdb
```

After that edit /etc/couchdb/local.ini to have fields from ./local.ini from here(bind=0.0.0.0, public user fields, proper ssl certificates etc.). You should add/edit the following to your `local.ini`:

```
public_fields = surname, prename, color
allow_persistent_cookies = true
users_db_public = true
```


Then route port 80 to 5984
```.sh
sudo firewall-cmd --zone=FedoraServer --add-masquerade --permanent`
sudo firewall-cmd --zone=FedoraServer --add-forward-port=port=80:proto=tcp:toport=5984 --permanent
```


Finally Copy systemd service processannotator.service from [this repo](https://raw.githubusercontent.com/nylki/ProjectAnnotator/master/systemd/system/processannotator.service) into `/etc/systemd/system/` and enable + start it. Before doing this, make sure the pathes (especially to the recent node version match!)
```
sudo cp systemd/system/processannotator.service /etc/systemd/system/processannotator.service
sudo systemctl enable processannotator
sudo systemctl start processannotator
```

Then check if the service is actually running:
`sudo systemctl status processannotator`

If it is green and says it's *running*, then all is fine. If it's red, check if all paths in processannotator.service are correct.
