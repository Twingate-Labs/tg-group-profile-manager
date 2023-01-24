
### Deploy on Google CloudRun (manual)
1. Open Google [Cloud Shell](https://cloud.google.com/shell)
2. Clone the project `git clone https://github.com/Twingate-Labs/tg-group-profile-manager.git`
3. `cd tg-group-profile-manager`
4. Update `tg-group-profile-manager.conf` with the configuration values described in the [README](../README.md)
5. Update the file `profile_config.json` following the notes in the [schema documentation](./docs/SCHEMA.md)
6. Execute the following commands to deploy CloudRun
```
gcloud config set compute/zone europe-west2-a # change to your preferred zone
gcloud config set run/region europe-west2 # change to your preferred region
export PROJECT_ID=$(gcloud config list --format 'value(core.project)')
export SERVICE_ACCOUNT=$(gcloud iam service-accounts list --format 'value(EMAIL)' --filter 'NAME:Compute Engine default service account')
./cloudrun_setup.sh
```
7. Copy the URL of the Slack app, e.g. `https://tg-group-profile-manager-xxxxx-nw.a.run.app`

### Deploy on Docker
1. Download `tg-group-profile-manager.conf` template [here](../tg-group-profile-manager.conf)
2. Update `tg-group-profile-manager.conf` with the configuration values described in the [README](../README.md)
4. Download and run Docker container `docker run -p 8080:8080 --env-file ./tg-group-profile-manager.conf -d --name tg-group-profile-manager ghcr.io/twingate-labs/tg-group-profile-manager:latest`
5. Now you should have the `tg-group-profile_manager` container running on port 8080

## Deploy on K8S
To install the chart
```shell
$ helm repo add twingate-labs https://twingate-labs.github.io/tg-group-profile-manager-helm/
$ helm install tg-group-profile-manager twingate-labs/tg-group-profile-manager -n [namespace] \
    --set variables.twingateAccount="xxx.twingate.com" \
    --set variables.twingateApiKey="xxx" \
    --set variables.slackSigningSecret="xxx" \
    --set variables.slackBotToken="xoxb-xxx" \
    --set-json='variables.profileConifg={"profiles":[{"profileName":"Example One Of Profile 1","profileType":"oneOf","groups":["Prod","Preprod","Testing"],"applicableToGroup":"Everyone"},{"profileName":"Example One Of Profile 2","profileType":"oneOf","groups":["US","EU","ASIA"],"applicableToGroup":"Everyone"},{"profileName":"Example Self-Serve Business Approvals","profileType":"selfServeApproval","groups":["HR","Finance","Sales"],"timeOptions": ["Forever", "1h", "8h", "24h", "7d", "30d", "90d"],"applicableToGroup":"Everyone","approverGroup":"IT"}, {"profileName":"Example Self-Serve Business Approvals 2","profileType":"selfServeApproval","groups":["HR","Finance","Sales"],"timeOptions": ["Forever", "1h", "8h", "24h"],"applicableToGroup":"Everyone","approverGroup":"IT"}],"groupPermissions":{"Prod":"Admin"}}'
```
For setting up with https/ingress, see [setup with ingress](./WITH_INGRESS.md)

### Deploy on NodeJS
_NodeJS 18+ required_
1. Clone the latest tg group profile manager `git clone https://github.com/Twingate-Labs/tg-group-profile-manager.git`
2. `cd tg-group-profile-manager`
3. Update `tg-group-profile-manager.conf` with the configuration values described in the [README](../README.md)
4. Copy the updated `tg-group-profile-manager.conf` to the file `.env`
5. Run `npm install`
6. Run `node app.mjs`
7. Now you should have the Slackbot running on port 8080
