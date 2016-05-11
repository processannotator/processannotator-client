sudo dnf install couchdb
npm install -g add-cors-to-couchdb
add-cors-to-couchdb
# edit /etc/couchdb/local.ini
# to have fields from ./local.ini from here
# (bind=0.0.0.0, public user fields, etc.)

# then route port 80 to 5984
sudo firewall-cmd --zone=FedoraServer --add-masquerade --permanent
sudo firewall-cmd --zone=FedoraServer --add-forward-port=port=80:proto=tcp:toport=5984 --permanent

# add following design document to _users db
{
  "_id": "_design/no_anonymous_delete",
  "language": "javascript",
  "validate_doc_update": "function(newDoc, oldDoc, userCtx, secObj){ \n    if('_admin' in userCtx.roles) return; // skip anonymous in Admin Party case;\n    if(!userCtx.name && newDoc._deleted){\n      throw({'forbidden': 'auth first before delete something'});\n    }\n}"
}
