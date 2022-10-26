#!/bin/sh
## Import environment variables
set -a
. ./tg-group-profile-manager.conf
set +a

## Tell the container to run as CloudRun
export DEPLOY_ENV=cloudrun

## Import profile config
export PROFILE_CONFIG=$(cat profile_config.json)


## Enable and setup secret manager
gcloud services enable secretmanager.googleapis.com
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT --member=user:$(gcloud auth list --format 'value(account)') --role=roles/secretmanager.admin
echo -n $SLACK_BOT_TOKEN | gcloud secrets create tg-group-profile-manager-bot-token --replication-policy=automatic --data-file=-
echo -n $SLACK_SIGNING_SECRET | gcloud secrets create tg-group-profile-manager-client-signing-secret --replication-policy=automatic --data-file=-
echo -n $TG_API_KEY | gcloud secrets create tg-group-profile-manager-tg-api-key --replication-policy=automatic --data-file=-
echo -n $TG_ACCOUNT | gcloud secrets create tg-group-profile-manager-tg-account --replication-policy=automatic --data-file=-
echo -n $PROFILE_CONFIG | gcloud secrets create tg-group-profile-manager-profile-config --replication-policy=automatic --data-file=-

## Enable CloudRun and build the Docker image
gcloud services enable cloudbuild.googleapis.com
gcloud builds submit --tag gcr.io/${PROJECT_ID}/tg-group-profile-manager .

## Deploy CloudRun
gcloud services enable run.googleapis.com
gcloud config set run/platform managed
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$SERVICE_ACCOUNT --role=roles/secretmanager.secretAccessor
gcloud run deploy tg-group-profile-manager --no-cpu-throttling --allow-unauthenticated --image gcr.io/${PROJECT_ID}/tg-group-profile-manager --set-env-vars PROJECT_ID=${PROJECT_ID}