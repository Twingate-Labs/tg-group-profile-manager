# tg-group-profile-manager
This project deploys a Slackbot which provide Twingate users to manage their own group profile.

## Prerequisite
1. Slack Workspace
2. [Twingate](https://www.twingate.com/) account

## Set Up Steps
### Slack App Initial Setup
1. Create New Slack app from a manifest [here](https://api.slack.com/apps)
2. Paste the content from [manifest.yaml](https://github.com/Twingate-Labs/tg-group-profile-manager/blob/main/manifest.yml)
3. Install the Slack app to your Workspace
4. Retrieve the signing secret from Basic Info and bot token at OAuth & Permissions

### (Option 1) Deploy as Docker
1. Clone the latest tg group profile manager `git clone https://github.com/Twingate-Labs/tg-group-profile-manager.git`
2. `cd tg-group-profile-manager`
3. Populate `tg-group-profile-manager.conf`
   - `SLACK_SIGNING_SECRET=xxx` can be found at the page "Basic Information" in Slack API app page
   - `SLACK_BOT_TOKEN=xxx` can be found at page "OAuth & Permissions"
   - `TG_API_KEY=xxx` can be generated in the Setting page within the Twingate Admin Console (Read, Write & Provision Token is required)
   - `TG_ACCOUNT=xxx.twingate.com` replace with your Twingate Network Address
   - `PROFILE_CONFIG` 
     - profiles: List of Object, where each Object defines a group profile
     - profileName: User friendly group profile name
     - groups: List of Twingate groups within the profile which the users can switch to
     - applicableToGroup: A Twingate group which the users within it can access the group profile
   - `DEPLOY_AS_DOCKER=true`
4. Build Docker container `docker build . -t tg-group-profile-manager`
5. Run Docker container `docker run -p 8080:8080 -d --name tg-group-profile-manager tg-group-profile-manager`
6. Now you have the `tg-group-profile_manager` running

### (Option 2) Deploy as Google Cloud Run
1. Open Google Cloud Shell
2. Clone the project `git clone https://github.com/Twingate-Labs/tg-group-profile-manager.git`
3. Setup Google Secrete Manager, replace `{SLACK_BOT_TOKEN}`, `{SLACK_SECRET}`, `{TWINGATE_API_KEY}`, `{TWINGATE_ADDRESS}` in the format of xxx.twingate.com and `{PROFILE_CONFIG}`  with the corresponding values
    - `SLACK_SECRET` can be found at the page "Basic Information" in Slack API app page
    - `SLACK_BOT_TOKEN` can be found at page "OAuth & Permissions"
    - `TG_API_KEY` can be generated in the Setting page within the Twingate Admin Console (Read, Write & Provision Token is required)
    - `TG_ACCOUNT` replace with your Twingate Network Address (e.g. test1.twingate.com)
    - `PROFILE_CONFIG` see example at [tg-group-profile-manager.conf](https://github.com/Twingate-Labs/tg-group-profile-manager/blob/main/tg-group-profile-manager.conf)
        - profiles: List of Object, where each Object defines a group profile
        - profileName: User friendly group profile name
        - groups: List of Twingate groups within the profile which the users can switch to
        - applicableToGroup: A Twingate group which the users within it can access the group profile
```
    export BOT_TOKEN={SLACK_BOT_TOKEN}
    export SIGNING_SECRET={SLACK_SECRET}
    export TG_API_KEY={TWINGATE_API_KEY}
    export TG_ACCOUNT={TWINGATE_ADDRESS}
    export PROFILE_CONFIG='{PROFILE_CONFIG}'
    gcloud services enable secretmanager.googleapis.com
    gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT --member=user:$(gcloud auth list --format 'value(account)') --role=roles/secretmanager.admin
    echo -n $BOT_TOKEN | gcloud secrets create tg-group-profile-manager-bot-token --replication-policy=automatic --data-file=-
    echo -n $SIGNING_SECRET | gcloud secrets create tg-group-profile-manager-client-signing-secret --replication-policy=automatic --data-file=-
    echo -n $TG_API_KEY | gcloud secrets create tg-group-profile-manager-tg-api-key --replication-policy=automatic --data-file=-
    echo -n $TG_ACCOUNT | gcloud secrets create tg-group-profile-manager-tg-account --replication-policy=automatic --data-file=-
    echo -n $PROFILE_CONFIG | gcloud secrets create tg-group-profile-manager-profile-config --replication-policy=automatic --data-file=-
```


4. Enter the following commands to build the Docker image
```
    gcloud config set compute/zone europe-west2-a
    cd tg-group-profile-manager
    sed -i 's/DEPLOY_AS_DOCKER=true/DEPLOY_AS_DOCKER=false/g' tg-group-profile-manager.conf
    export PROJECT_ID=$(gcloud config list --format 'value(core.project)')
    gcloud services enable cloudbuild.googleapis.com
    gcloud builds submit --tag gcr.io/${PROJECT_ID}/tg-group-profile-manager .
```

5. Enter the following commands to deploy the app to Cloud Run
```
    gcloud services enable run.googleapis.com
    gcloud config set run/platform managed
    gcloud config set run/region europe-west2
    export SERVICE_ACCOUNT=$(gcloud iam service-accounts list --format 'value(EMAIL)' --filter 'NAME:Compute Engine default service account')
    gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$SERVICE_ACCOUNT --role=roles/secretmanager.secretAccessor
    gcloud run deploy tg-group-profile-manager --image gcr.io/${PROJECT_ID}/tg-group-profile-manager --set-env-vars PROJECT_ID=${PROJECT_ID}
```

6. Select `Yes` to `Allow unauthenticated invocations to [tg-group-profile-manager]`
7. Copy out the URL of the Slack app, e.g. `https://tg-group-profile-manager-xxxxx-nw.a.run.app`
8. (Optional) Configure Cloud Run
   * The Cloud Run can take between 5-10 seconds to process the switch group requests with the default Cloud Run configuration
   * [CPU is always allocated](https://cloud.google.com/run/docs/configuring/cpu-allocation#setting) can be enabled in Cloud Run to improve performance (to 1-2 seconds)

### Finishing Setup in Slack App UI
1. Go to your app at [Slack App UI](https://api.slack.com/apps)
3. Event Subscription
   * Replace the Request URL to `https://{Your tg-group-profile-manager Address}/slack/events`
* Interactivity & Shortcuts
   * Replace the Request URL to `https://{Your tg-group-profile-manager Address}/slack/events`
4. Download the [Twingate Logo](https://github.com/Twingate-Labs/tg-group-profile-manager/blob/main/Twingate%20Logo%20-%20Icon.png) and change the logo of the Slack app at the Basic Info
