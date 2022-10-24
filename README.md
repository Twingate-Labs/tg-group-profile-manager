# tg-group-policy-manager
This project deploys a Slackbot which provide Twingate users to manage their own group policy.

## Prerequisite
1. Slack Workspace
2. [Twingate](https://www.twingate.com/) account

## Set Up Steps
### Slack App Initial Setup
1. Create New Slack app from a manifest [here](https://api.slack.com/apps)
2. Paste the content from [manifest.yaml](https://github.com/Twingate-Labs/slack-bot-ext-merge/blob/master/manifest.yml)
3. Install the Slack app to your Workspace
4. Retrieve the signing secret from Basic Info and bot token at OAuth & Permissions

### Deploy as Docker
1. Clone the latest tg group policy manager `git clone https://github.com/Twingate-Labs/tg-group-policy-manager.git`
2. `cd tg-group-policy-manager`
3. Populate `tg-group-policy-manager.conf`
   - `SLACK_SIGNING_SECRET=xxx` can be found at the page "Basic Information" in Slack API app page
   - `SLACK_BOT_TOKEN=xxx` can be found at page "OAuth & Permissions"
   - `TG_API_KEY=xxx` can be generated in the Setting page within the Twingate Admin Console (Read, Write & Provision Token is required)
   - `TG_ACCOUNT=xxx.twingate.com` replace with your Twingate Network Address
4. Build Docker container `docker build . -t tg-group-policy_manager`
5. Run Docker container `docker run -p 8080:8080 -d --name tg-group-policy-manager tg-group-policy-manager`
6. Now you have the `tg-group-policy_manager` running

### Finishing Setup in Slack App UI
1. Go to your app at [Slack App UI](https://api.slack.com/apps)
2. Slack commands
   * Replace the Request URL of all slash commands to `https://slack-bot-ext-merge-xxxxx-nw.a.run.app/slack/events`
3. Event Subscription
   * Replace the Request URL to `https://{Your tg-group-policy_manager Address}/slack/events`
* Interactivity & Shortcuts
   * Replace the Request URL to `https://{Your tg-group-policy_manager Address}/slack/events`
4. Download the [Twingate Logo](https://github.com/Twingate-Labs/slack-bot-ext-merge/blob/master/Twingate%20Logo%20%E2%80%93%C2%A0Icon.png) and change the logo of the Slack app at the Basic Info

### Initial Setup
1. Within your Slack Workspace, type `/twingate_channel_merge_setup`
2. ext-all and ext-partner channels should be created
3. Add the users into the ext-all and ext-partner channels
4. Modify the notification of these two channels based on requirement (e.g. only mention or all messages)
5. The Bot user should start joining all ext- channels
6. For the best User experience, make sure [Share links and set preview preferences](https://slack.com/intl/en-gb/help/articles/204399343-Share-links-and-set-preview-preferences#:~:text=From%20your%20desktop%2C%20click%20on,text%20previews%20of%20linked%20websites.) is enabled.


### Limitations
1. Cannot auto joining the private channels, the bot has to be manually invited
2. User will not be auto invited to the ext-all and ext-partner-all channels, they have to be manually invited