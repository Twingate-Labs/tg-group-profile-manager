# tg-group-profile-manager
This project deploys a Slackbot that provide Twingate users to manage their own group profile.

Common use cases:
* Switching between environments that share the same IPs or DNS names (e.g. Development, Test, Production environments)
* Switching between resources in different geographic regions

## Prerequisites
1. Slack Workspace (with admin access to deploy)
2. A [Twingate](https://www.twingate.com/) account
3. Ability to deploy a Slackbot (instructions below)

## Set Up Steps
### Slack App Initial Setup
1. Create New Slack app from a manifest [here](https://api.slack.com/apps)
2. Paste the content from [manifest.yaml](https://github.com/Twingate-Labs/tg-group-profile-manager/blob/main/manifest.yml)
3. Install the Slack app to your Workspace
4. Retrieve the signing secret from Basic Info and bot token at OAuth & Permissions

### Deploy on Google CloudRun (CloudRun Button)
1. Ensure you have the following pre-requisites:
    - `SLACK_SECRET` can be found at the page "Basic Information" in Slack API app page
    - `SLACK_BOT_TOKEN` can be found at page "OAuth & Permissions"
    - `TG_API_KEY` can be generated in the Setting page within the Twingate Admin Console (Read and Write Token is required)
    - `TG_ACCOUNT` replace with your Twingate Network Address (e.g. test1.twingate.com)
    - `PROJECT_ID` GCP Project (will be passed to container for it to access secrets)
2. Prepare your profile configuration following the example in [`profile_config.json`](./profile_config.json)
3. Click and follow the steps in GCP CloudShell:

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run?git_repo=https://github.com/Twingate-Labs/tg-group-profile-manager)

The `Run on Google Cloud option` will prompt for all pre-requisite parameters during setup and store them as secrets. For a full description of the executed steps please see [`app.json`](./app.json).

For a manual deployment you may instead follow the [manual instructions](./MANUAL_DEPLOYMENT.md) 

### Finishing Setup in Slack App UI
1. Go to your app at [Slack App UI](https://api.slack.com/apps)
3. Event Subscription
   * Replace the Request URL to `https://{Your tg-group-profile-manager Address}/slack/events`
* Interactivity & Shortcuts
   * Replace the Request URL to `https://{Your tg-group-profile-manager Address}/slack/events`
4. Download the [Twingate Logo](https://github.com/Twingate-Labs/tg-group-profile-manager/blob/main/Twingate%20Logo%20-%20Icon.png) and change the logo of the Slack app at the Basic Info

### Current Limitations & Known Issues
1. When there are Twingate groups with duplicate names, only the first group returned by the Twingate API is used. To prevent this, ensure there are no duplicate group names in the Twingate network.
2. If a user is part of more than 50 Twingate groups, only the first 50 Twingate groups returned by the Twingate API is used. To prevent this, ensure there are no users part of more than 50 groups in the Twingate network.
3. The Slack users' email addresses needs to be the same as their Twingate email address.