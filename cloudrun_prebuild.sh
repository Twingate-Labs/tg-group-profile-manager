#!/bin/sh
## Import environment variables
## Tell the container to run as CloudRun
export DEPLOY_ENV=cloudrun

export PROJECT_ID=$GOOGLE_CLOUD_PROJECT
gcloud config set run/region "$GOOGLE_CLOUD_REGION"

gcloud config set project "$GOOGLE_CLOUD_PROJECT"
export SERVICE_ACCOUNT=$(gcloud iam service-accounts list --format 'value(EMAIL)' --filter 'NAME:Compute Engine default service account' --project "$PROJECT_ID") ## "NAME:$SERVICE_ACCOUNT_NAME"

# Enable and setup secret manager
gcloud services enable secretmanager.googleapis.com
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member=user:$(gcloud auth list --format 'value(account)') --role=roles/secretmanager.admin
echo -n $SLACK_BOT_TOKEN | gcloud secrets create tg-group-profile-manager-bot-token --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
echo -n $SLACK_SIGNING_SECRET | gcloud secrets create tg-group-profile-manager-client-signing-secret --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
echo -n $TG_API_KEY | gcloud secrets create tg-group-profile-manager-tg-api-key --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
echo -n $TG_ACCOUNT | gcloud secrets create tg-group-profile-manager-tg-account --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
echo -n $PROFILE_CONFIG | gcloud secrets create tg-group-profile-manager-profile-config --project "$PROJECT_ID" --replication-policy=automatic --data-file=-

